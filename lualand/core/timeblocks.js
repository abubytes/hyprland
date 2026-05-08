"use strict";

const STATUS = Object.freeze({
  PLANNED: "planned",
  ACTIVE: "active",
  DONE: "done",
  SKIPPED: "skipped",
});

const COMPLETION_MODE = Object.freeze({
  MANUAL: "manual",
  AUTO: "auto-complete",
});

const EVENT_TYPE = Object.freeze({
  STARTED: "timeblock.started",
  COMPLETED: "timeblock.completed",
  SKIPPED: "timeblock.skipped",
  RESET: "timeblock.reset",
  AUTO_START_NEXT: "timeblock.auto_start_next",
});

const REQUIRED_SKIP_ACCOUNTABILITY_PHRASE =
  "I am skipping this timeblock because I am in need to skip, and I accept that this choice is recorded.";

function createTimeblockState(input = {}) {
  const source = Array.isArray(input) ? { blocks: input } : input;
  const blocks = (source.blocks || []).map(normalizeBlock);
  const ids = new Set();
  let activeBlockId = source.activeBlockId || null;

  for (const block of blocks) {
    if (ids.has(block.id)) {
      throw timeblockError("DUPLICATE_BLOCK_ID", `Duplicate timeblock id: ${block.id}`);
    }
    ids.add(block.id);
    if (block.status === STATUS.ACTIVE) {
      if (activeBlockId && activeBlockId !== block.id) {
        throw timeblockError("MULTIPLE_ACTIVE_BLOCKS", "Only one timeblock can be active.");
      }
      activeBlockId = block.id;
    }
  }

  const relations = (source.relations || []).map((relation, index) =>
    normalizeRelation(relation, index, ids),
  );
  const events = (source.events || []).map((event) => cloneJson(event));
  const eventSeq = source.eventSeq ?? maxEventSequence(events);

  return {
    version: 1,
    activeBlockId,
    blocks,
    relations,
    events,
    eventSeq,
  };
}

function startBlock(inputState, blockId, options = {}) {
  const state = cloneState(inputState);
  const at = toIso(options.now);

  if (state.activeBlockId) {
    throw timeblockError(
      "ACTIVE_BLOCK_EXISTS",
      `Cannot start ${blockId}; ${state.activeBlockId} is already active.`,
    );
  }

  const block = getMutableBlock(state, blockId);
  if (block.status !== STATUS.PLANNED) {
    throw timeblockError(
      "BLOCK_NOT_PLANNED",
      `Cannot start ${blockId}; current status is ${block.status}.`,
    );
  }

  block.status = STATUS.ACTIVE;
  block.startedAt = at;
  block.completedAt = null;
  block.skippedAt = null;
  block.plannedEndAt = addMs(at, block.durationMs);
  block.elapsedMs = 0;
  block.overrunMs = 0;
  block.remainingMs = block.durationMs;
  block.completionMode = null;
  block.skipReason = null;
  block.accountabilityPhrase = null;
  state.activeBlockId = block.id;

  appendEvent(state, EVENT_TYPE.STARTED, at, block.id, {
    trigger: options.trigger || "manual",
    relationId: options.relationId || null,
    causedByBlockId: options.causedByBlockId || null,
    durationMs: block.durationMs,
    plannedEndAt: block.plannedEndAt,
    autoComplete: block.autoComplete,
  });

  return state;
}

function completeCurrentBlock(inputState, options = {}) {
  const state = cloneState(inputState);
  if (!state.activeBlockId) {
    throw timeblockError("NO_ACTIVE_BLOCK", "No active timeblock can be completed.");
  }
  return completeActiveBlock(state, state.activeBlockId, {
    ...options,
    mode: COMPLETION_MODE.MANUAL,
  });
}

