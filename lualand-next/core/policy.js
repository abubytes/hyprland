'use strict';

const {
  ensureWorkstationModel,
  getAllWorkspaceIds,
  getWorkspaceIdsForWorkstations,
  normalizeWorkspaceId,
} = require('./workstations.js');

const INACTIVE_STATUSES = new Set(['done', 'skipped', 'reset', 'missed', 'cancelled', 'canceled']);
const HARD_LOCK_MODES = new Set([
  'hard',
  'hard-lock',
  'hard-workstation',
  'lock-workstation',
  'strict',
  'workstation',
]);

function calculatePolicy(block, workstationInput = {}) {
  const model = ensureWorkstationModel(workstationInput);

  if (!block) {
    return emptyPolicy();
  }

  const warnings = [];
  const status = String(readField(block, ['status'], 'active'));
  const active = !INACTIVE_STATUSES.has(status);
  const lockMode = normalizeLockMode(readLockMode(block));
  const awayFromDesk =
    Boolean(readField(block, ['awayFromDesk'], false)) || isAwayFromDeskMode(lockMode);
  const explicitLockWorkstationId = readLockWorkstationId(block);
  const hardLockWorkstationId =
    explicitLockWorkstationId ||
    (isHardLockMode(lockMode) ? readField(block, ['workstationId'], null) : null);
  const hardLock =
    Boolean(hardLockWorkstationId) && Boolean(isHardLockMode(lockMode) || explicitLockWorkstationId);

  let allowedWorkstations = uniqueStrings(readArrayField(block, ['allowedWorkstations']));
  let blockedWorkstations = uniqueStrings(readArrayField(block, ['blockedWorkstations']));
  let allowedWorkspaces = uniqueWorkspaces(readArrayField(block, ['allowedWorkspaces']));
  let blockedWorkspaces = uniqueWorkspaces(readArrayField(block, ['blockedWorkspaces']));

  if (hardLock) {
    allowedWorkstations = uniqueStrings([...allowedWorkstations, hardLockWorkstationId]);
  }

  if (awayFromDesk) {
    allowedWorkstations = [];
    allowedWorkspaces = [];
    blockedWorkstations = uniqueStrings([
      ...model.workstations.map((workstation) => workstation.id),
      ...blockedWorkstations,
    ]);
    blockedWorkspaces = uniqueWorkspaces([...getAllWorkspaceIds(model), ...blockedWorkspaces]);
  } else {
    warnUnknownWorkstations(model, allowedWorkstations, 'allowedWorkstations', warnings);
    warnUnknownWorkstations(model, blockedWorkstations, 'blockedWorkstations', warnings);

    allowedWorkspaces = uniqueWorkspaces([
      ...allowedWorkspaces,
      ...getWorkspaceIdsForWorkstations(model, allowedWorkstations),
    ]);
    blockedWorkspaces = uniqueWorkspaces([
      ...blockedWorkspaces,
      ...getWorkspaceIdsForWorkstations(model, blockedWorkstations),
    ]);
  }

  const blockedWorkstationKeys = new Set(blockedWorkstations);
  const blockedWorkspaceKeys = new Set(blockedWorkspaces.map(workspaceKey));
  const conflictingWorkstations = allowedWorkstations.filter((id) => blockedWorkstationKeys.has(id));
  const conflictingWorkspaces = allowedWorkspaces.filter((id) => blockedWorkspaceKeys.has(workspaceKey(id)));

  if (conflictingWorkstations.length > 0) {
    warnings.push(
      `Blocked workstations override allowed workstations: ${conflictingWorkstations.join(', ')}`
    );
  }

  if (conflictingWorkspaces.length > 0) {
    warnings.push(
      `Blocked workspaces override allowed workspaces: ${conflictingWorkspaces
        .map(String)
        .join(', ')}`
    );
  }

  allowedWorkstations = allowedWorkstations.filter((id) => !blockedWorkstationKeys.has(id));
  allowedWorkspaces = allowedWorkspaces.filter((id) => !blockedWorkspaceKeys.has(workspaceKey(id)));

  const lock = buildLock({
    awayFromDesk,
    hardLock,
    hardLockWorkstationId,
    model,
    warnings,
  });

  const startApps = normalizeAppActions(readActionField(block, ['startApps', 'startApp']), 'start-app', model);
  const focusApps = normalizeAppActions(readActionField(block, ['focusApps', 'focusApp']), 'focus-app', model);
  const workspaceActions = normalizeWorkspaceActions(
    readActionField(block, ['workspaceActions', 'workspaceAction'])
  );

  return {
    active,
    blockId: readField(block, ['id'], null),
    title: readField(block, ['title'], null),
    type: readField(block, ['type'], null),
    preset: readField(block, ['preset'], null),
    awayFromDesk,
    lock,
    focusWorkstationId:
      readField(block, ['focusWorkstationId'], null) || lock.workstationId || null,
    allowed: {
      workstations: allowedWorkstations,
      workspaces: allowedWorkspaces,
    },
    blocked: {
      workstations: blockedWorkstations,
      workspaces: blockedWorkspaces,
    },
    actions: {
      startApps,
      focusApps,
      workspaceActions,
    },
    warnings,
  };
}

function emptyPolicy() {
  return {
    active: false,
    blockId: null,
    title: null,
    type: null,
    preset: null,
    awayFromDesk: false,
    lock: {
      mode: 'none',
      workstationId: null,
      workspaceIds: [],
    },
    focusWorkstationId: null,
    allowed: {
      workstations: [],
      workspaces: [],
    },
    blocked: {
      workstations: [],
      workspaces: [],
    },
    actions: {
      startApps: [],
      focusApps: [],
      workspaceActions: [],
    },
    warnings: [],
  };
}

