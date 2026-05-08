#!/usr/bin/env node
'use strict';

const {
  buildSpawnOnMonitorPlan,
  buildWorkstationCommandPlan,
  detectActiveHyprlandInstance,
  executeHyprlandPlan,
  readLiveHyprctlState,
} = require('../core/hyprland-adapter.js');

function main(argv) {
  const args = parseArgs(argv);
  const live = Boolean(args.live || args.execute);
  const detected = live ? detectActiveHyprlandInstance({ hyprctl: args.hyprctl }) : null;
  const monitorRoles =
    args.monitorRoles || (detected && detected.monitorRoles) || {
      laptop: args.laptop,
      work_main: args.workMain,
      side_panel: args.sidePanel,
    };
  const common = {
    hyprctl: args.hyprctl,
    signature: detected && detected.signature,
    monitorRoles,
  };
  const plan =
    args.mode === 'spawn'
      ? buildSpawnOnMonitorPlan(
          {
            command: args.command || 'notion-app',
            workspaceId: args.workspaceId,
            baseWorkspaceId: args.baseWorkspaceId,
            role: args.role || 'work_main',
          },
          common
        )
      : buildWorkstationCommandPlan(
          {
            workstationId: args.workstationId || 'manual',
            relativeWorkspaceIds: args.relativeWorkspaceIds || [1],
            baseWorkspaceId: args.baseWorkspaceId,
          },
          common
        );

  const payload = {
    live,
    detected,
    state: args.state && live ? readLiveHyprctlState({ hyprctl: args.hyprctl }) : undefined,
    plan,
    execution: executeHyprlandPlan(plan, { execute: Boolean(args.execute) }),
  };

  process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
}

function parseArgs(argv) {
  const args = {
    mode: 'workstation',
    hyprctl: 'hyprctl',
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === 'workstation' || arg === 'spawn') {
      args.mode = arg;
    } else if (arg === '--live') {
      args.live = true;
    } else if (arg === '--execute') {
      args.execute = true;
    } else if (arg === '--state') {
      args.state = true;
    } else if (arg === '--hyprctl') {
      args.hyprctl = argv[++index];
    } else if (arg === '--workstation') {
      args.workstationId = argv[++index];
    } else if (arg === '--base') {
      args.baseWorkspaceId = Number(argv[++index]);
    } else if (arg === '--relative') {
      args.relativeWorkspaceIds = argv[++index].split(',').map(Number);
    } else if (arg === '--workspace') {
      args.workspaceId = Number(argv[++index]);
    } else if (arg === '--command') {
      args.command = argv[++index];
    } else if (arg === '--role') {
      args.role = argv[++index];
    } else if (arg === '--laptop') {
      args.laptop = argv[++index];
    } else if (arg === '--work-main') {
      args.workMain = argv[++index];
    } else if (arg === '--side-panel') {
      args.sidePanel = argv[++index];
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  return args;
}

if (require.main === module) {
  try {
    main(process.argv.slice(2));
  } catch (error) {
    process.stderr.write(`${error.stack || error.message}\n`);
    process.exitCode = 1;
  }
}

module.exports = {
  main,
  parseArgs,
};
