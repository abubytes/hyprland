'use strict';

const WORKSPACE_COUNT = 10;
const DEFAULT_EDP_WORKSPACE_OFFSET = 100;

const NUMPAD_KEY_ALIASES = {
  '1': '1',
  Numpad1: '1',
  KP_1: '1',
  KP_End: '1',
  '2': '2',
  Numpad2: '2',
  KP_2: '2',
  KP_Down: '2',
  '3': '3',
  Numpad3: '3',
  KP_3: '3',
  KP_Page_Down: '3',
  '4': '4',
  Numpad4: '4',
  KP_4: '4',
  KP_Left: '4',
  '5': '5',
  Numpad5: '5',
  KP_5: '5',
  KP_Begin: '5',
  '6': '6',
  Numpad6: '6',
  KP_6: '6',
  KP_Right: '6',
  '7': '7',
  Numpad7: '7',
  KP_7: '7',
  KP_Home: '7',
  '8': '8',
  Numpad8: '8',
  KP_8: '8',
  KP_Up: '8',
  '9': '9',
  Numpad9: '9',
  KP_9: '9',
  KP_Page_Up: '9',
};

function createWorkstationModel(input = {}) {
  if (isWorkstationModel(input)) {
    return input;
  }

  const config = Array.isArray(input) ? { workstations: input } : input;
  const defaults = normalizeDefaults(config);
  const rawWorkstations = asArray(config.workstations);
  const workstations = rawWorkstations.map((entry, index) =>
    normalizeWorkstation(entry, index, defaults)
  );

  const byId = {};
  const workspaceById = {};

  for (const workstation of workstations) {
    if (byId[workstation.id]) {
      throw new Error(`Duplicate workstation id: ${workstation.id}`);
    }

    byId[workstation.id] = workstation;

    for (const workspace of workstation.workspaces) {
      const key = workspaceKey(workspace.id);

      if (workspaceById[key]) {
        throw new Error(
          `Duplicate workspace id ${String(workspace.id)} on ` +
            `${workstation.id} and ${workspaceById[key].workstationId}`
        );
      }

      workspaceById[key] = {
        workstation,
        workstationId: workstation.id,
        workspace,
      };
    }
  }

  const numpad = normalizeNumpadMapping(config, workstations, byId);
  const numpadByKey = Object.fromEntries(numpad.map((entry) => [entry.key, entry]));

  return {
    __lualandWorkstationModel: true,
    defaults,
    workstations,
    byId,
    workspaceById,
    numpad,
    numpadByKey,
  };
}

function normalizeDefaults(config = {}) {
  const configured = {
    ...(config.defaults || {}),
  };

  return {
    workspaceCount: positiveInteger(
      firstDefined(configured.workspaceCount, config.workspaceCount, WORKSPACE_COUNT),
      'defaults.workspaceCount'
    ),
    hdmiMonitor: String(
      firstDefined(configured.hdmiMonitor, config.hdmiMonitor, config.mainMonitor, 'HDMI')
    ),
    edpMonitor: String(firstDefined(configured.edpMonitor, config.edpMonitor, 'eDP')),
    includeEdp: Boolean(firstDefined(configured.includeEdp, config.includeEdp, false)),
    edpMode: normalizeEdpMode(firstDefined(configured.edpMode, config.edpMode, 'extension')),
    edpWorkspaceOffset: integer(
      firstDefined(
        configured.edpWorkspaceOffset,
        config.edpWorkspaceOffset,
        DEFAULT_EDP_WORKSPACE_OFFSET
      ),
      'defaults.edpWorkspaceOffset'
    ),
  };
}

