'use strict';

const { ensureWorkstationModel, normalizeWorkspaceId } = require('./workstations.js');

const DEFAULT_HYPRCTL = 'hyprctl';

function buildHyprlandCommandPlan(policyInput, workstationInput = {}, options = {}) {
  const model = ensureWorkstationModel(workstationInput);
  const policy = policyInput || {};
  const commands = [];
  const warnings = [...asArray(policy.warnings)];
  const hyprctl = String(firstDefined(options.hyprctl, DEFAULT_HYPRCTL));

  if (!policy || policy.active === false) {
    return finalizePlan({ policy, commands, warnings });
  }

  if (isAwayFromDeskPolicy(policy)) {
    commands.push(
      placeholderCommand({
        action: 'away-from-desk',
        id: 'away-from-desk',
        reason: 'away-from-desk policy intentionally has no Hyprland side effects',
        blockedWorkstations: readArray(policy, ['blocked', 'workstations']),
        blockedWorkspaces: readArray(policy, ['blocked', 'workspaces']),
      })
    );

    return finalizePlan({ policy, commands, warnings });
  }

  const workspaceRecords = collectWorkspaceRecords(policy, model, options, warnings);

  for (const record of workspaceRecords) {
    commands.push(workspaceMonitorRuleCommand(hyprctl, record));
  }

  for (const record of workspaceRecords) {
    commands.push(moveWorkspaceToMonitorCommand(hyprctl, record));
  }

  const focusRecord = chooseFocusRecord(policy, model, workspaceRecords, options, warnings);

  if (focusRecord) {
    commands.push(focusMonitorCommand(hyprctl, focusRecord));
    commands.push(workspaceCommand(hyprctl, focusRecord));
  }

  for (const action of readActions(policy, 'workspaceActions')) {
    const record = workspaceRecordForAction(action, model, warnings);
    if (record) {
      commands.push(workspaceCommand(hyprctl, record, action));
    } else {
      commands.push(
        placeholderCommand({
          action: 'workspace-action',
          id: action.id || action.name || null,
          reason: 'workspace action did not resolve to a known workspace',
          payload: clonePlain(action),
        })
      );
    }
  }

  for (const action of readActions(policy, 'startApps')) {
    commands.push(appPlaceholderCommand('start-app', action));
  }

  for (const action of readActions(policy, 'focusApps')) {
    commands.push(appPlaceholderCommand('focus-app', action));
  }

  return finalizePlan({ policy, commands, warnings });
}

function executeHyprlandPlan(planOrCommands, options = {}) {
  const commands = Array.isArray(planOrCommands)
    ? planOrCommands
    : asArray(planOrCommands && planOrCommands.commands);
  const executableCommands = commands.filter(isExecutableCommand);

  if (options.execute !== true || executableCommands.length === 0) {
    return {
      execute: false,
      executed: false,
      dryRun: true,
      commandCount: commands.length,
      executableCommandCount: executableCommands.length,
      shellCommands: commandsToShell(commands),
      results: commands.map((command) => ({
        id: command.id || null,
        action: command.action || null,
        executed: false,
        skipped: true,
        reason: options.execute === true ? 'command is not executable' : 'execute:true not passed',
      })),
    };
  }

  const childProcess = require('node:child_process');
  const results = [];

  for (const command of commands) {
    if (!isExecutableCommand(command)) {
      results.push({
        id: command.id || null,
        action: command.action || null,
        executed: false,
        skipped: true,
        reason: 'command is not executable',
      });
      continue;
    }

    const child = childProcess.spawnSync(command.argv[0], command.argv.slice(1), {
      encoding: 'utf8',
      ...options.spawnOptions,
    });

    const result = {
      id: command.id || null,
      action: command.action || null,
      executed: true,
      skipped: false,
      status: child.status,
      signal: child.signal,
      stdout: child.stdout || '',
      stderr: child.stderr || '',
      error: child.error ? child.error.message : null,
    };

    results.push(result);

    if (options.throwOnError && (child.error || child.status !== 0)) {
      const detail = child.error ? child.error.message : child.stderr || child.stdout || 'command failed';
      throw new Error(`${commandToShell(command)} failed: ${detail}`);
    }
  }

  return {
    execute: true,
    executed: true,
    dryRun: false,
    commandCount: commands.length,
    executableCommandCount: executableCommands.length,
    shellCommands: commandsToShell(commands),
    results,
  };
}

function commandsToShell(commands) {
  return asArray(commands).map(commandToShell).filter(Boolean);
}

