"use strict";

const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const store = require("../core/store.js");
const {
  EVENT_TYPE,
  REQUIRED_SKIP_ACCOUNTABILITY_PHRASE,
  STATUS,
  startBlock,
} = require("../core/timeblocks.js");

const lualandRoot = path.resolve(__dirname, "..");
const cliPath = path.join(lualandRoot, "bin", "lualand-timeblocks.js");

function at(clock) {
  return `2026-05-07T${clock}:00.000Z`;
}

function makeStateDir(t) {
  const stateDir = fs.mkdtempSync(path.join(os.tmpdir(), "lualand-timeblocks-"));
  t.after(() => fs.rmSync(stateDir, { recursive: true, force: true }));
  return stateDir;
}

function runCli(stateDir, args, options = {}) {
  const result = spawnSync(process.execPath, [cliPath, ...args], {
    cwd: lualandRoot,
    env: {
      ...process.env,
      LUALAND_STATE_DIR: stateDir,
    },
    encoding: "utf8",
  });

  if (options.expectFailure) {
    assert.notEqual(result.status, 0, result.stdout + result.stderr);
  } else {
    assert.equal(result.status, 0, result.stdout + result.stderr);
  }
  return result;
}

function readState(stateDir) {
  return JSON.parse(fs.readFileSync(path.join(stateDir, "state.json"), "utf8"));
}

