'use strict';

const fs = require('node:fs');
const path = require('node:path');
const childProcess = require('node:child_process');

const DEFAULT_HYPRCTL = 'hyprctl';
const DEFAULT_MIRROR_OFFSET = 10000;
const DEFAULT_RUNTIME_DIRS = ['/tmp/hypr'];

const ROLE_DEFINITIONS = {
  laptop: {
    role: 'laptop',
    label: 'laptop/eDP',
    family: 'eDP',
    portion: 'built-in',
  },
  work_main: {
    role: 'work_main',
    label: 'work_main HDMI 3/4',
    family: 'HDMI',
    portion: '3/4',
  },
  side_panel: {
    role: 'side_panel',
    label: 'side_panel HDMI 1/4',
    family: 'HDMI',
    portion: '1/4',
  },
};

function buildWorkstationCommandPlan(input = {}, options = {}) {
  const hyprctl = String(firstDefined(options.hyprctl, input.hyprctl, DEFAULT_HYPRCTL));
  const mirrorOffset = integer(firstDefined(options.mirrorOffset, input.mirrorOffset, DEFAULT_MIRROR_OFFSET));
  const roles = normalizeMonitorRoles(firstDefined(input.monitorRoles, options.monitorRoles, {}));
  const relativeWorkspaceIds = normalizeRelativeWorkspaceIds(
    firstDefined(input.relativeWorkspaceIds, input.workspaces, input.workspaceIds, [1])
  );
  const baseWorkspaceId = input.baseWorkspaceId === undefined ? null : integer(input.baseWorkspaceId);
  const commands = [];
  const warnings = [];
  const signature = firstDefined(options.signature, input.signature, null);
  const workstationId = input.workstationId || input.id || 'workstation';

  for (const relativeId of relativeWorkspaceIds) {
    const workspaceId = resolveWorkspaceId(relativeId, baseWorkspaceId);
    const mirrorWorkspaceId = workspaceId + mirrorOffset;

    commands.push(workspaceMonitorRuleCommand(hyprctl, workspaceId, roles.work_main, {
      signature,
      workstationId,
      relativeWorkspaceId: relativeId,
      role: 'work_main',
    }));
    commands.push(moveWorkspaceToMonitorCommand(hyprctl, workspaceId, roles.work_main, {
      signature,
      workstationId,
      relativeWorkspaceId: relativeId,
      role: 'work_main',
    }));
    commands.push(workspaceMonitorRuleCommand(hyprctl, mirrorWorkspaceId, roles.laptop, {
      signature,
      workstationId,
      relativeWorkspaceId: relativeId,
      role: 'laptop',
      mirrorOfWorkspaceId: workspaceId,
    }));
    commands.push(moveWorkspaceToMonitorCommand(hyprctl, mirrorWorkspaceId, roles.laptop, {
      signature,
      workstationId,
      relativeWorkspaceId: relativeId,
      role: 'laptop',
      mirrorOfWorkspaceId: workspaceId,
    }));
  }

  const sideWorkspaceIds = asArray(input.sideWorkspaceIds || input.sidePanelWorkspaceIds);
  for (const sideWorkspaceId of sideWorkspaceIds) {
    commands.push(workspaceMonitorRuleCommand(hyprctl, integer(sideWorkspaceId), roles.side_panel, {
      signature,
      workstationId,
      role: 'side_panel',
      reason: 'explicit side-panel workspace pin',
    }));
  }

  if (!roles.side_panel) {
    warnings.push('No side_panel monitor role was resolved for HDMI 1/4 planning');
  }

  return finalizePlan({
    kind: 'workstation',
    commands,
    warnings,
    metadata: {
      workstationId,
      relativeWorkspaceIds,
      sideWorkspaceIds: sideWorkspaceIds.map(integer),
      baseWorkspaceId,
      mirrorOffset,
      monitorRoles: roles,
    },
  });
}

function buildSpawnOnMonitorPlan(input = {}, options = {}) {
  const hyprctl = String(firstDefined(options.hyprctl, input.hyprctl, DEFAULT_HYPRCTL));
  const roles = normalizeMonitorRoles(firstDefined(input.monitorRoles, options.monitorRoles, {}));
  const role = input.role || input.monitorRole || 'work_main';
  const monitor = firstDefined(input.monitor, roles[role], roles.work_main);
  const command = String(firstDefined(input.command, 'notion-app'));
  const appId = String(firstDefined(input.id, input.appId, command.split(/\s+/)[0] || 'app'));
  const workspaceId =
    input.workspaceId === undefined
      ? null
      : resolveWorkspaceId(input.workspaceId, input.baseWorkspaceId === undefined ? null : integer(input.baseWorkspaceId));
  const signature = firstDefined(options.signature, input.signature, null);
  const execRules = [`monitor ${monitor}`];

  if (workspaceId !== null) {
    execRules.unshift(`workspace ${workspaceId} silent`);
  }

  const argv = [hyprctl, 'dispatch', 'exec', `[${execRules.join('; ')}] ${command}`];
  const spawn = hyprctlCommand({
    id: `spawn:${appId}`,
    action: 'spawn-on-monitor',
    family: 'dispatch',
    dispatcher: 'exec',
    argv,
    env: commandEnv(signature),
    monitor,
    role,
    workspaceId,
    appId,
    command,
    reason: `spawn ${appId} on ${role} (${monitor})`,
  });

  return finalizePlan({
    kind: 'spawn-on-monitor',
    commands: [spawn],
    warnings: [],
    metadata: {
      appId,
      command,
      monitor,
      role,
      workspaceId,
      monitorRoles: roles,
    },
  });
}

