"use strict";

const {
  STATUS,
  createTimeblockState,
  getCurrentBlock,
  getNextBlock,
  getTimerControl,
  getBlockTiming,
} = require("./timeblocks.js");
const {
  ensureWorkstationModel,
  getCurrentWorkstation,
  getVisibleWorkstations,
} = require("./workstations.js");
const { calculatePolicy } = require("./policy.js");

const TASK_STATUS_ORDER = Object.freeze({
  "in-progress": 0,
  undone: 1,
  done: 2,
});

function createViewState(engineInput = {}, workstationInput = {}, options = {}) {
  const config =
    arguments.length === 1 && looksLikeConfigObject(engineInput)
      ? engineInput
      : {
          engineState: engineInput,
          workstationModel: workstationInput,
          ...options,
        };

  const now = normalizeDate(config.now);
  const timeZone = config.timeZone || undefined;
  const engineStateSource = firstDefined(config.engineState, config.timeblocks, config.state);
  const engineState = normalizeEngineState(engineStateSource);
  const workstationModel = ensureWorkstationModel(
    firstDefined(config.workstationModel, config.workstations, workstationInput, { workstations: [] }),
  );
  const runtime = config.runtime || {};
  const current = getCurrentBlock(engineState, { now });
  const next = getNextBlock(engineState, { now });
  const timerControl = getTimerControl(engineState, { now });
  const activeWorkstationId = resolveActiveWorkstationId({
    workstationModel,
    runtime,
    current,
  });
  const dayLabel = formatDayLabel(now, timeZone);
  const bar = buildBar({
    now,
    dayLabel,
    timeZone,
    runtime,
    current,
    next,
    activeWorkstationId,
    workstationModel,
  });

  return {
    dayLabel,
    updatedAt: now,
    bar,
    bars: {
      laptop: bar,
      work: bar,
    },
    gm: buildGm({ gm: config.gm, dayLabel, current, next }),
    summary: buildSummary({ current, next, summary: config.summary }),
    timer: buildTimer(timerControl),
    activeBlock: buildActiveBlock(current, next, timerControl, workstationModel, { timeZone }),
    workstations: buildWorkstations(workstationModel, { activeWorkstationId }),
    timeline: buildTimeline(engineState, workstationModel, { current, next, now, timeZone }),
    tasks: buildTasks(resolveTasks(config.tasks, engineState, engineStateSource)),
  };
}

function normalizeEngineState(input) {
  if (input === undefined || input === null) {
    return createTimeblockState({ blocks: [] });
  }

  return createTimeblockState(input);
}

function buildActiveBlock(current, next, timerControl, workstationModel, options) {
  if (!current) {
    return {
      id: next ? next.id : null,
      name: next ? next.title : "No active block",
      time: "--:--",
      workstation: next ? resolveBlockWorkstationLabel(next, workstationModel) : "any workstation",
      status: timerControl.state,
      remainingMs: 0,
      overrunMs: 0,
      remainingText: "",
      overrunText: "",
      debtText: "0m debt",
      isOverrun: false,
      isBleeding: false,
      primaryAction: timerControl.primaryAction,
      primaryLabel: timerControl.primaryLabel,
    };
  }

  const timing = current.timing || {};
  const remainingMs = normalizeNonNegativeMs(timing.remainingMs);
  const overrunMs = normalizeNonNegativeMs(timing.overrunMs);

  return {
    id: current.id,
    name: current.title || current.id,
    time: formatBlockRange(current, options.timeZone),
    workstation: resolveBlockWorkstationLabel(current, workstationModel),
    status: "active",
    remainingMs,
    overrunMs,
    remainingText: formatDurationText(remainingMs, "left"),
    overrunText: overrunMs > 0 ? formatDurationText(overrunMs, "over") : "",
    debtText: overrunMs > 0 ? formatDurationText(overrunMs, "debt") : "0m debt",
    isOverrun: overrunMs > 0,
    isBleeding: Boolean(timing.isBleeding || overrunMs > 0),
    primaryAction: timerControl.primaryAction,
    primaryLabel: timerControl.primaryLabel,
  };
}

function buildTimer(control) {
  const timing = control.timing || {};
  const remainingMs = normalizeNonNegativeMs(timing.remainingMs);
  const overrunMs = normalizeNonNegativeMs(timing.overrunMs);

  return {
    state: control.state,
    primaryAction: control.primaryAction,
    primaryLabel: control.primaryLabel,
    blockId: control.blockId,
    title: control.title,
    canSkip: control.canSkip,
    canDone: control.canDone,
    remainingMs,
    overrunMs,
    remainingText: control.state === "active" ? formatDurationText(remainingMs, "left") : "",
    debtText: overrunMs > 0 ? formatDurationText(overrunMs, "debt") : "0m debt",
  };
}