function commandToShell(commandOrArgv) {
  const argv = Array.isArray(commandOrArgv) ? commandOrArgv : commandOrArgv && commandOrArgv.argv;
  if (!Array.isArray(argv)) return null;
  return argv.map(shellEscape).join(' ');
}

function shellEscape(value) {
  const text = String(value);

  if (text.length === 0) {
    return "''";
  }

  if (/^[A-Za-z0-9_/:.,=+@%-]+$/.test(text)) {
    return text;
  }

  return `'${text.replace(/'/g, `'\"'\"'`)}'`;
}

function collectWorkspaceRecords(policy, model, options, warnings) {
  const workspaceIds = uniqueWorkspaceIds([
    ...asArray(options.workspaceIds),
    ...readArray(policy, ['lock', 'workspaceIds']),
    ...readArray(policy, ['allowed', 'workspaces']),
    ...readActionWorkspaceIds(policy),
  ]);

  return workspaceIds.flatMap((workspaceId) => {
    const record = model.workspaceById[String(normalizeWorkspaceId(workspaceId))];
    if (!record) {
      warnings.push(`Hyprland adapter cannot map unknown workspace: ${String(workspaceId)}`);
      return [];
    }

    if (!record.workspace.monitor) {
      warnings.push(`Hyprland adapter workspace has no monitor: ${String(workspaceId)}`);
      return [];
    }

    return [record];
  });
}

function chooseFocusRecord(policy, model, fallbackRecords, options, warnings) {
  const explicitWorkspaceId = firstDefined(options.focusWorkspaceId, policy.focusWorkspaceId);
  if (explicitWorkspaceId !== undefined && explicitWorkspaceId !== null) {
    return workspaceRecordForId(explicitWorkspaceId, model, warnings);
  }

  const workstationId = firstDefined(options.focusWorkstationId, policy.focusWorkstationId);
  if (workstationId !== undefined && workstationId !== null) {
    const workstation = model.byId[String(workstationId)];
    if (!workstation) {
      warnings.push(`Hyprland adapter cannot focus unknown workstation: ${String(workstationId)}`);
      return fallbackRecords[0] || null;
    }

    return workstation.hdmiWorkspaces[0]
      ? workspaceRecordForId(workstation.hdmiWorkspaces[0].id, model, warnings)
      : workspaceRecordForId(workstation.workspaces[0] && workstation.workspaces[0].id, model, warnings);
  }

  return fallbackRecords[0] || null;
}

function workspaceRecordForAction(action, model, warnings) {
  const workspaceId = firstDefined(action.workspaceId, action.workspace);
  if (workspaceId === undefined || workspaceId === null) return null;
  return workspaceRecordForId(workspaceId, model, warnings);
}

function workspaceRecordForId(workspaceId, model, warnings) {
  if (workspaceId === undefined || workspaceId === null) return null;

  const normalized = normalizeWorkspaceId(workspaceId);
  const record = model.workspaceById[String(normalized)];

  if (!record) {
    warnings.push(`Hyprland adapter cannot map unknown workspace: ${String(workspaceId)}`);
    return null;
  }

  return record;
}

function workspaceMonitorRuleCommand(hyprctl, record) {
  const workspaceId = record.workspace.id;
  const monitor = record.workspace.monitor;
  const value = `${workspaceId},monitor:${monitor}`;

  return hyprctlCommand({
    id: `workspace-rule:${workspaceId}`,
    action: 'workspace-monitor-rule',
    family: 'keyword',
    argv: [hyprctl, 'keyword', 'workspace', value],
    workspaceId,
    monitor,
    workstationId: record.workstationId,
    reason: 'bind workspace to monitor through a dynamic workspace keyword rule',
  });
}

function moveWorkspaceToMonitorCommand(hyprctl, record) {
  const workspaceId = record.workspace.id;
  const monitor = record.workspace.monitor;

  return hyprctlCommand({
    id: `move-workspace:${workspaceId}`,
    action: 'moveworkspacetomonitor',
    family: 'dispatch',
    dispatcher: 'moveworkspacetomonitor',
    argv: [hyprctl, 'dispatch', 'moveworkspacetomonitor', String(workspaceId), monitor],
    workspaceId,
    monitor,
    workstationId: record.workstationId,
    reason: 'move an existing workspace to its configured monitor immediately',
  });
}

