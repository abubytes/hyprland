'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { test } = require('node:test');

const { createWorkstationModel } = require('../core/workstations.js');
const {
  switchNumpad,
  switchRelativeWorkspace,
  switchWorkstation,
} = require('../bin/workstation.js');

const common = {
  hyprctl: 'hyprctl',
  signature: 'sig',
  monitorRoles: {
    laptop: 'eDP-1',
    work_main: 'HDMI-A-1~1',
    side_panel: 'HDMI-A-1~2',
  },
};

function model() {
  return createWorkstationModel({
    defaults: {
      includeEdp: true,
      edpWorkspaceOffset: 10000,
    },
    workstations: [
      {
        name: 'Studying',
        number: 2,
        mapping: 2,
        last_workspace: 3,
      },
      {
        name: 'Mr-P2',
        number: 44,
        mapping: 5,
        last_workspace: 1,
      },
    ],
  });
}

test('switches old numpad mappings into the workstation decade without executing hyprctl', () => {
  const runtimeDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lualand-next-cli-'));
  const result = switchNumpad({
    args: { key: 'KP_Down', dryRun: true },
    model: model(),
    runtimeDir,
    common,
  });

  assert.equal(result.ok, true);
  assert.equal(result.workstation.id, 'studying');
  assert.equal(result.workspace.id, 13);
  assert.equal(result.execution.dryRun, true);
  assert.equal(result.plan.commands[0].argv.at(-1), '11,monitor:HDMI-A-1~1');
  assert.equal(result.plan.commands[2].workspaceId, 10011);

  const current = JSON.parse(fs.readFileSync(path.join(runtimeDir, 'current-workstation.json'), 'utf8'));
  assert.equal(current.workstationId, 'studying');
});

test('relative workspace command uses the last switched workstation', () => {
  const runtimeDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lualand-next-cli-'));
  switchWorkstation({
    args: { workstation: 'Mr-P2', dryRun: true },
    model: model(),
    runtimeDir,
    common,
  });

  const result = switchRelativeWorkspace({
    args: { value: 10, dryRun: true },
    model: model(),
    runtimeDir,
    common,
  });

  assert.equal(result.workstation.id, 'mr-p2');
  assert.equal(result.workspace.id, 440);
});
