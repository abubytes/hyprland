"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const { createTimeblockState, startBlock } = require("../core/timeblocks.js");
const { createWorkstationModel } = require("../core/workstations.js");
const { createViewState } = require("../core/view-state.js");
const samplePlan = require("../state/sample-plan.json");
const sampleWorkstations = require("../state/sample-workstations.json");

function at(clock) {
  return `2026-05-07T${clock}:00.000Z`;
}

function fixtureWorkstations() {
  return createWorkstationModel({
    workstations: [
      {
        id: "code",
        name: "Code",
        slot: 2,
        icon: "applications-development",
      },
      {
        id: "docs",
        name: "Docs",
        slot: 3,
        icon: "accessories-text-editor",
      },
    ],
  });
}

function fixtureEngineState() {
  const state = createTimeblockState({
    blocks: [
      {
        id: "prep",
        title: "Prepare context",
        status: "done",
        durationMinutes: 30,
        plannedStartAt: at("08:30"),
        completedAt: at("09:00"),
        workstationId: "docs",
        detail: "Read the existing model and UI contract.",
      },
      {
        id: "focus",
        title: "Focus implementation",
        durationMinutes: 60,
        plannedStartAt: at("09:00"),
        workstationId: "code",
        detail: "Export the state shape the shell already reads.",
      },
      {
        id: "review",
        title: "Review and test",
        durationMinutes: 30,
        plannedStartAt: at("10:00"),
        workstationId: "docs",
      },
    ],
  });

  return startBlock(state, "focus", { now: at("09:00") });
}

test("exports the current and next timeblocks into the Quickshell timeline shape", () => {
  const view = createViewState({
    engineState: fixtureEngineState(),
    workstationModel: fixtureWorkstations(),
    now: at("09:15"),
    timeZone: "UTC",
  });

  assert.equal(view.dayLabel, "Thu May 7");
  assert.deepEqual(Object.keys(view), [
    "dayLabel",
    "summary",
    "activeBlock",
    "workstations",
    "timeline",
    "tasks",
  ]);
  assert.deepEqual(view.activeBlock, {
    id: "focus",
    name: "Focus implementation",
    time: "09:00-10:00",
    workstation: "Code",
    status: "active",
    remainingMs: 45 * 60 * 1000,
    overrunMs: 0,
    remainingText: "45m left",
    overrunText: "",
    isOverrun: false,
    isBleeding: false,
  });
  assert.deepEqual(
    view.timeline.map((entry) => ({
      id: entry.id,
      time: entry.time,
      workstation: entry.workstation,
      status: entry.status,
      isCurrent: entry.isCurrent,
      isNext: entry.isNext,
    })),
    [
      {
        id: "prep",
        time: "08:30",
        workstation: "Docs",
        status: "done",
        isCurrent: false,
        isNext: false,
      },
      {
        id: "focus",
        time: "09:00",
        workstation: "Code",
        status: "active",
        isCurrent: true,
        isNext: false,
      },
      {
        id: "review",
        time: "10:00",
        workstation: "Docs",
        status: "queued",
        isCurrent: false,
        isNext: true,
      },
    ],
  );
});

test("exports active-block overrun text and raw timing values for QML", () => {
  const view = createViewState({
    engineState: fixtureEngineState(),
    workstationModel: fixtureWorkstations(),
    now: at("10:07"),
    timeZone: "UTC",
  });

  assert.equal(view.activeBlock.id, "focus");
  assert.equal(view.activeBlock.remainingMs, 0);
  assert.equal(view.activeBlock.overrunMs, 7 * 60 * 1000);
  assert.equal(view.activeBlock.remainingText, "0m left");
  assert.equal(view.activeBlock.overrunText, "7m over");
  assert.equal(view.activeBlock.isOverrun, true);
  assert.equal(view.activeBlock.isBleeding, true);
});

test("sorts optional tasks as in-progress, undone, then done for the existing task UI", () => {
  const view = createViewState({
    engineState: { blocks: [] },
    workstationModel: fixtureWorkstations(),
    timeZone: "UTC",
    tasks: [
      { id: "ship", title: "Ship checklist", status: "done" },
      { id: "notes", title: "Write notes", status: "undone" },
      { id: "adapter", title: "Wire adapter", status: "in_progress" },
      { id: "smoke", title: "Run smoke test", done: true },
      "Review docs",
    ],
  });

  assert.deepEqual(
    view.tasks.map((task) => [task.id, task.status, task.done]),
    [
      ["adapter", "in-progress", false],
      ["notes", "undone", false],
      ["task_5", "undone", false],
      ["ship", "done", true],
      ["smoke", "done", true],
    ],
  );
});

test("exports the compact sample day and embedded tasks in display order", () => {
  const view = createViewState({
    engineState: samplePlan,
    workstationModel: sampleWorkstations,
    now: "2026-05-07T08:10:00.000Z",
    timeZone: "UTC",
  });

  assert.equal(view.activeBlock.id, "study-focus-2");
  assert.equal(view.activeBlock.name, "Study focus 2");
  assert.equal(view.activeBlock.time, "08:05-08:55");
  assert.equal(view.activeBlock.workstation, "Study");
  assert.equal(view.activeBlock.remainingText, "45m left");
  assert.deepEqual(
    view.timeline.map((entry) => entry.id),
    [
      "morning",
      "quran",
      "study",
      "rest",
      "study-focus-2",
      "study-rest-2",
      "study-focus-3",
      "free-tasks",
      "work-tasks",
    ],
  );
  assert.deepEqual(
    view.tasks.map((task) => [task.id, task.status, task.done]),
    [
      ["task-export-compact", "in-progress", false],
      ["task-free-inbox", "undone", false],
      ["task-work-followup", "undone", false],
      ["task-morning", "done", true],
      ["task-quran", "done", true],
    ],
  );
});

test("marks the active workstation from the runtime workspace id", () => {
  const view = createViewState({
    engineState: fixtureEngineState(),
    workstationModel: fixtureWorkstations(),
    runtime: {
      activeWorkspaceId: 14,
    },
    now: at("09:15"),
    timeZone: "UTC",
  });

  assert.deepEqual(
    view.workstations.map((workstation) => ({
      id: workstation.id,
      label: workstation.label,
      workspace: workstation.workspace,
      active: workstation.active,
    })),
    [
      {
        id: "code",
        label: "Code",
        workspace: "11-20",
        active: true,
      },
      {
        id: "docs",
        label: "Docs",
        workspace: "21-30",
        active: false,
      },
    ],
  );
});