function advanceTime(inputState, options = {}) {
  let state = cloneState(inputState);
  const observedAt = toIso(options.now);
  let guard = 0;

  while (state.activeBlockId) {
    if (guard > state.blocks.length) {
      throw timeblockError("AUTO_COMPLETE_LOOP", "Auto-complete chain did not settle.");
    }
    guard += 1;

    const active = getMutableBlock(state, state.activeBlockId);
    if (!active.autoComplete) {
      return state;
    }

    const plannedEndAt = active.plannedEndAt || addMs(active.startedAt, active.durationMs);
    if (toEpochMs(observedAt) < toEpochMs(plannedEndAt)) {
      return state;
    }

    state = completeActiveBlock(state, active.id, {
      now: plannedEndAt,
      observedAt,
      mode: COMPLETION_MODE.AUTO,
      note: options.note || null,
    });
  }

  return state;
}

function skipCurrentBlock(inputState, options = {}) {
  const state = cloneState(inputState);
  if (!state.activeBlockId) {
    throw timeblockError("NO_ACTIVE_BLOCK", "No active timeblock can be skipped.");
  }
  return skipBlockById(state, state.activeBlockId, options);
}

function skipBlock(inputState, blockId, options = {}) {
  return skipBlockById(cloneState(inputState), blockId, options);
}

function resetBlock(inputState, blockId, options = {}) {
  const state = cloneState(inputState);
  const at = toIso(options.now);
  const block = getMutableBlock(state, blockId);
  const previousStatus = block.status;
  const previousActiveBlockId = state.activeBlockId;

  block.status = STATUS.PLANNED;
  block.startedAt = null;
  block.completedAt = null;
  block.skippedAt = null;
  block.plannedEndAt = null;
  block.elapsedMs = 0;
  block.overrunMs = 0;
  block.remainingMs = block.durationMs;
  block.completionMode = null;
  block.skipReason = null;
  block.accountabilityPhrase = null;
  block.note = null;

  if (state.activeBlockId === block.id) {
    state.activeBlockId = null;
  }

  appendEvent(state, EVENT_TYPE.RESET, at, block.id, {
    previousStatus,
    previousActiveBlockId,
    reason: normalizeOptionalText(options.reason),
  });

  return state;
}

function resetCurrentBlock(inputState, options = {}) {
  const state = cloneState(inputState);
  if (!state.activeBlockId) {
    throw timeblockError("NO_ACTIVE_BLOCK", "No active timeblock can be reset.");
  }
  return resetBlock(state, state.activeBlockId, options);
}

function getCurrentBlock(inputState, options = {}) {
  const state = cloneState(inputState);
  const now = options.now === undefined ? null : toIso(options.now);

  if (state.activeBlockId) {
    return blockView(getBlock(state, state.activeBlockId), now, { active: true });
  }

  if (now) {
    const scheduled = getScheduledCurrentBlock(state, now);
    if (scheduled) {
      return blockView(scheduled, now, { scheduled: true });
    }
  }

  return null;
}

function getNextBlock(inputState, options = {}) {
  const state = cloneState(inputState);
  const now = options.now === undefined ? null : toIso(options.now);
  const anchorId =
    options.fromBlockId ||
    state.activeBlockId ||
    (now && getScheduledCurrentBlock(state, now)?.id) ||
    getLastTerminalBlockId(state);

  if (anchorId) {
    const relationTarget = getFirstOpenRelationTarget(state, anchorId);
    if (relationTarget) {
      return blockView(relationTarget, now, { next: true, relation: true });
    }

    const nextByOrder = getNextOpenBlockByOrder(state, anchorId);
    return nextByOrder ? blockView(nextByOrder, now, { next: true }) : null;
  }

  const firstOpen = state.blocks.find((block) => isOpenStatus(block.status));
  return firstOpen ? blockView(firstOpen, now, { next: true }) : null;
}

function resolveTimeblocks(inputState, options = {}) {
  const state = cloneState(inputState);
  return {
    current: getCurrentBlock(state, options),
    next: getNextBlock(state, options),
  };
}