function normalizeWorkstation(entry, index, defaults) {
  const raw = typeof entry === 'string' ? { id: entry, name: entry } : entry || {};
  const id = String(firstDefined(raw.id, raw.workstationId, raw.slug, '')).trim();

  if (!id) {
    throw new Error(`Workstation at index ${index} is missing an id`);
  }

  const slot = positiveInteger(
    firstDefined(raw.slot, raw.decade, raw.number, index + 1),
    `workstation ${id} slot`
  );
  const workspaceCount = positiveInteger(
    firstDefined(raw.workspaceCount, defaults.workspaceCount),
    `workstation ${id} workspaceCount`
  );

  const hdmiIds = normalizeWorkspaceIds(
    firstDefined(raw.hdmiWorkspaceIds, raw.workspaceIds),
    firstDefined(raw.hdmiWorkspaceStart, raw.workspaceStart, decadeStart(slot, workspaceCount)),
    workspaceCount,
    `workstation ${id} hdmiWorkspaceIds`
  );
  const hdmiMonitor = String(firstDefined(raw.hdmiMonitor, raw.monitor, defaults.hdmiMonitor));
  const hdmiWorkspaces = buildWorkspaceRecords({
    ids: hdmiIds,
    workstationId: id,
    slot,
    monitor: hdmiMonitor,
    surface: 'hdmi',
    role: 'main',
  });

  const edpConfig = normalizeEdpConfig(raw, defaults);
  const edpWorkspaces = edpConfig.enabled
    ? buildWorkspaceRecords({
        ids: normalizeWorkspaceIds(
          firstDefined(raw.edpWorkspaceIds, raw.extensionWorkspaceIds, raw.mirrorWorkspaceIds),
          firstDefined(
            raw.edpWorkspaceStart,
            raw.extensionWorkspaceStart,
            defaults.edpWorkspaceOffset + decadeStart(slot, workspaceCount)
          ),
          workspaceCount,
          `workstation ${id} edpWorkspaceIds`
        ),
        workstationId: id,
        slot,
        monitor: String(firstDefined(raw.edpMonitor, defaults.edpMonitor)),
        surface: 'edp',
        role: edpConfig.mode,
      })
    : [];

  const hidden = Boolean(raw.hidden);
  const visible = !hidden && firstDefined(raw.visible, true) !== false;
  const blocked = Boolean(raw.blocked);
  const numpadKey = raw.numpadKey || raw.numpad || raw.key;

  return {
    id,
    name: String(firstDefined(raw.name, raw.title, id)),
    slot,
    workspaceCount,
    icon: raw.icon || null,
    color: raw.color || null,
    hidden,
    visible,
    blocked,
    numpadKey: numpadKey ? normalizeNumpadKey(numpadKey) : null,
    hdmiMonitor,
    edpMonitor: edpConfig.enabled ? String(firstDefined(raw.edpMonitor, defaults.edpMonitor)) : null,
    edpMode: edpConfig.enabled ? edpConfig.mode : 'none',
    hdmiWorkspaces,
    edpWorkspaces,
    workspaces: [...hdmiWorkspaces, ...edpWorkspaces],
  };
}

function normalizeEdpConfig(raw, defaults) {
  const value = firstDefined(raw.edp, raw.eDP, raw.includeEdp, raw.includeEDP, undefined);

  if (value && typeof value === 'object') {
    return {
      enabled: firstDefined(value.enabled, value.include, true) !== false,
      mode: normalizeEdpMode(firstDefined(value.mode, raw.edpMode, defaults.edpMode)),
    };
  }

  if (typeof value === 'string') {
    const mode = normalizeEdpMode(value);
    return {
      enabled: mode !== 'none',
      mode,
    };
  }

  if (typeof value === 'boolean') {
    return {
      enabled: value,
      mode: normalizeEdpMode(firstDefined(raw.edpMode, defaults.edpMode)),
    };
  }

  if (raw.edpMode) {
    const mode = normalizeEdpMode(raw.edpMode);
    return {
      enabled: mode !== 'none',
      mode,
    };
  }

  return {
    enabled: defaults.includeEdp,
    mode: normalizeEdpMode(defaults.edpMode),
  };
}

function normalizeEdpMode(value) {
  const mode = String(value || 'extension').trim().toLowerCase();

  if (mode === 'extend') return 'extension';
  if (mode === 'extended') return 'extension';
  if (mode === 'extension') return 'extension';
  if (mode === 'mirror') return 'mirror';
  if (mode === 'mirrored') return 'mirror';
  if (mode === 'none' || mode === 'off' || mode === 'disabled') return 'none';

  throw new Error(`Unsupported eDP mode: ${String(value)}`);
}