function resolveMonitorRolesFromHyprctl(monitors) {
  return normalizeMonitorRoles(resolveMonitorRoles(monitors));
}

function resolveMonitorRoles(monitors = []) {
  const normalized = asArray(monitors)
    .filter((monitor) => monitor && monitor.disabled !== true)
    .map(normalizeMonitorRecord);

  const roles = {};
  const splitHdmi = normalized.filter((monitor) => monitor.family === 'HDMI' && monitor.splitIndex !== null);
  const hdmi = normalized.filter((monitor) => monitor.family === 'HDMI');
  const sortedSplitHdmi = sortByGeometry(splitHdmi);

  roles.laptop = pickMonitorName(normalized.find((monitor) => monitor.family === 'eDP'));

  if (sortedSplitHdmi.length >= 2) {
    const byWidth = [...sortedSplitHdmi].sort((a, b) => b.width - a.width || a.x - b.x);
    const workMain = byWidth[0];
    const sidePanel =
      sortedSplitHdmi
        .filter((monitor) => monitor.name !== workMain.name)
        .sort((a, b) => b.x - a.x || a.width - b.width)[0] || byWidth[1];

    roles.work_main = pickMonitorName(workMain);
    roles.side_panel = pickMonitorName(sidePanel);
  }

  if (!roles.side_panel && hdmi.length > 1) {
    roles.side_panel = pickMonitorName(sortByGeometry(hdmi).at(-1));
  }

  if (!roles.work_main) {
    const sortedHdmi = sortByGeometry(hdmi);
    roles.work_main = pickMonitorName(sortedHdmi.find((monitor) => monitor.name !== roles.side_panel) || sortedHdmi[0]);
  }

  return {
    laptop: roles.laptop || null,
    side_panel: roles.side_panel || null,
    work_main: roles.work_main || null,
  };
}

function normalizeMonitorRoles(input = {}) {
  const roles = {
    laptop: firstDefined(input.laptop, input.edp, input.eDP, null),
    work_main: firstDefined(input.work_main, input.workMain, input.main, input.hdmiMain, null),
    side_panel: firstDefined(input.side_panel, input.sidePanel, input.right, input.hdmiSide, null),
  };

  return {
    laptop: roles.laptop ? String(roles.laptop) : 'eDP-1',
    work_main: roles.work_main ? String(roles.work_main) : 'HDMI-A-1~1',
    side_panel: roles.side_panel ? String(roles.side_panel) : 'HDMI-A-1~2',
  };
}

function detectActiveHyprlandInstance(options = {}) {
  const hyprctl = String(firstDefined(options.hyprctl, DEFAULT_HYPRCTL));
  const env = { ...process.env, ...(options.env || {}) };
  const runner = options.runner || spawnHyprctlJson;
  const staleSignature = env.HYPRLAND_INSTANCE_SIGNATURE || null;

  if (staleSignature) {
    const current = readHyprctlJson('monitors', {
      hyprctl,
      signature: staleSignature,
      runner,
      env,
    });

    if (current.ok) {
      return {
        signature: staleSignature,
        source: 'env',
        staleEnv: false,
        monitors: current.json,
        monitorRoles: resolveMonitorRolesFromHyprctl(current.json),
      };
    }
  }

  for (const signature of listHyprlandInstanceSignatures(options)) {
    if (signature === staleSignature) continue;

    const candidate = readHyprctlJson('monitors', {
      hyprctl,
      signature,
      runner,
      env,
    });

    if (candidate.ok) {
      return {
        signature,
        source: 'runtime-scan',
        staleEnv: Boolean(staleSignature && staleSignature !== signature),
        staleSignature,
        monitors: candidate.json,
        monitorRoles: resolveMonitorRolesFromHyprctl(candidate.json),
      };
    }
  }

  return {
    signature: staleSignature,
    source: staleSignature ? 'stale-env' : 'not-found',
    staleEnv: Boolean(staleSignature),
    monitors: [],
    monitorRoles: normalizeMonitorRoles({}),
  };
}