function getBlockTiming(block, nowInput) {
  const now = nowInput === undefined || nowInput === null ? null : toIso(nowInput);
  const plannedEndAt =
    block.plannedEndAt ||
    (block.startedAt ? addMs(block.startedAt, block.durationMs) : plannedEndFromSchedule(block));

  if (block.status === STATUS.ACTIVE && now) {
    const elapsedMs = Math.max(0, toEpochMs(now) - toEpochMs(block.startedAt));
    const overrunMs = Math.max(0, toEpochMs(now) - toEpochMs(plannedEndAt));
    return {
      plannedDurationMs: block.durationMs,
      startedAt: block.startedAt,
      plannedEndAt,
      elapsedMs,
      overrunMs,
      remainingMs: Math.max(0, toEpochMs(plannedEndAt) - toEpochMs(now)),
      isBleeding: overrunMs > 0,
    };
  }

  if (block.status === STATUS.PLANNED && block.plannedStartAt && now) {
    const scheduledEndAt = plannedEndFromSchedule(block);
    return {
      plannedDurationMs: block.durationMs,
      startedAt: null,
      plannedEndAt: scheduledEndAt,
      elapsedMs: 0,
      overrunMs: Math.max(0, toEpochMs(now) - toEpochMs(scheduledEndAt)),
      remainingMs: Math.max(0, toEpochMs(scheduledEndAt) - toEpochMs(now)),
      isBleeding: false,
    };
  }

  return {
    plannedDurationMs: block.durationMs,
    startedAt: block.startedAt || null,
    plannedEndAt,
    elapsedMs: block.elapsedMs || 0,
    overrunMs: block.overrunMs || 0,
    remainingMs: block.remainingMs || 0,
    isBleeding: false,
  };
}

function completeActiveBlock(inputState, blockId, options = {}) {
  let state = cloneState(inputState);
  const at = toIso(options.now);
  const block = getMutableBlock(state, blockId);
  if (block.status !== STATUS.ACTIVE || state.activeBlockId !== block.id) {
    throw timeblockError("BLOCK_NOT_ACTIVE", `Cannot complete ${blockId}; it is not active.`);
  }

  const mode =
    options.mode === COMPLETION_MODE.AUTO || options.mode === "auto"
      ? COMPLETION_MODE.AUTO
      : COMPLETION_MODE.MANUAL;
  const timing = getBlockTiming(block, at);

  block.status = STATUS.DONE;
  block.completedAt = at;
  block.elapsedMs = timing.elapsedMs;
  block.overrunMs = timing.overrunMs;
  block.remainingMs = timing.remainingMs;
  block.completionMode = mode;
  block.note = normalizeOptionalText(options.note);
  state.activeBlockId = null;

  appendEvent(state, EVENT_TYPE.COMPLETED, at, block.id, {
    mode,
    observedAt: options.observedAt ? toIso(options.observedAt) : at,
    startedAt: block.startedAt,
    plannedEndAt: timing.plannedEndAt,
    completedAt: at,
    elapsedMs: timing.elapsedMs,
    overrunMs: timing.overrunMs,
    remainingMs: timing.remainingMs,
    note: block.note,
  });

  return maybeAutoStartNext(state, block.id, mode, at);
}