function buildBar({ now, dayLabel, timeZone, runtime, current, next, activeWorkstationId, workstationModel }) {
  const activeWorkstation =
    activeWorkstationId && workstationModel.byId[activeWorkstationId]
      ? workstationModel.byId[activeWorkstationId].name
      : activeWorkstationId || "any";
  const workspace = firstDefined(
    runtime.activeWorkspaceName,
    runtime.workspaceName,
    runtime.activeWorkspaceId,
    runtime.workspaceId,
    "--",
  );

  return {
    time: formatTime(now, timeZone),
    date: dayLabel,
    workspace: String(workspace),
    workstation: activeWorkstation,
    block: current ? current.title : next ? `Next: ${next.title}` : "No block",
  };
}

function buildGm({ gm, dayLabel, current, next }) {
  if (gm && typeof gm === "object") {
    return {
      title: String(firstDefined(gm.title, "GM")),
      line1: String(firstDefined(gm.line1, current ? current.title : "No active block")),
      line2: String(firstDefined(gm.line2, next ? `Next: ${next.title}` : "No queued block")),
      status: String(firstDefined(gm.status, current ? "active" : "idle")),
    };
  }

  return {
    title: "GM",
    line1: current ? current.title : "No active block",
    line2: next ? `Next: ${next.title}` : dayLabel,
    status: current ? "active" : "idle",
  };
}

function buildWorkstations(workstationModel, options) {
  return getVisibleWorkstations(workstationModel).map((workstation) => ({
    id: workstation.id,
    label: workstation.name,
    short: workstation.short || workstation.name.slice(0, 1).toUpperCase(),
    iconName: workstation.iconName || workstation.icon || deriveWorkstationIcon(workstation),
    workspace: formatWorkspaceRange(workstation.hdmiWorkspaces.length > 0 ? workstation.hdmiWorkspaces : workstation.workspaces),
    range: formatWorkspaceRange(workstation.hdmiWorkspaces.length > 0 ? workstation.hdmiWorkspaces : workstation.workspaces),
    active: workstation.id === options.activeWorkstationId,
  }));
}

function deriveWorkstationIcon(workstation) {
  const name = `${workstation.id || ""} ${workstation.name || ""}`.toLowerCase();
  if (name.includes("study") || name.includes("german") || name.includes("anki")) return "accessories-dictionary";
  if (name.includes("slack") || name.includes("remote")) return "internet-web-browser";
  if (name.includes("productivity") || name.includes("config")) return "emblem-system";
  if (name.includes("shell") || name.includes("rzn")) return "utilities-terminal";
  if (name.includes("work") || name.includes("haulerz") || name.includes("rafid")) return "applications-development";
  if (name.includes("sarah") || name.includes("wadud") || name.includes("lama")) return "x-office-address-book";
  if (name.includes("howdaj") || name.includes("mareen") || name.includes("atheer")) return "applications-internet";
  if (name.includes("adhd") || name.includes("morning") || name.includes("rest")) return "appointment-soon";
  return "folder";
}

function buildTimeline(engineState, workstationModel, options) {
  const currentId = options.current ? options.current.id : null;
  const nextId = options.next ? options.next.id : null;

  return engineState.blocks
    .slice()
    .sort(compareBlocks)
    .map((block) => {
      const viewBlock =
        currentId === block.id
          ? options.current
          : nextId === block.id
            ? options.next
            : {
                ...block,
                timing: getBlockTiming(block, options.now),
              };
      const isCurrent = currentId === block.id;
      const isNext = nextId === block.id;

      return {
        id: block.id,
        time: formatBlockStart(viewBlock, options.timeZone),
        title: block.title || block.id,
        detail: resolveBlockDetail(block),
        workstation: resolveBlockWorkstationLabel(block, workstationModel),
        remainingText:
          isCurrent && viewBlock.timing
            ? formatDurationText(normalizeNonNegativeMs(viewBlock.timing.remainingMs), "left")
            : "",
        debtText:
          isCurrent && viewBlock.timing && normalizeNonNegativeMs(viewBlock.timing.overrunMs) > 0
            ? formatDurationText(normalizeNonNegativeMs(viewBlock.timing.overrunMs), "debt")
            : "",
        status: timelineStatus(block, isCurrent),
        isCurrent,
        isNext,
      };
    });
}

