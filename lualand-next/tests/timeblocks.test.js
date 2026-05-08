"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const {
  COMPLETION_MODE,
  EVENT_TYPE,
  REQUIRED_SKIP_ACCOUNTABILITY_PHRASE,
  STATUS,
  advanceTime,
  completeCurrentBlock,
  createTimeblockState,
  getCurrentBlock,
  getNextBlock,
  getTimerControl,
  resetCurrentBlock,
  resolveTimeblocks,
  skipCurrentBlock,
  startBlock,
  startDay,
  startNextBlock,
} = require("../core/timeblocks.js");

const minute = 60 * 1000;

function at(clock) {
  return `2026-05-07T${clock}:00.000Z`;
}

function block(state, id) {
  return state.blocks.find((candidate) => candidate.id === id);
}

function eventTypes(state) {
  return state.events.map((event) => event.type);
}

function sampleMorningPlan() {
  return createTimeblockState({
    blocks: [
      {
        id: "morning",
        title: "Morning routine",
        durationMinutes: 20,
        autoComplete: false,
        plannedStartAt: at("07:00"),
        appActions: [{ type: "focus-app", app: "Notion" }],
      },
      {
        id: "quran",
        title: "Quran reading",
        durationMinutes: 25,
        autoComplete: false,
        appActions: [{ type: "focus-app", app: "Zathura", document: "quran.pdf" }],
      },
      {
        id: "study",
        title: "Study focus",
        durationMinutes: 50,
        autoComplete: true,
        policy: { lock: { workstation: "Studying" } },
      },
      {
        id: "rest",
        title: "Rest",
        durationMinutes: 10,
        autoComplete: true,
        policy: { awayFromDesk: true },
      },
    ],
    relations: [
      {
        id: "morning-to-quran",
        type: "autoStartNext",
        trigger: "done",
        from: "morning",
        to: "quran",
      },
      {
        id: "quran-to-study",
        type: "autoStartNext",
        trigger: "done",
        from: "quran",
        to: "study",
      },
      {
        id: "study-to-rest",
        type: "autoStartNext",
        trigger: "auto-complete",
        from: "study",
        to: "rest",
      },
    ],
  });
}

test("morning routine stays active while bleeding, then manual Done starts Quran by explicit relation", () => {
  const initial = sampleMorningPlan();
  assert.equal(resolveTimeblocks(initial, { now: at("06:55") }).next.id, "morning");

  let state = startBlock(initial, "morning", { now: at("07:00") });

  assert.equal(block(initial, "morning").status, STATUS.PLANNED);
  assert.equal(getCurrentBlock(state, { now: at("07:10") }).id, "morning");
  assert.equal(getNextBlock(state, { now: at("07:10") }).id, "quran");
  assert.equal(block(state, "morning").plannedEndAt, at("07:20"));

  state = advanceTime(state, { now: at("07:27") });

  const bleedingMorning = getCurrentBlock(state, { now: at("07:27") });
  assert.equal(bleedingMorning.id, "morning");
  assert.equal(bleedingMorning.status, STATUS.ACTIVE);
  assert.equal(bleedingMorning.timing.overrunMs, 7 * minute);
  assert.equal(bleedingMorning.timing.isBleeding, true);

  state = completeCurrentBlock(state, { now: at("07:27"), note: "Finished the routine." });

  assert.equal(block(state, "morning").status, STATUS.DONE);
  assert.equal(block(state, "morning").completionMode, COMPLETION_MODE.MANUAL);
  assert.equal(block(state, "morning").overrunMs, 7 * minute);
  assert.equal(block(state, "quran").status, STATUS.ACTIVE);
  assert.equal(block(state, "quran").startedAt, at("07:27"));
  assert.equal(getCurrentBlock(state, { now: at("07:27") }).id, "quran");
  assert.equal(getNextBlock(state, { now: at("07:27") }).id, "study");
  assert.deepEqual(eventTypes(state), [
    EVENT_TYPE.STARTED,
    EVENT_TYPE.COMPLETED,
    EVENT_TYPE.AUTO_START_NEXT,
    EVENT_TYPE.STARTED,
  ]);
  assert.deepEqual(
    state.events.map((event) => ({
      id: event.id,
      sequence: event.sequence,
      hasPayload: event.payload && typeof event.payload === "object",
    })),
    [
      { id: "evt_0001", sequence: 1, hasPayload: true },
      { id: "evt_0002", sequence: 2, hasPayload: true },
      { id: "evt_0003", sequence: 3, hasPayload: true },
      { id: "evt_0004", sequence: 4, hasPayload: true },
    ],
  );
});

