'use strict';

const assert = require('node:assert/strict');
const { test } = require('node:test');

const { calculatePolicy } = require('../core/policy.js');
const { createWorkstationModel } = require('../core/workstations.js');
const {
  buildHyprlandCommandPlan,
  commandToShell,
  executeHyprlandPlan,
  shellEscape,
} = require('../core/hyprland-adapter.js');

function fixtureModel() {
  return createWorkstationModel({
    defaults: {
      hdmiMonitor: 'HDMI-A-1',
      edpMonitor: 'eDP-1',
      edpWorkspaceOffset: 100,
    },
    workstations: [
      {
        id: 'study',
        name: 'Studying',
        slot: 3,
        edp: true,
      },
      {
        id: 'slack',
        name: 'Slack',
        slot: 9,
        blocked: true,
      },
    ],
  });
}

test('builds a hard workstation lock Hyprland dry-run command plan', () => {
  const model = fixtureModel();
  const policy = calculatePolicy(
    {
      id: 'study-focus-1',
      title: 'Anki focus',
      status: 'active',
      lockMode: 'hard',
      workstationId: 'study',
      startApps: [
        {
          id: 'anki',
          command: 'anki',
          workstationId: 'study',
          workspaceLocal: 1,
        },
      ],
      focusApps: [
        {
          id: 'anki',
          match: 'class:Anki',
          workstationId: 'study',
          workspaceLocal: 1,
        },
      ],
    },
    model
  );

  const plan = buildHyprlandCommandPlan(policy, model);
  const keywordRules = plan.commands.filter((command) => command.action === 'workspace-monitor-rule');
  const moves = plan.commands.filter((command) => command.action === 'moveworkspacetomonitor');
  const placeholders = plan.commands.filter((command) => command.type === 'placeholder');

  assert.equal(plan.dryRun, true);
  assert.equal(plan.execute, false);
  assert.equal(plan.policy.lockMode, 'hard-workstation');
  assert.equal(keywordRules.length, 20);
  assert.equal(moves.length, 20);

  assert.deepEqual(keywordRules[0].argv, [
    'hyprctl',
    'keyword',
    'workspace',
    '21,monitor:HDMI-A-1',
  ]);
  assert.deepEqual(keywordRules[19].argv, ['hyprctl', 'keyword', 'workspace', '130,monitor:eDP-1']);
  assert.deepEqual(moves[0].argv, [
    'hyprctl',
    'dispatch',
    'moveworkspacetomonitor',
    '21',
    'HDMI-A-1',
  ]);
  assert.deepEqual(moves[19].argv, [
    'hyprctl',
    'dispatch',
    'moveworkspacetomonitor',
    '130',
    'eDP-1',
  ]);

  assert.deepEqual(
    plan.commands
      .filter((command) => command.action === 'focusmonitor')
      .map((command) => command.argv),
    [['hyprctl', 'dispatch', 'focusmonitor', 'HDMI-A-1']]
  );
  assert.deepEqual(
    plan.commands.filter((command) => command.action === 'workspace').map((command) => command.argv),
    [['hyprctl', 'dispatch', 'workspace', '21']]
  );
  assert.deepEqual(
    placeholders.map((command) => [command.action, command.id, command.executable, command.workspaceId]),
    [
      ['start-app', 'anki', false, 21],
      ['focus-app', 'anki', false, 21],
    ]
  );

  assert.equal(plan.shellCommands[0], 'hyprctl keyword workspace 21,monitor:HDMI-A-1');
  assert.equal(
    commandToShell(['hyprctl', 'keyword', 'workspace', 'named workspace,monitor:HDMI A-1']),
    "hyprctl keyword workspace 'named workspace,monitor:HDMI A-1'"
  );
  assert.equal(shellEscape("class:Marv's App"), "'class:Marv'\"'\"'s App'");
});

test('builds away-from-desk as a no-execute plan and does not run by default', () => {
  const model = fixtureModel();
  const policy = calculatePolicy(
    {
      id: 'walk-1',
      title: 'Walk away',
      status: 'active',
      lockMode: 'away-from-desk',
      startApps: ['anki'],
      focusApps: ['class:Anki'],
    },
    model
  );

  const plan = buildHyprlandCommandPlan(policy, model, { hyprctl: '/missing/hyprctl' });
  const execution = executeHyprlandPlan(plan);

  assert.equal(plan.policy.awayFromDesk, true);
  assert.equal(plan.commandCount, 1);
  assert.equal(plan.executableCommandCount, 0);
  assert.equal(plan.commands[0].action, 'away-from-desk');
  assert.equal(plan.commands[0].executable, false);
  assert.deepEqual(plan.shellCommands, []);

  assert.equal(execution.execute, false);
  assert.equal(execution.executed, false);
  assert.equal(execution.executableCommandCount, 0);
  assert.equal(execution.results[0].reason, 'execute:true not passed');
});