function buildTasks(tasks) {
  return asArray(tasks)
    .map((task, index) => normalizeTask(task, index))
    .sort((left, right) => {
      const statusDelta = TASK_STATUS_ORDER[left.status] - TASK_STATUS_ORDER[right.status];
      return statusDelta || left.order - right.order;
    })
    .map(({ order, ...task }) => task);
}

function resolveTasks(explicitTasks, engineState, engineStateSource) {
  const explicit = asArray(explicitTasks);
  if (explicit.length > 0) {
    return explicit;
  }

  return collectTopLevelTasks(engineStateSource).concat(collectBlockTasks(engineState));
}

function collectTopLevelTasks(source) {
  if (!source || typeof source !== "object") {
    return [];
  }

  return asArray(source.tasks);
}

function collectBlockTasks(source) {
  if (!source || typeof source !== "object") {
    return [];
  }

  const tasks = [];
  for (const block of asArray(source.blocks)) {
    if (block && typeof block === "object") {
      tasks.push(...asArray(block.tasks));
    }
  }

  return tasks;
}

function normalizeTask(task, index) {
  if (typeof task === "string") {
    return {
      id: `task_${index + 1}`,
      title: task,
      status: "undone",
      done: false,
      order: index,
    };
  }

  const source = task && typeof task === "object" ? task : {};
  const status = normalizeTaskStatus(source);

  return {
    id: source.id === undefined || source.id === null ? `task_${index + 1}` : String(source.id),
    title: String(firstDefined(source.title, source.name, source.text, `Task ${index + 1}`)),
    status,
    done: status === "done",
    order: index,
  };
}

function normalizeTaskStatus(task) {
  const rawStatus = firstDefined(task.status, task.state);

  if (rawStatus !== undefined && rawStatus !== null) {
    const status = String(rawStatus).trim().toLowerCase().replace(/_/g, "-");
    if (["in-progress", "active", "doing", "current", "started"].includes(status)) {
      return "in-progress";
    }
    if (["done", "complete", "completed", "finished"].includes(status)) {
      return "done";
    }
    if (["undone", "todo", "to-do", "open", "queued", "planned", "pending"].includes(status)) {
      return "undone";
    }
  }

  if (task.done === true || task.completed === true || task.completedAt) {
    return "done";
  }

  return "undone";
}

function resolveActiveWorkstationId({ workstationModel, runtime, current }) {
  const explicit = firstDefined(runtime.activeWorkstationId, runtime.workstationId, runtime.workstation);
  if (explicit !== undefined && explicit !== null) {
    return String(explicit);
  }

  const currentRuntimeWorkstation = getCurrentWorkstation(workstationModel, runtime);
  if (currentRuntimeWorkstation) {
    return currentRuntimeWorkstation.id;
  }

  return current ? resolveBlockWorkstationId(current, workstationModel) : null;
}

function resolveBlockWorkstationLabel(block, workstationModel) {
  const id = resolveBlockWorkstationId(block, workstationModel);
  if (!id) {
    return "any workstation";
  }

  return workstationModel.byId[id] ? workstationModel.byId[id].name : id;
}

function resolveBlockWorkstationId(block, workstationModel) {
  const direct = findFirstString([
    block.workstationId,
    block.workstation,
    block.focusWorkstationId,
    block.hardLockWorkstationId,
    block.policy && block.policy.workstationId,
    block.policy && block.policy.workstation,
    block.policy && block.policy.focusWorkstationId,
    block.policy && block.policy.hardLockWorkstationId,
    block.lock && block.lock.workstationId,
    block.lock && block.lock.workstation,
    block.lock && block.lock.hardLockWorkstationId,
    block.policy && block.policy.lock && block.policy.lock.workstationId,
    block.policy && block.policy.lock && block.policy.lock.workstation,
    block.policy && block.policy.lock && block.policy.lock.hardLockWorkstationId,
  ]);
  if (direct) {
    return direct;
  }

  const policy = calculatePolicy(block, workstationModel);
  return policy.focusWorkstationId || policy.lock.workstationId || null;
}

function timelineStatus(block, isCurrent) {
  if (isCurrent) {
    return "active";
  }

  if (block.status === STATUS.DONE || block.status === STATUS.SKIPPED) {
    return "done";
  }

  return "queued";
}

function resolveBlockDetail(block) {
  const detail = findFirstString([block.detail, block.description, block.summary, block.note]);
  if (detail) {
    return detail;
  }

  if (block.autoComplete) {
    return "Auto-completes at the planned end.";
  }

  return "";
}

