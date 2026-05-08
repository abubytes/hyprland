#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const childProcess = require('node:child_process');

const {
  createWorkstationModel,
  getNumpadMapping,
  normalizeNumpadKey,
  normalizeWorkstationId,
} = require('../core/workstations.js');
const {
  buildWorkstationCommandPlan,
  detectActiveHyprlandInstance,
  executeHyprlandPlan,
  workspaceCommand,
  focusMonitorCommand,
} = require('../core/hyprland-adapter.js');

const ROOT = path.resolve(__dirname, '..');
const DEFAULT_WORKSTATIONS = path.join(ROOT, 'state', 'sample-workstations.json');
const DEFAULT_RUNTIME_DIR = '/tmp/lualand-next';

function main(argv = process.argv.slice(2), io = process) {
  const args = parseArgs(argv);
  const runtimeDir = path.resolve(args.runtimeDir || process.env.LUALAND_NEXT_RUNTIME_DIR || DEFAULT_RUNTIME_DIR);
  const model = createWorkstationModel(readJson(args.workstations || DEFAULT_WORKSTATIONS));
  const detected = detectActiveHyprlandInstance({ hyprctl: args.hyprctl || 'hyprctl' });
  const common = {
    hyprctl: args.hyprctl || 'hyprctl',
    signature: detected.signature,
    monitorRoles: detected.monitorRoles,
  };

  const action =
    args.command === 'switch-numpad'
      ? switchNumpad({ args, model, runtimeDir, common })
      : args.command === 'switch'
        ? switchWorkstation({ args, model, runtimeDir, common })
        : args.command === 'workspace'
          ? switchRelativeWorkspace({ args, model, runtimeDir, common })
          : args.command === 'move'
            ? moveWindowRelative({ args, model, runtimeDir, common })
            : null;

  if (!action) {
    throw new Error(`Unknown command: ${args.command || '(missing)'}`);
  }

  if (args.json) {
    io.stdout.write(`${JSON.stringify(action, null, 2)}\n`);
  } else {
    io.stdout.write(`${action.summary}\n`);
  }
}

function switchNumpad({ args, model, runtimeDir, common }) {
  const key = normalizeNumpadKey(args.key || args.value);
  const mapping = getNumpadMapping(model, { visibleOnly: false }).find((entry) => entry.key === key);
  if (!mapping) {
    throw new Error(`No workstation mapped to numpad ${key}`);
  }

  return switchWorkstation({
    args: {
      ...args,
      workstation: mapping.workstationId,
      relative: args.relative || mapping.workstation.lastWorkspace || mapping.workspaceLocal || 1,
    },
    model,
    runtimeDir,
    common,
  });
}

function switchWorkstation({ args, model, runtimeDir, common }) {
  const id = normalizeWorkstationId(args.workstation || args.value);
  const workstation = model.byId[id];
  if (!workstation) {
    throw new Error(`Unknown workstation: ${args.workstation || args.value}`);
  }

  const relative = relativeFromArgs(args, workstation.lastWorkspace || 1);
  const workspace = workspaceForRelative(workstation, relative);
  const plan = buildWorkstationCommandPlan(
    {
      workstationId: workstation.id,
      baseWorkspaceId: workstation.hdmiWorkspaces[0].id,
      relativeWorkspaceIds: Array.from({ length: workstation.workspaceCount }, (_, index) => index + 1),
    },
    common,
  );
  const execution = args.dryRun ? executeHyprlandPlan(plan) : executeHyprlandPlan(plan, { execute: true });
  const focus = runHyprctlCommand(focusMonitorCommand(common.hyprctl, common.monitorRoles.work_main, common), args);
  const workspaceResult = runHyprctlCommand(workspaceCommand(common.hyprctl, workspace.id, common), args);

  writeCurrent(runtimeDir, {
    workstationId: workstation.id,
    workstationName: workstation.name,
    relative,
    workspaceId: workspace.id,
    updatedAt: new Date().toISOString(),
  });

  return {
    ok: true,
    kind: 'switch-workstation',
    summary: `switched ${workstation.name} -> workspace ${workspace.id}`,
    workstation,
    relative,
    workspace,
    monitorRoles: common.monitorRoles,
    plan,
    execution,
    focus,
    workspaceResult,
  };
}

