'use strict';

const assert = require('node:assert/strict');
const { test } = require('node:test');

const {
  createWorkstationModel,
  findWorkspaceById,
  findWorkstationByWorkspaceId,
  getCurrentWorkstation,
  getHiddenWorkstations,
  getNumpadMapping,
  getVisibleWorkstations,
} = require('../core/workstations.js');
const { calculatePolicy } = require('../core/policy.js');

function fixtureModel() {
  return createWorkstationModel({
    defaults: {
      hdmiMonitor: 'HDMI-A-1',
      edpMonitor: 'eDP-1',
      edpWorkspaceOffset: 10000,
    },
    workstations: [
      {
        id: 'study',
        name: 'Studying',
        slot: 3,
        edp: true,
      },
      {
        id: 'client',
        name: 'Client Project',
        slot: 4,
        hidden: true,
        edp: {
          mode: 'mirror',
        },
      },
      {
        id: 'slack',
        name: 'Slack',
        slot: 9,
        blocked: true,
      },
    ],
    numpad: {
      KP_End: {
        workstationId: 'study',
        workspaceLocal: 3,
      },
      KP_Down: {
        workstationId: 'client',
        workspaceLocal: 2,
      },
      KP_Page_Up: 'slack',
    },
  });
}

function ids(workspaces) {
  return workspaces.map((workspace) => workspace.id);
}

function range(start, end) {
  return Array.from({ length: end - start + 1 }, (_, index) => start + index);
}

test('builds decade workspaces with optional eDP extension and mirror records', () => {
  const model = fixtureModel();
  const study = model.byId.study;
  const client = model.byId.client;
  const slack = model.byId.slack;

  assert.deepEqual(ids(study.hdmiWorkspaces), range(21, 30));
  assert.deepEqual(ids(study.edpWorkspaces), range(10021, 10030));
  assert.equal(study.hdmiWorkspaces[0].monitor, 'HDMI-A-1');
  assert.equal(study.edpWorkspaces[0].monitor, 'eDP-1');
  assert.equal(study.edpWorkspaces[0].role, 'extension');
  assert.equal(study.workspaces.length, 20);

  assert.deepEqual(ids(client.hdmiWorkspaces), range(31, 40));
  assert.deepEqual(ids(client.edpWorkspaces), range(10031, 10040));
  assert.equal(client.edpWorkspaces[0].role, 'mirror');
  assert.equal(client.workspaces.length, 20);

  assert.deepEqual(ids(slack.hdmiWorkspaces), range(81, 90));
  assert.deepEqual(ids(slack.edpWorkspaces), []);
});

test('normalizes the old Quickshell workstation state shape', () => {
  const model = createWorkstationModel({
    defaults: {
      hdmiMonitor: 'work_main',
      edpMonitor: 'laptop',
      edpWorkspaceOffset: 10000,
      includeEdp: true,
      edpMode: 'mirror',
    },
    workstations: [
      {
        name: 'Slacking',
        number: 1,
        last_workspace: 4,
        mapping: 1,
      },
      {
        name: 'Mr-P2',
        number: 44,
        last_workspace: 3,
        last_workspace_external: 1,
        mapping: 5,
      },
    ],
  });

  assert.equal(model.byId.slacking.specialRole, 'slacking');
  assert.equal(model.byId.slacking.slot, 1);
  assert.equal(model.byId.slacking.lastWorkspace, 4);
  assert.deepEqual(ids(model.byId.slacking.hdmiWorkspaces), range(1, 10));
  assert.deepEqual(ids(model.byId.slacking.edpWorkspaces), range(10001, 10010));

  assert.equal(model.byId['mr-p2'].slot, 44);
  assert.equal(model.byId['mr-p2'].lastWorkspace, 3);
  assert.equal(model.byId['mr-p2'].lastWorkspaceExternal, 1);
  assert.deepEqual(ids(model.byId['mr-p2'].hdmiWorkspaces), range(431, 440));
  assert.deepEqual(ids(model.byId['mr-p2'].edpWorkspaces), range(10431, 10440));

  assert.deepEqual(
    getNumpadMapping(model).map((entry) => [entry.key, entry.workstationId, entry.workspaceId]),
    [
      ['1', 'slacking', 1],
      ['5', 'mr-p2', 431],
    ]
  );
});