function normalizeWorkspaceIds(rawIds, start, count, label) {
  if (rawIds !== undefined) {
    const ids = asArray(rawIds);

    if (ids.length !== count) {
      throw new Error(`${label} must contain exactly ${count} workspaces`);
    }

    return ids.map(normalizeWorkspaceId);
  }

  const normalizedStart = integer(start, label);
  return Array.from({ length: count }, (_, index) => normalizedStart + index).map(normalizeWorkspaceId);
}

function buildWorkspaceRecords({ ids, workstationId, slot, monitor, surface, role }) {
  return ids.map((id, index) => ({
    id,
    workspaceId: id,
    local: index + 1,
    workstationId,
    workstationSlot: slot,
    monitor,
    output: monitor,
    surface,
    role,
  }));
}

function normalizeNumpadMapping(config, workstations, byId) {
  const entries = [];
  const seenKeys = new Set();
  const rawMapping = firstDefined(config.numpad, config.numpadMapping, null);

  if (rawMapping) {
    for (const [rawKey, target] of Object.entries(rawMapping)) {
      entries.push(normalizeNumpadEntry(rawKey, target, byId));
    }
  }

  for (const workstation of workstations) {
    if (!workstation.numpadKey) continue;
    entries.push(normalizeNumpadEntry(workstation.numpadKey, workstation.id, byId));
  }

  for (const entry of entries) {
    if (seenKeys.has(entry.key)) {
      throw new Error(`Duplicate numpad key mapping: ${entry.key}`);
    }

    seenKeys.add(entry.key);
  }

  return entries.sort((left, right) => Number(left.key) - Number(right.key));
}

function normalizeNumpadEntry(rawKey, target, byId) {
  const key = normalizeNumpadKey(rawKey);
  const targetObject =
    target && typeof target === 'object'
      ? target
      : {
          workstationId: target,
        };
  const workstationId = String(
    firstDefined(targetObject.workstationId, targetObject.id, targetObject.workstation)
  );
  const workstation = byId[workstationId];

  if (!workstation) {
    throw new Error(`Numpad key ${key} points at unknown workstation: ${workstationId}`);
  }

  const workspaceLocal = positiveInteger(
    firstDefined(targetObject.workspaceLocal, targetObject.local, 1),
    `numpad ${key} workspaceLocal`
  );

  if (workspaceLocal > workstation.workspaceCount) {
    throw new Error(
      `Numpad key ${key} workspaceLocal ${workspaceLocal} is outside workstation ${workstationId}`
    );
  }

  const workspaceId = firstDefined(
    targetObject.workspaceId,
    targetObject.workspace,
    workstation.hdmiWorkspaces[workspaceLocal - 1].id
  );

  return {
    key,
    workstationId,
    workstation,
    workspaceLocal,
    workspaceId: normalizeWorkspaceId(workspaceId),
    visible: isVisibleWorkstation(workstation),
  };
}

function normalizeNumpadKey(value) {
  const raw = String(value).trim();
  const key = NUMPAD_KEY_ALIASES[raw];

  if (!key) {
    throw new Error(`Unsupported numpad key: ${raw}`);
  }

  return key;
}

function getVisibleWorkstations(modelOrConfig, options = {}) {
  const model = ensureWorkstationModel(modelOrConfig);
  const allowed = options.allowedWorkstations
    ? new Set(asArray(options.allowedWorkstations).map(String))
    : null;
  const blocked = new Set(asArray(options.blockedWorkstations).map(String));

  return model.workstations.filter((workstation) => {
    if (!isVisibleWorkstation(workstation, options)) return false;
    if (allowed && !allowed.has(workstation.id)) return false;
    if (blocked.has(workstation.id)) return false;
    return true;
  });
}

function getHiddenWorkstations(modelOrConfig, options = {}) {
  const model = ensureWorkstationModel(modelOrConfig);
  const visible = new Set(getVisibleWorkstations(model, options).map((workstation) => workstation.id));
  return model.workstations.filter((workstation) => !visible.has(workstation.id));
}

function getNumpadMapping(modelOrConfig, options = {}) {
  const model = ensureWorkstationModel(modelOrConfig);

  if (!options.visibleOnly) {
    return model.numpad.slice();
  }

  return model.numpad.filter((entry) => isVisibleWorkstation(entry.workstation, options));
}