function buildLock({ awayFromDesk, hardLock, hardLockWorkstationId, model, warnings }) {
  if (awayFromDesk) {
    return {
      mode: 'away-from-desk',
      workstationId: null,
      workspaceIds: [],
    };
  }

  if (!hardLock) {
    return {
      mode: 'none',
      workstationId: null,
      workspaceIds: [],
    };
  }

  const workstation = model.byId[String(hardLockWorkstationId)];

  if (!workstation) {
    warnings.push(`Hard lock points at unknown workstation: ${String(hardLockWorkstationId)}`);
  }

  return {
    mode: 'hard-workstation',
    workstationId: String(hardLockWorkstationId),
    workspaceIds: workstation ? workstation.workspaces.map((workspace) => workspace.id) : [],
  };
}

function normalizeAppActions(actions, type, model) {
  return asArray(actions).flatMap((action) => {
    if (action === null || action === undefined) {
      return [];
    }

    const record =
      typeof action === 'string'
        ? stringAppAction(action, type)
        : {
            ...action,
            type: action.type || type,
          };

    return [resolveActionWorkspace(record, model)];
  });
}

function stringAppAction(value, type) {
  if (type === 'start-app') {
    return {
      type,
      id: value,
      command: value,
    };
  }

  return {
    type,
    id: value,
    match: value,
  };
}

function resolveActionWorkspace(action, model) {
  if (action.workspaceId || action.workspace) {
    return {
      ...action,
      workspaceId: normalizeWorkspaceId(action.workspaceId || action.workspace),
    };
  }

  if (!action.workstationId || !action.workspaceLocal) {
    return action;
  }

  const workstation = model.byId[String(action.workstationId)];
  if (!workstation) {
    return action;
  }

  const local = Number(action.workspaceLocal);
  const workspace = Number.isInteger(local) ? workstation.hdmiWorkspaces[local - 1] : null;

  if (!workspace) {
    return action;
  }

  return {
    ...action,
    workspaceId: workspace.id,
  };
}

function normalizeWorkspaceActions(actions) {
  return asArray(actions).flatMap((action) => {
    if (action === null || action === undefined) {
      return [];
    }

    if (typeof action === 'string') {
      return [
        {
          type: 'workspace-action',
          id: action,
        },
      ];
    }

    return [
      {
        ...action,
        type: action.type || 'workspace-action',
      },
    ];
  });
}

function readLockMode(block) {
  const lock = readField(block, ['lock'], null);

  if (lock && typeof lock === 'object' && lock.mode !== undefined) {
    return lock.mode;
  }

  return readField(block, ['lockMode'], 'none');
}

function readLockWorkstationId(block) {
  const lock = readField(block, ['lock'], null);

  if (lock && typeof lock === 'object') {
    const lockWorkstationId = firstDefined(lock.workstationId, lock.workstation, lock.hardLockWorkstationId);
    if (lockWorkstationId !== undefined && lockWorkstationId !== null) {
      return String(lockWorkstationId);
    }
  }

  const value = readField(block, ['hardLockWorkstationId', 'lockWorkstationId'], null);
  return value === null ? null : String(value);
}

function readField(block, names, fallback) {
  for (const name of names) {
    if (hasOwn(block, name) && block[name] !== undefined) {
      return block[name];
    }
  }

  const policy = block.policy;
  if (policy && typeof policy === 'object') {
    for (const name of names) {
      if (hasOwn(policy, name) && policy[name] !== undefined) {
        return policy[name];
      }
    }
  }

  return fallback;
}

function readArrayField(block, names) {
  const values = [];

  for (const source of [block.policy, block]) {
    if (!source || typeof source !== 'object') continue;

    for (const name of names) {
      if (!hasOwn(source, name) || source[name] === undefined) continue;
      values.push(...asArray(source[name]));
    }
  }

  return values;
}

function readActionField(block, names) {
  const actions = readArrayField(block, names);
  const genericActions = readArrayField(block, ['appActions']);

  if (names.includes('startApps')) {
    actions.push(
      ...genericActions.filter((action) => action && (action.type === 'start-app' || action.action === 'start'))
    );
  }

  if (names.includes('focusApps')) {
    actions.push(
      ...genericActions.filter((action) => action && (action.type === 'focus-app' || action.action === 'focus'))
    );
  }

  return actions;
}

function normalizeLockMode(value) {
  if (value === null || value === undefined) return 'none';
  return String(value).trim().toLowerCase();
}

function isHardLockMode(mode) {
  return HARD_LOCK_MODES.has(normalizeLockMode(mode));
}

function isAwayFromDeskMode(mode) {
  return ['away', 'away-from-desk', 'no-computer', 'offscreen'].includes(normalizeLockMode(mode));
}

function warnUnknownWorkstations(model, workstationIds, fieldName, warnings) {
  for (const workstationId of workstationIds) {
    if (!model.byId[workstationId]) {
      warnings.push(`${fieldName} contains unknown workstation: ${workstationId}`);
    }
  }
}

function uniqueStrings(values) {
  return unique(values.map((value) => String(value)));
}

function uniqueWorkspaces(values) {
  return unique(values.map(normalizeWorkspaceId));
}

function unique(values) {
  const seen = new Set();
  const result = [];

  for (const value of values) {
    const key = String(value);
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(value);
  }

  return result;
}

function workspaceKey(value) {
  return String(normalizeWorkspaceId(value));
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

function hasOwn(object, property) {
  return Object.prototype.hasOwnProperty.call(object, property);
}

module.exports = {
  calculatePolicy,
  emptyPolicy,
};