function focusMonitorCommand(hyprctl, record) {
  const monitor = record.workspace.monitor;

  return hyprctlCommand({
    id: `focus-monitor:${monitor}`,
    action: 'focusmonitor',
    family: 'dispatch',
    dispatcher: 'focusmonitor',
    argv: [hyprctl, 'dispatch', 'focusmonitor', monitor],
    workspaceId: record.workspace.id,
    monitor,
    workstationId: record.workstationId,
    reason: 'focus the monitor that owns the target workspace',
  });
}

function workspaceCommand(hyprctl, record, action = {}) {
  const workspaceId = firstDefined(action.workspaceId, action.workspace, record.workspace.id);

  return hyprctlCommand({
    id: action.id ? `workspace:${action.id}` : `workspace:${workspaceId}`,
    action: 'workspace',
    family: 'dispatch',
    dispatcher: 'workspace',
    argv: [hyprctl, 'dispatch', 'workspace', String(workspaceId)],
    workspaceId: normalizeWorkspaceId(workspaceId),
    monitor: record.workspace.monitor,
    workstationId: record.workstationId,
    reason: action.reason || 'focus the target workspace',
  });
}

function hyprctlCommand(fields) {
  const command = {
    type: 'hyprctl',
    executable: true,
    ...fields,
  };

  command.shell = commandToShell(command);
  return command;
}

function appPlaceholderCommand(actionName, action) {
  const id = action.id || action.name || action.command || action.match || actionName;

  return placeholderCommand({
    action: actionName,
    id,
    reason:
      actionName === 'start-app'
        ? 'app start is recorded for a future launcher layer and is not spawned by this adapter'
        : 'app focus is recorded for a future window matcher layer and is not dispatched by this adapter',
    command: action.command || null,
    match: action.match || null,
    workspaceId: action.workspaceId === undefined ? null : normalizeWorkspaceId(action.workspaceId),
    workstationId: action.workstationId || null,
    payload: clonePlain(action),
  });
}

function placeholderCommand(fields) {
  return {
    type: 'placeholder',
    executable: false,
    shell: null,
    ...fields,
  };
}

function finalizePlan({ policy, commands, warnings }) {
  return {
    type: 'hyprland-command-plan',
    adapter: 'lualand-hyprland-adapter',
    dryRun: true,
    execute: false,
    policy: {
      active: Boolean(policy && policy.active),
      blockId: policy ? policy.blockId || null : null,
      title: policy ? policy.title || null : null,
      awayFromDesk: Boolean(policy && policy.awayFromDesk),
      lockMode: policy && policy.lock ? policy.lock.mode : null,
      focusWorkstationId: policy ? policy.focusWorkstationId || null : null,
    },
    commandCount: commands.length,
    executableCommandCount: commands.filter(isExecutableCommand).length,
    commands,
    shellCommands: commandsToShell(commands),
    warnings,
  };
}

function isExecutableCommand(command) {
  return Boolean(command && command.executable === true && Array.isArray(command.argv));
}

function isAwayFromDeskPolicy(policy) {
  return Boolean(policy.awayFromDesk || (policy.lock && policy.lock.mode === 'away-from-desk'));
}

function readActionWorkspaceIds(policy) {
  const ids = [];

  for (const name of ['startApps', 'focusApps', 'workspaceActions']) {
    for (const action of readActions(policy, name)) {
      const workspaceId = firstDefined(action.workspaceId, action.workspace);
      if (workspaceId !== undefined && workspaceId !== null) ids.push(workspaceId);
    }
  }

  return ids;
}

function readActions(policy, name) {
  const actions = policy && policy.actions && Array.isArray(policy.actions[name]) ? policy.actions[name] : [];
  return actions.map((action) => (action && typeof action === 'object' ? action : { id: String(action) }));
}

function readArray(object, path) {
  let current = object;
  for (const segment of path) {
    if (!current || typeof current !== 'object') return [];
    current = current[segment];
  }

  return asArray(current);
}

function uniqueWorkspaceIds(values) {
  const seen = new Set();
  const result = [];

  for (const value of values) {
    if (value === undefined || value === null) continue;
    const normalized = normalizeWorkspaceId(value);
    const key = String(normalized);
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(normalized);
  }

  return result;
}

function clonePlain(value) {
  return JSON.parse(JSON.stringify(value));
}

function asArray(value) {
  if (value === undefined || value === null) return [];
  return Array.isArray(value) ? value : [value];
}

function firstDefined(...values) {
  for (const value of values) {
    if (value !== undefined) return value;
  }

  return undefined;
}

module.exports = {
  buildHyprlandCommandPlan,
  buildHyprlandPlan: buildHyprlandCommandPlan,
  commandToShell,
  commandsToShell,
  executeHyprlandPlan,
  shellEscape,
};