test("Quran manual Done starts study, then study auto-completes into rest and rest ends without a next relation", () => {
  let state = sampleMorningPlan();
  state = startBlock(state, "morning", { now: at("07:00") });
  state = completeCurrentBlock(state, { now: at("07:27") });

  assert.deepEqual(block(state, "quran").appActions, [
    { type: "focus-app", app: "Zathura", document: "quran.pdf" },
  ]);

  state = completeCurrentBlock(state, { now: at("07:55") });

  assert.equal(block(state, "quran").status, STATUS.DONE);
  assert.equal(block(state, "quran").overrunMs, 3 * minute);
  assert.equal(block(state, "study").status, STATUS.ACTIVE);
  assert.equal(block(state, "study").startedAt, at("07:55"));
  assert.deepEqual(getCurrentBlock(state, { now: at("08:00") }).policy, {
    lock: { workstation: "Studying" },
  });
  assert.equal(getNextBlock(state, { now: at("08:00") }).id, "rest");

  state = advanceTime(state, { now: at("08:45") });

  assert.equal(block(state, "study").status, STATUS.DONE);
  assert.equal(block(state, "study").completionMode, COMPLETION_MODE.AUTO);
  assert.equal(block(state, "study").completedAt, at("08:45"));
  assert.equal(block(state, "study").overrunMs, 0);
  assert.equal(block(state, "rest").status, STATUS.ACTIVE);
  assert.equal(block(state, "rest").startedAt, at("08:45"));

  state = advanceTime(state, { now: at("08:55") });

  assert.equal(block(state, "rest").status, STATUS.DONE);
  assert.equal(block(state, "rest").completionMode, COMPLETION_MODE.AUTO);
  assert.equal(state.activeBlockId, null);
  assert.equal(getCurrentBlock(state, { now: at("08:55") }), null);
  assert.equal(getNextBlock(state, { now: at("08:55") }), null);
});

test("skip requires reason and accountability phrase, records both, and never auto-starts next", () => {
  let state = sampleMorningPlan();
  state = startBlock(state, "morning", { now: at("07:00") });

  assert.throws(
    () =>
      skipCurrentBlock(state, {
        now: at("07:05"),
        accountabilityPhrase: REQUIRED_SKIP_ACCOUNTABILITY_PHRASE,
      }),
    /Skip reason is required/,
  );
  assert.throws(
    () =>
      skipCurrentBlock(state, {
        now: at("07:05"),
        reason: "A real interruption came up.",
        accountabilityPhrase: "skip please",
      }),
    /required phrase/,
  );

  state = skipCurrentBlock(state, {
    now: at("07:05"),
    reason: "A real interruption came up.",
    accountabilityPhrase: REQUIRED_SKIP_ACCOUNTABILITY_PHRASE,
  });

  assert.equal(block(state, "morning").status, STATUS.SKIPPED);
  assert.equal(block(state, "morning").skipReason, "A real interruption came up.");
  assert.equal(block(state, "morning").accountabilityPhrase, REQUIRED_SKIP_ACCOUNTABILITY_PHRASE);
  assert.equal(block(state, "morning").elapsedMs, 5 * minute);
  assert.equal(block(state, "quran").status, STATUS.PLANNED);
  assert.equal(state.activeBlockId, null);
  assert.equal(getCurrentBlock(state, { now: at("07:05") }), null);
  assert.equal(getNextBlock(state, { now: at("07:05") }).id, "quran");
  assert.deepEqual(eventTypes(state), [EVENT_TYPE.STARTED, EVENT_TYPE.SKIPPED]);
  assert.equal(state.events.at(-1).payload.autoStartSuppressed, true);
});

test("reset clears active run state and returns the block to planned", () => {
  let state = createTimeblockState({
    blocks: [
      {
        id: "quran",
        title: "Quran reading",
        durationMinutes: 25,
        autoComplete: false,
      },
    ],
  });

  state = startBlock(state, "quran", { now: at("07:30") });
  assert.equal(getCurrentBlock(state, { now: at("08:00") }).timing.overrunMs, 5 * minute);

  state = resetCurrentBlock(state, {
    now: at("08:00"),
    reason: "Restart with a clean timer.",
  });

  assert.equal(block(state, "quran").status, STATUS.PLANNED);
  assert.equal(block(state, "quran").startedAt, null);
  assert.equal(block(state, "quran").plannedEndAt, null);
  assert.equal(block(state, "quran").elapsedMs, 0);
  assert.equal(block(state, "quran").overrunMs, 0);
  assert.equal(state.activeBlockId, null);
  assert.equal(getNextBlock(state, { now: at("08:00") }).id, "quran");
  assert.deepEqual(eventTypes(state), [EVENT_TYPE.STARTED, EVENT_TYPE.RESET]);
});

