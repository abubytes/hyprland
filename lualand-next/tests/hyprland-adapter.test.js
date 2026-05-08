'use strict';

const assert = require('node:assert/strict');
const { test } = require('node:test');

const {
  DEFAULT_MIRROR_OFFSET,
  buildSpawnOnMonitorPlan,
  buildWorkstationCommandPlan,
  commandToShell,
  detectActiveHyprlandInstance,
  executeHyprlandPlan,
  resolveMonitorRoles,
  resolveWorkspaceId,
  shellEscape,
} = require('../core/hyprland-adapter.js');

const SPLIT_MONITORS = [
  { name: 'eDP-1', x: 0, y: 100, width: 1920, height: 1080 },
  { name: 'HDMI-A-1~1', x: 1920, y: 0, width: 1440, height: 1080 },
  { name: 'HDMI-A-1~2', x: 3360, y: 0, width: 480, height: 1080 },
];

test('resolves monitor roles for laptop, HDMI 1/4 side panel, and HDMI 3/4 work main', () => {
  assert.deepEqual(resolveMonitorRoles(SPLIT_MONITORS), {
    laptop: 'eDP-1',
    side_panel: 'HDMI-A-1~2',
    work_main: 'HDMI-A-1~1',
  });

  assert.deepEqual(resolveMonitorRoles([{ name: 'HDMI-A-1', x: 100 }, { name: 'eDP-1', x: 0 }]), {
    laptop: 'eDP-1',
    side_panel: null,
    work_main: 'HDMI-A-1',
  });
});

test('builds dry-run workstation commands from relative workspace ids and keeps mirror offset at +10000', () => {
  const plan = buildWorkstationCommandPlan({
    workstationId: 'deep-work',
    baseWorkspaceId: 30,
    relativeWorkspaceIds: [1, 4],
    monitorRoles: resolveMonitorRoles(SPLIT_MONITORS),
    signature: 'active-sig',
  });

  assert.equal(DEFAULT_MIRROR_OFFSET, 10000);
  assert.equal(resolveWorkspaceId(4, 30), 33);
  assert.equal(plan.dryRun, true);
  assert.equal(plan.execute, false);
  assert.equal(plan.metadata.monitorRoles.work_main, 'HDMI-A-1~1');
  assert.equal(plan.metadata.monitorRoles.side_panel, 'HDMI-A-1~2');

  assert.deepEqual(
    plan.commands.slice(0, 4).map((command) => command.argv),
    [
      ['hyprctl', 'keyword', 'workspace', '30,monitor:HDMI-A-1~1'],
      ['hyprctl', 'dispatch', 'moveworkspacetomonitor', '30', 'HDMI-A-1~1'],
      ['hyprctl', 'keyword', 'workspace', '10030,monitor:eDP-1'],
      ['hyprctl', 'dispatch', 'moveworkspacetomonitor', '10030', 'eDP-1'],
    ]
  );
  assert.equal(plan.commands[2].mirrorOfWorkspaceId, 30);
  assert.equal(plan.commands[4].workspaceId, 33);
  assert.equal(plan.commands[6].workspaceId, 10033);
  assert.equal(plan.commands.at(-1).workspaceId, 10033);
  assert.equal(plan.shellCommands[0], 'HYPRLAND_INSTANCE_SIGNATURE=active-sig hyprctl keyword workspace 30,monitor:HDMI-A-1~1');
});

test('only pins side-panel workspaces when they are explicit', () => {
  const plan = buildWorkstationCommandPlan({
    workstationId: 'aux',
    baseWorkspaceId: 500,
    relativeWorkspaceIds: [1],
    sideWorkspaceIds: [599],
    monitorRoles: resolveMonitorRoles(SPLIT_MONITORS),
  });

  assert.equal(plan.commands.at(-1).role, 'side_panel');
  assert.equal(plan.commands.at(-1).workspaceId, 599);
  assert.deepEqual(plan.commands.at(-1).argv, [
    'hyprctl',
    'keyword',
    'workspace',
    '599,monitor:HDMI-A-1~2',
  ]);
});

test('builds a spawn-on-monitor command for notion-app on the right work monitor', () => {
  const plan = buildSpawnOnMonitorPlan({
    command: 'notion-app',
    workspaceId: 44,
    monitorRoles: resolveMonitorRoles(SPLIT_MONITORS),
  });

  assert.equal(plan.commandCount, 1);
  assert.equal(plan.commands[0].action, 'spawn-on-monitor');
  assert.equal(plan.commands[0].monitor, 'HDMI-A-1~1');
  assert.deepEqual(plan.commands[0].argv, [
    'hyprctl',
    'dispatch',
    'exec',
    '[workspace 44 silent; monitor HDMI-A-1~1] notion-app',
  ]);
  assert.equal(
    commandToShell(plan.commands[0]),
    "hyprctl dispatch exec '[workspace 44 silent; monitor HDMI-A-1~1] notion-app'"
  );
});

test('detects a live Hyprland signature when the inherited environment is stale', () => {
  const calls = [];
  const runner = ({ resource, signature }) => {
    calls.push({ resource, signature });
    if (signature === 'stale') {
      return { status: 1, stdout: '', stderr: 'no such instance' };
    }

    if (signature === 'fresh') {
      return {
        status: 0,
        stdout: JSON.stringify(SPLIT_MONITORS),
        stderr: '',
      };
    }

    return { status: 1, stdout: '', stderr: 'missing' };
  };

  const detected = detectActiveHyprlandInstance({
    env: { HYPRLAND_INSTANCE_SIGNATURE: 'stale' },
    signatures: ['stale', 'fresh'],
    runner,
  });

  assert.equal(detected.signature, 'fresh');
  assert.equal(detected.source, 'runtime-scan');
  assert.equal(detected.staleEnv, true);
  assert.deepEqual(detected.monitorRoles, {
    laptop: 'eDP-1',
    side_panel: 'HDMI-A-1~2',
    work_main: 'HDMI-A-1~1',
  });
  assert.deepEqual(calls, [
    { resource: 'monitors', signature: 'stale' },
    { resource: 'monitors', signature: 'fresh' },
  ]);
});

test('dry-run execution never spawns hyprctl', () => {
  const plan = buildSpawnOnMonitorPlan({ command: 'notion-app' });
  const execution = executeHyprlandPlan(plan);

  assert.equal(execution.executed, false);
  assert.equal(execution.dryRun, true);
  assert.equal(execution.results[0].reason, 'execute:true not passed');
  assert.equal(shellEscape("class:Marv's App"), "'class:Marv'\"'\"'s App'");
});