function switchRelativeWorkspace({ args, model, runtimeDir, common }) {
  const current = readCurrent(runtimeDir);
  if (!current?.workstationId) {
    throw new Error('No current workstation state; switch a workstation first.');
  }

  return switchWorkstation({
    args: {
      ...args,
      workstation: current.workstationId,
      relative: args.relative || args.value,
    },
    model,
    runtimeDir,
    common,
  });
}

function moveWindowRelative({ args, model, runtimeDir, common }) {
  const current = readCurrent(runtimeDir);
  if (!current?.workstationId) {
    throw new Error('No current workstation state; switch a workstation first.');
  }

  const workstation = model.byId[current.workstationId];
  if (!workstation) {
    throw new Error(`Current workstation is no longer known: ${current.workstationId}`);
  }

  const relative = relativeFromArgs(args, 1);
  const workspace = workspaceForRelative(workstation, relative);
  const command = {
    type: 'hyprctl',
    executable: true,
    action: 'movetoworkspace',
    argv: [common.hyprctl, 'dispatch', 'movetoworkspace', String(workspace.id)],
    env: common.signature ? { HYPRLAND_INSTANCE_SIGNATURE: String(common.signature) } : {},
    workspaceId: workspace.id,
  };
  command.shell = command.argv.join(' ');
  const result = runHyprctlCommand(command, args);

  return {
    ok: true,
    kind: 'move-window-relative',
    summary: `moved active window -> workspace ${workspace.id}`,
    workstation,
    relative,
    workspace,
    result,
  };
}

function runHyprctlCommand(command, args) {
  if (args.dryRun) {
    return {
      executed: false,
      dryRun: true,
      argv: command.argv,
      env: command.env || {},
    };
  }

  const child = childProcess.spawnSync(command.argv[0], command.argv.slice(1), {
    encoding: 'utf8',
    env: {
      ...process.env,
      ...(command.env || {}),
    },
  });

  return {
    executed: true,
    dryRun: false,
    status: child.status,
    stdout: child.stdout || '',
    stderr: child.stderr || '',
    error: child.error ? child.error.message : null,
  };
}

function workspaceForRelative(workstation, relative) {
  const workspace = workstation.hdmiWorkspaces[relative - 1];
  if (!workspace) {
    throw new Error(`${workstation.name} has no relative workspace ${relative}`);
  }
  return workspace;
}

function relativeFromArgs(args, fallback) {
  const value = args.relative || args.workspace || args.value || fallback;
  const number = Number(value);
  if (!Number.isInteger(number) || number < 1 || number > 10) {
    throw new Error(`Relative workspace must be 1..10, got ${String(value)}`);
  }
  return number;
}

function writeCurrent(runtimeDir, value) {
  fs.mkdirSync(runtimeDir, { recursive: true });
  fs.writeFileSync(path.join(runtimeDir, 'current-workstation.json'), `${JSON.stringify(value, null, 2)}\n`);
}

function readCurrent(runtimeDir) {
  const file = path.join(runtimeDir, 'current-workstation.json');
  if (!fs.existsSync(file)) return null;
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function parseArgs(argv) {
  const args = {
    command: argv[0],
    value: argv[1],
    hyprctl: 'hyprctl',
  };

  for (let index = 2; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--dry-run') args.dryRun = true;
    else if (arg === '--json') args.json = true;
    else if (arg === '--workstations') args.workstations = argv[++index];
    else if (arg === '--runtime-dir') args.runtimeDir = argv[++index];
    else if (arg === '--hyprctl') args.hyprctl = argv[++index];
    else if (arg === '--relative') args.relative = Number(argv[++index]);
    else if (arg === '--workspace') args.workspace = Number(argv[++index]);
    else if (arg === '--workstation') args.workstation = argv[++index];
    else if (arg === '--key') args.key = argv[++index];
    else throw new Error(`Unknown argument: ${arg}`);
  }

  return args;
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    process.stderr.write(`${error.stack || error.message}\n`);
    process.exitCode = 1;
  }
}

module.exports = {
  main,
  parseArgs,
  switchWorkstation,
  switchNumpad,
  switchRelativeWorkspace,
};