function skipBlockById(state, blockId, options = {}) {
  const at = toIso(options.now);
  const reason = requireNonEmptyText(options.reason, "Skip reason is required.");
  const accountabilityPhrase = requireNonEmptyText(
    options.accountabilityPhrase,
    "Skip accountability phrase is required.",
  );

  if (accountabilityPhrase !== REQUIRED_SKIP_ACCOUNTABILITY_PHRASE) {
    throw timeblockError(
      "INVALID_SKIP_ACCOUNTABILITY_PHRASE",
      "Skip accountability phrase does not match the required phrase.",
    );
  }

  const block = getMutableBlock(state, blockId);
  if (!isOpenStatus(block.status)) {
    throw timeblockError("BLOCK_CLOSED", `Cannot skip ${blockId}; current status is ${block.status}.`);
  }

  const wasActive = state.activeBlockId === block.id;
  const timing = wasActive ? getBlockTiming(block, at) : getBlockTiming(block, null);

  block.status = STATUS.SKIPPED;
  block.skippedAt = at;
  block.completedAt = null;
  block.elapsedMs = timing.elapsedMs;
  block.overrunMs = timing.overrunMs;
  block.remainingMs = timing.remainingMs;
  block.completionMode = null;
  block.skipReason = reason;
  block.accountabilityPhrase = accountabilityPhrase;
  if (wasActive) {
    state.activeBlockId = null;
  }

  appendEvent(state, EVENT_TYPE.SKIPPED, at, block.id, {
    reason,
    accountabilityPhrase,
    wasActive,
    elapsedMs: block.elapsedMs,
    overrunMs: block.overrunMs,
    autoStartSuppressed: true,
  });

  return state;
}

function maybeAutoStartNext(state, fromBlockId, completionMode, at) {
  const relation = findAutoStartRelation(state, fromBlockId, completionMode);
  if (!relation) {
    return state;
  }

  const target = getBlock(state, relation.to);
  if (!target || target.status !== STATUS.PLANNED) {
    return state;
  }

  appendEvent(state, EVENT_TYPE.AUTO_START_NEXT, at, fromBlockId, {
    relationId: relation.id,
    fromBlockId,
    toBlockId: relation.to,
    trigger: relation.trigger,
    completionMode,
  });

  return startBlock(state, relation.to, {
    now: at,
    trigger: "auto-start-next",
    relationId: relation.id,
    causedByBlockId: fromBlockId,
  });
}

function findAutoStartRelation(state, fromBlockId, completionMode) {
  return state.relations.find(
    (relation) =>
      relation.type === "autoStartNext" &&
      relation.from === fromBlockId &&
      relationMatchesCompletion(relation.trigger, completionMode),
  );
}

function relationMatchesCompletion(trigger, completionMode) {
  if (trigger === "done" || trigger === "completed" || trigger === "complete" || trigger === "any") {
    return true;
  }
  if (completionMode === COMPLETION_MODE.MANUAL) {
    return trigger === "manual" || trigger === "manual-done";
  }
  return trigger === "auto" || trigger === "auto-complete";
}

function getFirstOpenRelationTarget(state, fromBlockId) {
  const relation = state.relations.find(
    (candidate) => candidate.type === "autoStartNext" && candidate.from === fromBlockId,
  );
  if (!relation) {
    return null;
  }
  const target = getBlock(state, relation.to);
  return target && isOpenStatus(target.status) ? target : null;
}

function getNextOpenBlockByOrder(state, blockId) {
  const index = state.blocks.findIndex((block) => block.id === blockId);
  if (index === -1) {
    return null;
  }
  return state.blocks.slice(index + 1).find((block) => isOpenStatus(block.status)) || null;
}

function getLastTerminalBlockId(state) {
  for (let index = state.blocks.length - 1; index >= 0; index -= 1) {
    if (state.blocks[index].status === STATUS.DONE || state.blocks[index].status === STATUS.SKIPPED) {
      return state.blocks[index].id;
    }
  }
  return null;
}

function getScheduledCurrentBlock(state, now) {
  const nowMs = toEpochMs(now);
  return (
    state.blocks.find((block) => {
      if (block.status !== STATUS.PLANNED || !block.plannedStartAt) {
        return false;
      }
      const startMs = toEpochMs(block.plannedStartAt);
      const endMs = toEpochMs(plannedEndFromSchedule(block));
      return startMs <= nowMs && nowMs < endMs;
    }) || null
  );
}

function blockView(block, now, flags = {}) {
  const clone = cloneJson(block);
  clone.timing = getBlockTiming(block, now);
  clone.isCurrent = Boolean(flags.active || flags.scheduled);
  clone.isActiveCurrent = Boolean(flags.active);
  clone.isScheduledCurrent = Boolean(flags.scheduled);
  clone.isNext = Boolean(flags.next);
  clone.isRelationNext = Boolean(flags.relation);
  return clone;
}