test('filters visible and hidden workstations without losing local numpad data', () => {
  const model = fixtureModel();

  assert.deepEqual(
    getVisibleWorkstations(model).map((workstation) => workstation.id),
    ['study']
  );
  assert.deepEqual(
    getVisibleWorkstations(model, { includeBlocked: true }).map((workstation) => workstation.id),
    ['study', 'slack']
  );
  assert.deepEqual(
    getHiddenWorkstations(model).map((workstation) => workstation.id),
    ['client', 'slack']
  );

  const allMappings = getNumpadMapping(model);
  assert.deepEqual(
    allMappings.map((entry) => [entry.key, entry.workstationId, entry.workspaceId]),
    [
      ['1', 'study', 23],
      ['2', 'client', 32],
      ['9', 'slack', 81],
    ]
  );

  assert.deepEqual(
    getNumpadMapping(model, { visibleOnly: true }).map((entry) => entry.key),
    ['1']
  );
});

test('finds the current workstation from HDMI or eDP workspace ids', () => {
  const model = fixtureModel();
  const edpMatch = findWorkspaceById(model, { id: '10026' });

  assert.equal(edpMatch.workstationId, 'study');
  assert.equal(edpMatch.workspace.local, 6);
  assert.equal(edpMatch.workspace.surface, 'edp');
  assert.equal(edpMatch.workspace.role, 'extension');

  assert.equal(getCurrentWorkstation(model, { activeWorkspaceId: 34 }).id, 'client');
  assert.equal(findWorkstationByWorkspaceId(model, 999), null);
});

test('calculates hard workstation lock policy and pure app actions', () => {
  const model = fixtureModel();
  const policy = calculatePolicy(
    {
      id: 'study-focus-1',
      title: 'Anki focus',
      status: 'active',
      lockMode: 'hard',
      workstationId: 'study',
      blockedWorkstations: ['slack'],
      blockedWorkspaces: [999],
      startApps: [
        'anki',
        {
          id: 'browser',
          command: 'firefox --new-window about:blank',
          workstationId: 'study',
          workspaceLocal: 2,
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

  assert.equal(policy.active, true);
  assert.equal(policy.lock.mode, 'hard-workstation');
  assert.equal(policy.lock.workstationId, 'study');
  assert.deepEqual(policy.lock.workspaceIds, [...range(21, 30), ...range(10021, 10030)]);
  assert.deepEqual(policy.allowed.workstations, ['study']);
  assert.deepEqual(new Set(policy.allowed.workspaces), new Set([...range(21, 30), ...range(10021, 10030)]));
  assert.deepEqual(policy.blocked.workstations, ['slack']);
  assert.deepEqual(new Set(policy.blocked.workspaces), new Set([...range(81, 90), 999]));

  assert.deepEqual(policy.actions.startApps[0], {
    type: 'start-app',
    id: 'anki',
    command: 'anki',
  });
  assert.equal(policy.actions.startApps[1].workspaceId, 22);
  assert.equal(policy.actions.focusApps[0].workspaceId, 21);
});

test('supports nested policy lock objects with workstation shorthand', () => {
  const model = fixtureModel();
  const policy = calculatePolicy(
    {
      id: 'nested-study-focus',
      status: 'active',
      policy: {
        lock: {
          mode: 'hard',
          workstation: 'study',
        },
      },
    },
    model
  );

  assert.equal(policy.lock.mode, 'hard-workstation');
  assert.equal(policy.lock.workstationId, 'study');
  assert.deepEqual(policy.allowed.workstations, ['study']);
  assert.deepEqual(new Set(policy.allowed.workspaces), new Set([...range(21, 30), ...range(10021, 10030)]));
});

test('calculates away-from-desk policy as a full known-workspace block', () => {
  const model = fixtureModel();
  const policy = calculatePolicy(
    {
      id: 'rest-1',
      title: 'Walk away',
      status: 'active',
      lockMode: 'away-from-desk',
      allowedWorkstations: ['study'],
      allowedWorkspaces: [21],
      blockedWorkspaces: [999],
    },
    model
  );

  assert.equal(policy.awayFromDesk, true);
  assert.equal(policy.lock.mode, 'away-from-desk');
  assert.deepEqual(policy.allowed.workstations, []);
  assert.deepEqual(policy.allowed.workspaces, []);
  assert.deepEqual(policy.blocked.workstations, ['study', 'client', 'slack']);
  assert.equal(policy.blocked.workspaces.length, 51);
  assert.equal(policy.blocked.workspaces.includes(21), true);
  assert.equal(policy.blocked.workspaces.includes(10040), true);
  assert.equal(policy.blocked.workspaces.includes(999), true);
  assert.deepEqual(policy.actions.startApps, []);
  assert.deepEqual(policy.actions.focusApps, []);
});

test('returns an inactive empty policy when no timeblock is active', () => {
  const policy = calculatePolicy(null, fixtureModel());

  assert.equal(policy.active, false);
  assert.equal(policy.lock.mode, 'none');
  assert.deepEqual(policy.allowed.workspaces, []);
  assert.deepEqual(policy.blocked.workspaces, []);
});