function buildSummary({ current, next, summary }) {
  if (summary !== undefined && summary !== null) {
    return String(summary);
  }

  if (current && next) {
    return `Current: ${current.title || current.id}. Next: ${next.title || next.id}.`;
  }
  if (current) {
    return `Current: ${current.title || current.id}.`;
  }
  if (next) {
    return `Next: ${next.title || next.id}.`;
  }

  return "No active or queued blocks.";
}

function compareBlocks(left, right) {
  const leftOrder = Number.isFinite(left.order) ? left.order : 0;
  const rightOrder = Number.isFinite(right.order) ? right.order : 0;
  if (leftOrder !== rightOrder) {
    return leftOrder - rightOrder;
  }

  return String(left.id).localeCompare(String(right.id));
}

function formatWorkspaceRange(workspaces) {
  const ids = workspaces.map((workspace) => workspace.id);
  if (ids.length === 0) {
    return "";
  }

  if (ids.every((id) => Number.isInteger(id))) {
    const first = ids[0];
    const contiguous = ids.every((id, index) => id === first + index);
    if (contiguous) {
      return `${first}-${ids[ids.length - 1]}`;
    }
  }

  return ids.map(String).join(", ");
}

function formatBlockRange(block, timeZone) {
  const start = firstPresent(block.startedAt, block.clockBound ? block.plannedStartAt : null);
  const end = firstPresent(block.timing && block.timing.plannedEndAt, block.plannedEndAt);

  if (start && end) {
    return `${formatTime(start, timeZone)}-${formatTime(end, timeZone)}`;
  }
  if (start) {
    return formatTime(start, timeZone);
  }

  return "--:--";
}

function formatBlockStart(block, timeZone) {
  const start = block.clockBound
    ? firstPresent(block.plannedStartAt, block.startedAt, block.completedAt, block.skippedAt)
    : firstPresent(block.startedAt, block.completedAt, block.skippedAt);
  return start ? formatTime(start, timeZone) : "--:--";
}

function formatDayLabel(date, timeZone) {
  const parts = formatParts(date, {
    weekday: "short",
    month: "short",
    day: "numeric",
    timeZone,
  });

  return `${parts.weekday} ${parts.month} ${parts.day}`;
}

function formatTime(value, timeZone) {
  const parts = formatParts(normalizeDate(value), {
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    timeZone,
  });

  return `${parts.hour}:${parts.minute}`;
}

function formatDurationText(ms, suffix) {
  const minutes = Math.ceil(normalizeNonNegativeMs(ms) / 60000);
  if (minutes <= 0) {
    return `0m ${suffix}`;
  }

  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  const value =
    hours > 0 && remainder > 0
      ? `${hours}h ${remainder}m`
      : hours > 0
        ? `${hours}h`
        : `${minutes}m`;

  return `${value} ${suffix}`;
}

function normalizeNonNegativeMs(value) {
  return Number.isFinite(value) ? Math.max(0, value) : 0;
}

function formatParts(date, options) {
  return Object.fromEntries(
    new Intl.DateTimeFormat("en-US", options)
      .formatToParts(date)
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, part.value]),
  );
}

function normalizeDate(value) {
  const date =
    value === undefined || value === null
      ? new Date()
      : value instanceof Date
        ? value
        : new Date(value);

  if (Number.isNaN(date.getTime())) {
    throw new Error(`Invalid date value: ${String(value)}`);
  }

  return date;
}

function looksLikeConfigObject(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }

  return [
    "engineState",
    "timeblocks",
    "state",
    "workstationModel",
    "workstations",
    "runtime",
    "tasks",
    "summary",
    "gm",
    "now",
    "timeZone",
  ].some((key) => Object.prototype.hasOwnProperty.call(value, key));
}

function findFirstString(values) {
  for (const value of values) {
    if (value === undefined || value === null) {
      continue;
    }
    const text = String(value).trim();
    if (text) {
      return text;
    }
  }

  return null;
}

function asArray(value) {
  if (value === undefined || value === null) {
    return [];
  }

  return Array.isArray(value) ? value : [value];
}

function firstDefined(...values) {
  for (const value of values) {
    if (value !== undefined) {
      return value;
    }
  }

  return undefined;
}

function firstPresent(...values) {
  for (const value of values) {
    if (value !== undefined && value !== null) {
      return value;
    }
  }

  return undefined;
}

module.exports = {
  createViewState,
  exportViewState: createViewState,
};