function normalizeBlock(block, index) {
  if (!block || typeof block !== "object") {
    throw timeblockError("INVALID_BLOCK", "Timeblock must be an object.");
  }

  const id = requireNonEmptyText(block.id, "Timeblock id is required.");
  const title = normalizeOptionalText(block.title) || id;
  const durationMs = normalizeDurationMs(block);
  const status = block.status || STATUS.PLANNED;
  if (!Object.values(STATUS).includes(status)) {
    throw timeblockError("INVALID_BLOCK_STATUS", `Invalid status for ${id}: ${status}`);
  }

  const normalized = {
    ...copyExtraBlockFields(block),
    id,
    title,
    status,
    durationMs,
    autoComplete: Boolean(block.autoComplete),
    order: Number.isFinite(block.order) ? block.order : index,
    plannedStartAt: block.plannedStartAt ? toIso(block.plannedStartAt) : null,
    plannedEndAt: block.plannedEndAt ? toIso(block.plannedEndAt) : null,
    startedAt: block.startedAt ? toIso(block.startedAt) : null,
    completedAt: block.completedAt ? toIso(block.completedAt) : null,
    skippedAt: block.skippedAt ? toIso(block.skippedAt) : null,
    elapsedMs: block.elapsedMs || 0,
    overrunMs: block.overrunMs || 0,
    remainingMs: block.remainingMs || durationMs,
    completionMode: block.completionMode || null,
    skipReason: block.skipReason || null,
    accountabilityPhrase: block.accountabilityPhrase || null,
    note: block.note || null,
  };

  if (normalized.status === STATUS.ACTIVE && !normalized.startedAt) {
    throw timeblockError("ACTIVE_BLOCK_MISSING_START", `Active block ${id} needs startedAt.`);
  }
  if (normalized.status === STATUS.ACTIVE && !normalized.plannedEndAt) {
    normalized.plannedEndAt = addMs(normalized.startedAt, normalized.durationMs);
  }

  return normalized;
}

function normalizeRelation(relation, index, blockIds) {
  if (!relation || typeof relation !== "object") {
    throw timeblockError("INVALID_RELATION", "Timeblock relation must be an object.");
  }

  const from = requireNonEmptyText(
    relation.from || relation.fromBlockId,
    "Relation from block id is required.",
  );
  const to = requireNonEmptyText(
    relation.to || relation.toBlockId || relation.nextId,
    "Relation target block id is required.",
  );
  if (blockIds && (!blockIds.has(from) || !blockIds.has(to))) {
    throw timeblockError("RELATION_BLOCK_NOT_FOUND", `Relation ${from} -> ${to} references a missing block.`);
  }

  const trigger = relation.trigger || "done";
  const type = relation.type || relation.action || "autoStartNext";

  return {
    ...cloneJson(relation),
    id: relation.id || `relation_${index + 1}_${from}_to_${to}`,
    type,
    trigger,
    from,
    to,
  };
}

function normalizeDurationMs(block) {
  const durationMs =
    block.durationMs ??
    (block.durationSeconds === undefined ? undefined : block.durationSeconds * 1000) ??
    (block.durationMinutes === undefined ? undefined : block.durationMinutes * 60 * 1000);

  if (!Number.isFinite(durationMs) || durationMs <= 0) {
    throw timeblockError("INVALID_DURATION", `Timeblock ${block.id || "<unknown>"} needs a positive duration.`);
  }
  return durationMs;
}

function copyExtraBlockFields(block) {
  const reserved = new Set([
    "id",
    "title",
    "status",
    "durationMs",
    "durationSeconds",
    "durationMinutes",
    "autoComplete",
    "order",
    "plannedStartAt",
    "plannedEndAt",
    "startedAt",
    "completedAt",
    "skippedAt",
    "elapsedMs",
    "overrunMs",
    "remainingMs",
    "completionMode",
    "skipReason",
    "accountabilityPhrase",
    "note",
  ]);
  const extra = {};
  for (const [key, value] of Object.entries(block)) {
    if (!reserved.has(key)) {
      extra[key] = cloneJson(value);
    }
  }
  return extra;
}