test("plannedStartAt is metadata unless a block is explicitly clock-bound", () => {
  const flexible = createTimeblockState({
    blocks: [
      {
        id: "focus",
        title: "Flexible focus",
        durationMinutes: 50,
        plannedStartAt: at("07:00"),
      },
    ],
  });

  assert.equal(getCurrentBlock(flexible, { now: at("07:10") }), null);
  assert.equal(getNextBlock(flexible, { now: at("07:10") }).id, "focus");
  assert.equal(getTimerControl(flexible, { now: at("07:10") }).primaryAction, "start-day");

  const clockBound = createTimeblockState({
    blocks: [
      {
        id: "appointment",
        title: "Clock appointment",
        durationMinutes: 30,
        plannedStartAt: at("07:00"),
        clockBound: true,
      },
    ],
    dayStart: {
      clockBound: true,
    },
  });

  assert.equal(getCurrentBlock(clockBound, { now: at("07:10") }).id, "appointment");
});

test("read-only current, next, and control calls accept an omitted observation time", () => {
  const state = createTimeblockState({
    blocks: [
      {
        id: "focus",
        title: "Flexible focus",
        durationMinutes: 30,
      },
    ],
  });

  assert.equal(getCurrentBlock(state), null);
  assert.equal(getNextBlock(state).id, "focus");
  assert.equal(getTimerControl(state).primaryAction, "start-day");
});

test("day start is the anchor for flexible blocks and can autostart the first block", () => {
  let state = createTimeblockState({
    dayStart: {
      autoStart: true,
      blockId: "wake",
    },
    blocks: [
      {
        id: "wake",
        title: "Wake and stand up",
        durationMinutes: 20,
        autoComplete: true,
      },
      {
        id: "work-1",
        title: "Work block 1",
        durationMinutes: 50,
        autoComplete: true,
      },
    ],
    relations: [
      {
        id: "wake-to-work",
        type: "next",
        autoStart: true,
        trigger: "auto-complete",
        from: "wake",
        to: "work-1",
      },
    ],
  });

  state = startDay(state, { now: at("03:17"), runId: "day-test" });

  assert.equal(state.dayRun.status, "running");
  assert.equal(state.dayRun.startedAt, at("03:17"));
  assert.equal(block(state, "wake").status, STATUS.ACTIVE);
  assert.equal(block(state, "wake").plannedEndAt, at("03:37"));
  assert.deepEqual(eventTypes(state), [EVENT_TYPE.DAY_STARTED, EVENT_TYPE.STARTED]);

  state = advanceTime(state, { now: at("03:37") });

  assert.equal(block(state, "wake").status, STATUS.DONE);
  assert.equal(block(state, "work-1").status, STATUS.ACTIVE);
  assert.equal(block(state, "work-1").startedAt, at("03:37"));
});

test("manual next relation leaves a play-ready block instead of autostarting", () => {
  let state = createTimeblockState({
    dayStart: {
      autoStart: true,
      blockId: "morning",
    },
    blocks: [
      {
        id: "morning",
        title: "Morning setup",
        durationMinutes: 20,
      },
      {
        id: "focus",
        title: "Focus block",
        durationMinutes: 50,
      },
    ],
    relations: [
      {
        id: "morning-to-focus",
        type: "next",
        autoStart: false,
        trigger: "done",
        from: "morning",
        to: "focus",
      },
    ],
  });

  state = startDay(state, { now: at("06:00") });
  state = completeCurrentBlock(state, { now: at("06:18") });

  assert.equal(state.activeBlockId, null);
  assert.equal(getNextBlock(state, { now: at("06:18") }).id, "focus");
  assert.deepEqual(
    pickControl(getTimerControl(state, { now: at("06:18") })),
    {
      state: "ready",
      primaryAction: "play",
      primaryLabel: "Play",
      blockId: "focus",
      title: "Focus block",
    },
  );

  state = startNextBlock(state, { now: at("06:20") });
  assert.equal(block(state, "focus").status, STATUS.ACTIVE);
  assert.equal(block(state, "focus").startedAt, at("06:20"));
});

test("skip buttons can be lightweight for rest-style blocks", () => {
  let state = createTimeblockState({
    blocks: [
      {
        id: "rest",
        title: "Walk around",
        kind: "rest",
        durationMinutes: 10,
        skipPolicy: {
          requiresReason: false,
          requiresAccountabilityPhrase: false,
        },
      },
    ],
  });

  state = startBlock(state, "rest", { now: at("08:00") });
  assert.equal(getTimerControl(state, { now: at("08:01") }).primaryAction, "skip");

  state = skipCurrentBlock(state, { now: at("08:02") });

  assert.equal(block(state, "rest").status, STATUS.SKIPPED);
  assert.equal(block(state, "rest").skipReason, null);
  assert.equal(block(state, "rest").accountabilityPhrase, null);
});

function pickControl(control) {
  return {
    state: control.state,
    primaryAction: control.primaryAction,
    primaryLabel: control.primaryLabel,
    blockId: control.blockId,
    title: control.title,
  };
}