function findWorkspaceById(modelOrConfig, activeWorkspace) {
  const model = ensureWorkstationModel(modelOrConfig);
  const workspaceId = extractWorkspaceId(activeWorkspace);

  if (workspaceId === null) {
    return null;
  }

  return model.workspaceById[workspaceKey(workspaceId)] || null;
}

function findWorkstationByWorkspaceId(modelOrConfig, activeWorkspace) {
  const record = findWorkspaceById(modelOrConfig, activeWorkspace);
  return record ? record.workstation : null;
}

function getCurrentWorkstation(modelOrConfig, runtime = {}) {
  return findWorkstationByWorkspaceId(
    modelOrConfig,
    firstDefined(runtime.workspaceId, runtime.activeWorkspaceId, runtime.activeWorkspace, runtime)
  );
}

function getWorkspaceIdsForWorkstations(modelOrConfig, workstationIds) {
  const model = ensureWorkstationModel(modelOrConfig);
  const ids = [];

  for (const workstationId of asArray(workstationIds).map(String)) {
    const workstation = model.byId[workstationId];
    if (!workstation) continue;
    ids.push(...workstation.workspaces.map((workspace) => workspace.id));
  }

  return uniqueByWorkspaceId(ids);
}

function getAllWorkspaceIds(modelOrConfig) {
  return ensureWorkstationModel(modelOrConfig).workstations.flatMap((workstation) =>
    workstation.workspaces.map((workspace) => workspace.id)
  );
}

function isVisibleWorkstation(workstation, options = {}) {
  if (!workstation) return false;
  if (workstation.hidden || workstation.visible === false) return false;
  if (workstation.blocked && !options.includeBlocked) return false;
  return true;
}

function ensureWorkstationModel(value) {
  return isWorkstationModel(value) ? value : createWorkstationModel(value);
}

function isWorkstationModel(value) {
  return Boolean(value && value.__lualandWorkstationModel === true);
}

function extractWorkspaceId(activeWorkspace) {
  if (activeWorkspace === null || activeWorkspace === undefined) {
    return null;
  }

  if (typeof activeWorkspace === 'object') {
    return normalizeWorkspaceId(
      firstDefined(activeWorkspace.id, activeWorkspace.workspaceId, activeWorkspace.name, null)
    );
  }

  return normalizeWorkspaceId(activeWorkspace);
}

function normalizeWorkspaceId(value) {
  if (value === null || value === undefined) {
    return value;
  }

  if (typeof value === 'number') {
    if (!Number.isInteger(value)) {
      throw new Error(`Workspace id must be an integer or string: ${String(value)}`);
    }

    return value;
  }

  const text = String(value).trim();
  if (/^-?\d+$/.test(text)) {
    return Number(text);
  }

  return text;
}

function workspaceKey(value) {
  return String(normalizeWorkspaceId(value));
}

function decadeStart(slot, workspaceCount) {
  return (slot - 1) * workspaceCount + 1;
}

function uniqueByWorkspaceId(values) {
  const seen = new Set();
  const result = [];

  for (const value of values) {
    const normalized = normalizeWorkspaceId(value);
    const key = workspaceKey(normalized);

    if (seen.has(key)) continue;
    seen.add(key);
    result.push(normalized);
  }

  return result;
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

function integer(value, label) {
  const number = typeof value === 'number' ? value : Number(value);

  if (!Number.isInteger(number)) {
    throw new Error(`${label} must be an integer`);
  }

  return number;
}

function positiveInteger(value, label) {
  const number = integer(value, label);

  if (number <= 0) {
    throw new Error(`${label} must be positive`);
  }

  return number;
}

module.exports = {
  WORKSPACE_COUNT,
  createWorkstationModel,
  ensureWorkstationModel,
  findWorkspaceById,
  findWorkstationByWorkspaceId,
  getAllWorkspaceIds,
  getCurrentWorkstation,
  getHiddenWorkstations,
  getNumpadMapping,
  getVisibleWorkstations,
  getWorkspaceIdsForWorkstations,
  isVisibleWorkstation,
  normalizeNumpadKey,
  normalizeWorkspaceId,
};