function readLiveHyprctlState(options = {}) {
  const detected = detectActiveHyprlandInstance(options);

  if (!detected.signature) {
    return detected;
  }

  const hyprctl = String(firstDefined(options.hyprctl, DEFAULT_HYPRCTL));
  const runner = options.runner || spawnHyprctlJson;
  const env = { ...process.env, ...(options.env || {}) };
  const workspaces = readHyprctlJson('workspaces', {
    hyprctl,
    signature: detected.signature,
    runner,
    env,
  });
  const clients = readHyprctlJson('clients', {
    hyprctl,
    signature: detected.signature,
    runner,
    env,
  });

  return {
    ...detected,
    workspaces: workspaces.ok ? workspaces.json : [],
    clients: clients.ok ? clients.json : [],
  };
}

function listHyprlandInstanceSignatures(options = {}) {
  if (Array.isArray(options.signatures)) {
    return options.signatures.map(String);
  }

  const runtimeDirs = asArray(firstDefined(options.runtimeDirs, DEFAULT_RUNTIME_DIRS));
  const signatures = [];

  for (const runtimeDir of runtimeDirs) {
    let entries = [];
    try {
      entries = fs.readdirSync(runtimeDir, { withFileTypes: true });
    } catch {
      continue;
    }

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const signature = entry.name;
      const socketPath = path.join(runtimeDir, signature, '.socket.sock');
      if (fs.existsSync(socketPath)) signatures.push(signature);
    }
  }

  return signatures;
}

function readHyprctlJson(resource, options = {}) {
  try {
    const result = options.runner({
      hyprctl: options.hyprctl || DEFAULT_HYPRCTL,
      resource,
      signature: options.signature || null,
      env: options.env || process.env,
    });

    if (!result || result.status !== 0) {
      return {
        ok: false,
        status: result ? result.status : null,
        stderr: result ? result.stderr || '' : '',
        json: null,
      };
    }

    return {
      ok: true,
      status: result.status,
      stderr: result.stderr || '',
      json: JSON.parse(result.stdout || 'null'),
    };
  } catch (error) {
    return {
      ok: false,
      status: null,
      stderr: error.message,
      json: null,
    };
  }
}

function spawnHyprctlJson({ hyprctl, resource, signature, env }) {
  const child = childProcess.spawnSync(hyprctl, ['-j', resource], {
    encoding: 'utf8',
    env: {
      ...env,
      ...(signature ? { HYPRLAND_INSTANCE_SIGNATURE: signature } : {}),
    },
  });

  return {
    status: child.status,
    stdout: child.stdout || '',
    stderr: child.stderr || '',
  };
}

function executeHyprlandPlan(planOrCommands, options = {}) {
  const commands = Array.isArray(planOrCommands)
    ? planOrCommands
    : asArray(planOrCommands && planOrCommands.commands);
  const executableCommands = commands.filter(isExecutableCommand);

  if (options.execute !== true) {
    return dryExecution(commands, executableCommands, 'execute:true not passed');
  }

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
      env: {
        ...process.env,
        ...(command.env || {}),
        ...((options.spawnOptions && options.spawnOptions.env) || {}),
      },
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

function dryExecution(commands, executableCommands, reason) {
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
      reason,
    })),
  };
}

function workspaceMonitorRuleCommand(hyprctl, workspaceId, monitor, fields = {}) {
  return hyprctlCommand({
    id: `workspace-rule:${workspaceId}`,
    action: 'workspace-monitor-rule',
    family: 'keyword',
    argv: [hyprctl, 'keyword', 'workspace', `${workspaceId},monitor:${monitor}`],
    env: commandEnv(fields.signature),
    workspaceId,
    monitor,
    reason: fields.reason || `bind workspace ${workspaceId} to ${monitor}`,
    ...withoutSignature(fields),
  });
}

function moveWorkspaceToMonitorCommand(hyprctl, workspaceId, monitor, fields = {}) {
  return hyprctlCommand({
    id: `move-workspace:${workspaceId}`,
    action: 'moveworkspacetomonitor',
    family: 'dispatch',
    dispatcher: 'moveworkspacetomonitor',
    argv: [hyprctl, 'dispatch', 'moveworkspacetomonitor', String(workspaceId), monitor],
    env: commandEnv(fields.signature),
    workspaceId,
    monitor,
    reason: fields.reason || `move workspace ${workspaceId} to ${monitor}`,
    ...withoutSignature(fields),
  });
}

function focusMonitorCommand(hyprctl, monitor, fields = {}) {
  return hyprctlCommand({
    id: `focus-monitor:${monitor}`,
    action: 'focusmonitor',
    family: 'dispatch',
    dispatcher: 'focusmonitor',
    argv: [hyprctl, 'dispatch', 'focusmonitor', monitor],
    env: commandEnv(fields.signature),
    monitor,
    reason: fields.reason || `focus monitor ${monitor}`,
    ...withoutSignature(fields),
  });
}