function readJsonl(file) {
  if (!fs.existsSync(file)) {
    return [];
  }
  return fs
    .readFileSync(file, "utf8")
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

function readEventLog(stateDir) {
  return readJsonl(path.join(stateDir, "events.jsonl"));
}

function block(state, id) {
  return state.blocks.find((candidate) => candidate.id === id);
}

test("store writes state snapshots and appends only new events to JSONL", (t) => {
  const stateDir = makeStateDir(t);
  const initial = store.initState(
    {
      blocks: [
        {
          id: "alpha",
          title: "Alpha",
          durationMinutes: 10,
        },
      ],
    },
    { stateDir },
  );

  assert.equal(initial.state.activeBlockId, null);
  assert.deepEqual(store.readEvents({ stateDir }), []);

  const firstSave = store.saveState(
    startBlock(initial.state, "alpha", { now: at("09:00") }),
    {
      stateDir,
      previousState: initial.state,
    },
  );
  assert.equal(firstSave.appendedEvents.length, 1);
  assert.equal(readEventLog(stateDir).length, 1);

  const secondSave = store.saveState(firstSave.state, {
    stateDir,
    previousState: firstSave.state,
  });
  assert.equal(secondSave.appendedEvents.length, 0);
  assert.equal(readEventLog(stateDir).length, 1);
  assert.equal(readState(stateDir).activeBlockId, "alpha");
});

test("CLI init-sample, start, and done persist state and event log", (t) => {
  const stateDir = makeStateDir(t);

  let result = runCli(stateDir, ["init-sample"]);
  assert.match(result.stdout, /Initialized 9 timeblocks/);
  assert.deepEqual(readEventLog(stateDir), []);

  result = runCli(stateDir, ["start", "morning", "--now", at("07:00")]);
  assert.match(result.stdout, /Started morning/);

  let state = readState(stateDir);
  let events = readEventLog(stateDir);
  assert.equal(state.activeBlockId, "morning");
  assert.equal(block(state, "morning").status, STATUS.ACTIVE);
  assert.deepEqual(events.map((event) => event.type), [EVENT_TYPE.STARTED]);

  result = runCli(stateDir, ["done", "--now", at("07:25")]);
  assert.match(result.stdout, /Done morning/);

  state = readState(stateDir);
  events = readEventLog(stateDir);
  assert.equal(block(state, "morning").status, STATUS.DONE);
  assert.equal(state.activeBlockId, "quran");
  assert.equal(block(state, "quran").status, STATUS.ACTIVE);
  assert.deepEqual(events.map((event) => event.type), [
    EVENT_TYPE.STARTED,
    EVENT_TYPE.COMPLETED,
    EVENT_TYPE.AUTO_START_NEXT,
    EVENT_TYPE.STARTED,
  ]);
  assert.deepEqual(state.events.map((event) => event.id), events.map((event) => event.id));
});

test("CLI skip requires reason and phrase, persists skip without auto-starting next", (t) => {
  const stateDir = makeStateDir(t);

  runCli(stateDir, ["init-sample"]);
  runCli(stateDir, ["start", "morning", "--now", at("07:00")]);

  const rejected = runCli(
    stateDir,
    [
      "skip",
      "--reason",
      "A real interruption came up.",
      "--phrase",
      "skip please",
      "--now",
      at("07:05"),
    ],
    { expectFailure: true },
  );
  assert.match(rejected.stderr, /required phrase/);
  assert.equal(readState(stateDir).activeBlockId, "morning");
  assert.deepEqual(readEventLog(stateDir).map((event) => event.type), [EVENT_TYPE.STARTED]);

  const accepted = runCli(stateDir, [
    "skip",
    "--reason",
    "A real interruption came up.",
    "--phrase",
    REQUIRED_SKIP_ACCOUNTABILITY_PHRASE,
    "--now",
    at("07:05"),
  ]);
  assert.match(accepted.stdout, /Skipped morning/);

  const state = readState(stateDir);
  const events = readEventLog(stateDir);
  assert.equal(state.activeBlockId, null);
  assert.equal(block(state, "morning").status, STATUS.SKIPPED);
  assert.equal(block(state, "morning").skipReason, "A real interruption came up.");
  assert.equal(block(state, "morning").accountabilityPhrase, REQUIRED_SKIP_ACCOUNTABILITY_PHRASE);
  assert.equal(block(state, "quran").status, STATUS.PLANNED);
  assert.deepEqual(events.map((event) => event.type), [EVENT_TYPE.STARTED, EVENT_TYPE.SKIPPED]);
  assert.equal(events.at(-1).payload.autoStartSuppressed, true);
});

test("CLI advance auto-completes active auto blocks and reset returns blocks to planned", (t) => {
  const stateDir = makeStateDir(t);

  runCli(stateDir, ["init-sample"]);
  runCli(stateDir, ["start", "study", "--now", at("08:00")]);
  const advanced = runCli(stateDir, ["advance", "--now", at("08:50")]);
  assert.match(advanced.stdout, /Advanced to/);

  let state = readState(stateDir);
  let events = readEventLog(stateDir);
  assert.equal(block(state, "study").status, STATUS.DONE);
  assert.equal(block(state, "rest").status, STATUS.ACTIVE);
  assert.equal(state.activeBlockId, "rest");
  assert.deepEqual(events.map((event) => event.type), [
    EVENT_TYPE.STARTED,
    EVENT_TYPE.COMPLETED,
    EVENT_TYPE.AUTO_START_NEXT,
    EVENT_TYPE.STARTED,
  ]);

  const reset = runCli(stateDir, ["reset", "rest", "--now", at("08:51")]);
  assert.match(reset.stdout, /Reset rest/);
  state = readState(stateDir);
  events = readEventLog(stateDir);
  assert.equal(block(state, "rest").status, STATUS.PLANNED);
  assert.equal(state.activeBlockId, null);
  assert.equal(events.at(-1).type, EVENT_TYPE.RESET);
});

test("CLI export-view emits Quickshell state JSON from persisted engine state", (t) => {
  const stateDir = makeStateDir(t);
  const outFile = path.join(stateDir, "view.json");

  runCli(stateDir, ["init-sample"]);
  runCli(stateDir, ["start", "morning", "--now", at("07:00")]);

  const stdoutExport = runCli(stateDir, ["export-view", "--now", at("07:10"), "--time-zone", "UTC"]);
  const stdoutView = JSON.parse(stdoutExport.stdout);
  assert.equal(stdoutView.activeBlock.id, "morning");
  assert.equal(stdoutView.activeBlock.status, "active");
  assert.deepEqual(
    stdoutView.timeline.map((entry) => [entry.id, entry.status, entry.isCurrent]),
    [
      ["morning", "active", true],
      ["quran", "queued", false],
      ["study", "queued", false],
      ["rest", "queued", false],
      ["study-focus-2", "queued", false],
      ["study-rest-2", "queued", false],
      ["study-focus-3", "queued", false],
      ["free-tasks", "queued", false],
      ["work-tasks", "queued", false],
    ],
  );
  assert.equal(stdoutView.workstations.some((workstation) => workstation.id === "study"), true);

  const fileExport = runCli(stateDir, [
    "export-view",
    "--now",
    at("07:10"),
    "--time-zone",
    "UTC",
    "--out",
    outFile,
  ]);
  assert.match(fileExport.stdout, /Exported Quickshell state/);
  const fileView = JSON.parse(fs.readFileSync(outFile, "utf8"));
  assert.equal(fileView.activeBlock.id, "morning");
});