function cloneState(inputState) {
  if (
    !inputState ||
    !Array.isArray(inputState.blocks) ||
    inputState.version !== 1 ||
    inputState.blocks.some((block) => !Number.isFinite(block.durationMs))
  ) {
    return createTimeblockState(inputState);
  }

  return {
    version: inputState.version || 1,
    activeBlockId: inputState.activeBlockId || null,
    blocks: inputState.blocks.map((block) => cloneJson(block)),
    relations: (inputState.relations || []).map((relation) => cloneJson(relation)),
    events: (inputState.events || []).map((event) => cloneJson(event)),
    eventSeq: inputState.eventSeq ?? maxEventSequence(inputState.events || []),
  };
}

function appendEvent(state, type, at, blockId, payload = {}) {
  const sequence = (state.eventSeq || 0) + 1;
  state.eventSeq = sequence;
  state.events.push({
    id: `evt_${String(sequence).padStart(4, "0")}`,
    sequence,
    type,
    at,
    blockId,
    payload: cloneJson(payload),
  });
}

function getBlock(state, blockId) {
  return state.blocks.find((block) => block.id === blockId) || null;
}

function getMutableBlock(state, blockId) {
  const block = getBlock(state, blockId);
  if (!block) {
    throw timeblockError("BLOCK_NOT_FOUND", `Unknown timeblock id: ${blockId}`);
  }
  return block;
}

function isOpenStatus(status) {
  return status === STATUS.PLANNED || status === STATUS.ACTIVE;
}

function plannedEndFromSchedule(block) {
  if (block.plannedEndAt) {
    return block.plannedEndAt;
  }
  if (!block.plannedStartAt) {
    return null;
  }
  return addMs(block.plannedStartAt, block.durationMs);
}

function toIso(value = new Date()) {
  const date =
    value instanceof Date
      ? value
      : typeof value === "number"
        ? new Date(value)
        : typeof value === "string"
          ? new Date(value)
          : null;

  if (!date || Number.isNaN(date.getTime())) {
    throw timeblockError("INVALID_TIME", `Invalid time value: ${value}`);
  }
  return date.toISOString();
}

function toEpochMs(value) {
  if (!value) {
    return null;
  }
  const ms = new Date(value).getTime();
  if (Number.isNaN(ms)) {
    throw timeblockError("INVALID_TIME", `Invalid time value: ${value}`);
  }
  return ms;
}

function addMs(value, ms) {
  return new Date(toEpochMs(value) + ms).toISOString();
}

function normalizeOptionalText(value) {
  if (value === undefined || value === null) {
    return null;
  }
  const text = String(value).trim();
  return text.length > 0 ? text : null;
}

function requireNonEmptyText(value, message) {
  const text = normalizeOptionalText(value);
  if (!text) {
    throw timeblockError("MISSING_TEXT", message);
  }
  return text;
}

function timeblockError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function maxEventSequence(events) {
  return events.reduce((max, event) => Math.max(max, event.sequence || 0), 0);
}

function cloneJson(value) {
  if (value === undefined || value === null) {
    return value;
  }
  return JSON.parse(JSON.stringify(value));
}

module.exports = {
  STATUS,
  COMPLETION_MODE,
  EVENT_TYPE,
  REQUIRED_SKIP_ACCOUNTABILITY_PHRASE,
  createTimeblockState,
  startBlock,
  completeCurrentBlock,
  done: completeCurrentBlock,
  advanceTime,
  tick: advanceTime,
  skipCurrentBlock,
  skipBlock,
  resetBlock,
  resetCurrentBlock,
  getCurrentBlock,
  getNextBlock,
  resolveTimeblocks,
  getBlockTiming,
};
