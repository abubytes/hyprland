"use strict";

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const { createTimeblockState } = require("./timeblocks.js");

const STATE_FILE = "state.json";
const EVENT_LOG_FILE = "events.jsonl";

function defaultStateDir(env = process.env) {
  return (
    env.LUALAND_STATE_DIR ||
    path.join(os.homedir(), ".local", "state", "lualand", "timeblocks")
  );
}

function getStorePaths(options = {}) {
  const env = options.env || process.env;
  const stateDir = path.resolve(options.stateDir || defaultStateDir(env));
  return {
    stateDir,
    stateFile: path.join(stateDir, STATE_FILE),
    eventLogFile: path.join(stateDir, EVENT_LOG_FILE),
  };
}

function initState(plan, options = {}) {
  const paths = getStorePaths(options);
  ensureStoreDir(paths);

  if (!options.force && fs.existsSync(paths.stateFile)) {
    throw storeError(
      "STATE_EXISTS",
      `Timeblock state already exists at ${paths.stateFile}`,
    );
  }

  const state = createTimeblockState(plan);
  writeJsonAtomic(paths.stateFile, state);

  if (state.events.length > 0 || !fs.existsSync(paths.eventLogFile)) {
    writeFileAtomic(paths.eventLogFile, serializeEvents(state.events));
  }

  return { state, paths };
}

function loadState(options = {}) {
  const paths = getStorePaths(options);
  if (!fs.existsSync(paths.stateFile)) {
    throw storeError(
      "STATE_NOT_FOUND",
      `No timeblock state found at ${paths.stateFile}; run init-sample first.`,
    );
  }

  const parsed = readJson(paths.stateFile);
  return createTimeblockState(parsed);
}

function saveState(nextState, options = {}) {
  const paths = getStorePaths(options);
  ensureStoreDir(paths);

  const previousState =
    options.previousState ||
    (fs.existsSync(paths.stateFile) ? loadState({ ...options, stateDir: paths.stateDir }) : null);
  const previousEventSeq =
    options.previousEventSeq ??
    (previousState ? previousState.eventSeq || 0 : 0);
  const state = createTimeblockState(nextState);
  const eventsToAppend = state.events.filter(
    (event) => Number.isFinite(event.sequence) && event.sequence > previousEventSeq,
  );

  if (eventsToAppend.length > 0) {
    appendEvents(paths.eventLogFile, eventsToAppend);
  } else if (!fs.existsSync(paths.eventLogFile)) {
    writeFileAtomic(paths.eventLogFile, "");
  }

  writeJsonAtomic(paths.stateFile, state);

  return { state, paths, appendedEvents: eventsToAppend };
}

function updateState(mutator, options = {}) {
  const previousState = loadState(options);
  const nextState = mutator(previousState);
  return saveState(nextState, { ...options, previousState });
}

function readEvents(options = {}) {
  const paths = getStorePaths(options);
  if (!fs.existsSync(paths.eventLogFile)) {
    return [];
  }

  const text = fs.readFileSync(paths.eventLogFile, "utf8");
  return text
    .split(/\r?\n/)
    .filter((line) => line.trim().length > 0)
    .map((line, index) => {
      try {
        return JSON.parse(line);
      } catch (error) {
        throw storeError(
          "INVALID_EVENT_LOG",
          `Invalid JSON event on ${paths.eventLogFile}:${index + 1}: ${error.message}`,
        );
      }
    });
}

function appendEvents(eventLogFile, events) {
  fs.mkdirSync(path.dirname(eventLogFile), { recursive: true });
  fs.appendFileSync(eventLogFile, serializeEvents(events), "utf8");
}

function serializeEvents(events) {
  return events.map((event) => `${JSON.stringify(event)}\n`).join("");
}

function ensureStoreDir(paths) {
  fs.mkdirSync(paths.stateDir, { recursive: true });
}

function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch (error) {
    throw storeError("INVALID_STATE_JSON", `Invalid JSON in ${file}: ${error.message}`);
  }
}

function writeJsonAtomic(file, value) {
  writeFileAtomic(file, `${JSON.stringify(value, null, 2)}\n`);
}

function writeFileAtomic(file, text) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmpFile = `${file}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(tmpFile, text, "utf8");
  fs.renameSync(tmpFile, file);
}

function storeError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

module.exports = {
  STATE_FILE,
  EVENT_LOG_FILE,
  defaultStateDir,
  getStorePaths,
  initState,
  loadState,
  saveState,
  updateState,
  readEvents,
};