function workspaceCommand(hyprctl, workspaceId, fields = {}) {
  return hyprctlCommand({
    id: `workspace:${workspaceId}`,
    action: 'workspace',
    family: 'dispatch',
    dispatcher: 'workspace',
    argv: [hyprctl, 'dispatch', 'workspace', String(workspaceId)],
    env: commandEnv(fields.signature),
    workspaceId,
    reason: fields.reason || `focus workspace ${workspaceId}`,
    ...withoutSignature(fields),
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

function finalizePlan({ kind, commands, warnings, metadata }) {
  return {
    type: 'hyprland-command-plan',
    adapter: 'lualand-next-hyprland-adapter',
    kind,
    dryRun: true,
    execute: false,
    commandCount: commands.length,
    executableCommandCount: commands.filter(isExecutableCommand).length,
    commands,
    shellCommands: commandsToShell(commands),
    warnings,
    metadata,
  };
}

function commandToShell(commandOrArgv) {
  const command = Array.isArray(commandOrArgv) ? { argv: commandOrArgv } : commandOrArgv;
  if (!command || !Array.isArray(command.argv)) return null;

  const prefix = command.env && command.env.HYPRLAND_INSTANCE_SIGNATURE
    ? `HYPRLAND_INSTANCE_SIGNATURE=${shellEscape(command.env.HYPRLAND_INSTANCE_SIGNATURE)} `
    : '';

  return `${prefix}${command.argv.map(shellEscape).join(' ')}`;
}

function commandsToShell(commands) {
  return asArray(commands).map(commandToShell).filter(Boolean);
}

function shellEscape(value) {
  const text = String(value);

  if (text.length === 0) return "''";
  if (/^[A-Za-z0-9_/:.,=+@%~\-\[\]]+$/.test(text)) return text;

  return `'${text.replace(/'/g, `'\"'\"'`)}'`;
}

function normalizeMonitorRecord(monitor) {
  const name = String(monitor.name || monitor.monitor || '');
  const splitMatch = name.match(/~(\d+)$/);

  return {
    ...monitor,
    name,
    splitIndex: splitMatch ? Number(splitMatch[1]) : null,
    physicalName: name.replace(/~\d+$/, ''),
    family: /^eDP/i.test(name) ? 'eDP' : /^HDMI/i.test(name) ? 'HDMI' : 'other',
    x: Number.isFinite(Number(monitor.x)) ? Number(monitor.x) : 0,
    y: Number.isFinite(Number(monitor.y)) ? Number(monitor.y) : 0,
    width: Number.isFinite(Number(monitor.width)) ? Number(monitor.width) : 0,
    height: Number.isFinite(Number(monitor.height)) ? Number(monitor.height) : 0,
  };
}

function sortByGeometry(monitors) {
  return [...monitors].sort((a, b) => a.x - b.x || a.y - b.y || a.name.localeCompare(b.name));
}

function pickMonitorName(monitor) {
  return monitor ? monitor.name : null;
}

function normalizeRelativeWorkspaceIds(values) {
  const ids = asArray(values).map((value) => integer(value));
  if (ids.length === 0) return [1];
  return [...new Set(ids)];
}

function resolveWorkspaceId(relativeWorkspaceId, baseWorkspaceId) {
  const relative = integer(relativeWorkspaceId);
  if (baseWorkspaceId === null || baseWorkspaceId === undefined) return relative;

  return integer(baseWorkspaceId) + relative - 1;
}

function commandEnv(signature) {
  return signature ? { HYPRLAND_INSTANCE_SIGNATURE: String(signature) } : {};
}

function withoutSignature(fields) {
  const copy = { ...fields };
  delete copy.signature;
  return copy;
}

function isExecutableCommand(command) {
  return Boolean(command && command.executable === true && Array.isArray(command.argv));
}

function integer(value) {
  const number = Number(value);
  if (!Number.isInteger(number)) {
    throw new Error(`Expected integer, got ${String(value)}`);
  }

  return number;
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
  DEFAULT_MIRROR_OFFSET,
  ROLE_DEFINITIONS,
  buildSpawnOnMonitorPlan,
  buildWorkstationCommandPlan,
  commandToShell,
  commandsToShell,
  detectActiveHyprlandInstance,
  executeHyprlandPlan,
  focusMonitorCommand,
  listHyprlandInstanceSignatures,
  readLiveHyprctlState,
  resolveMonitorRoles,
  resolveMonitorRolesFromHyprctl,
  resolveWorkspaceId,
  shellEscape,
  workspaceCommand,
};
