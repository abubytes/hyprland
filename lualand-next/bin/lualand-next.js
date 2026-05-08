#!/usr/bin/env node
"use strict";

const fs = require("node:fs");
const path = require("node:path");

const store = require("../core/store.js");
const { createViewState } = require("../core/view-state.js");
const {
  advanceTime,
  completeCurrentBlock,
  getCurrentBlock,
  getNextBlock,
  resetBlock,
  resetCurrentBlock,
  skipCurrentBlock,
  startBlock,
  startDay,
  startNextBlock,
} = require("../core/timeblocks.js");

const SAMPLE_PLAN_FILE = path.join(__dirname, "..", "state", "sample-plan.json");
const SAMPLE_WORKSTATIONS_FILE = path.join(__dirname, "..", "state", "sample-workstations.json");

function main(argv = process.argv.slice(2), io = process) {
  const args = [...argv];
  const command = args.shift();

  try {
    switch (command) {
      case "status":
        return commandStatus(parseFlags(args), io);
      case "start":
        return commandStart(args, io);
      case "start-day":
        return commandStartDay(parseFlags(args), io);
      case "play":
      case "start-next":
        return commandPlay(args, io);
      case "done":
        return commandDone(parseFlags(args), io);
      case "skip":
        return commandSkip(parseFlags(args), io);
      case "reset":
        return commandReset(args, io);
      case "advance":
        return commandAdvance(parseFlags(args), io);
      case "export-view":
        return commandExportView(parseFlags(args), io);
      case "init-sample":
        return commandInitSample(parseFlags(args), io);
      case "help":
      case "--help":
      case "-h":
        printHelp(io.stdout);
        return 0;
      default:
        throw cliError(
          "UNKNOWN_COMMAND",
          command
            ? `Unknown command: ${command}`
            : "Command is required. Run with --help for usage.",
        );
    }
  } catch (error) {
    io.stderr.write(`error: ${error.message}\n`);
    return 1;
  }
}

function commandInitSample(options, io) {
  rejectPositionals(options);
  const plan = JSON.parse(fs.readFileSync(SAMPLE_PLAN_FILE, "utf8"));
  const result = store.initState(plan, storeOptions(io.env));
  io.stdout.write(`Initialized ${result.state.blocks.length} timeblocks at ${result.paths.stateDir}\n`);
  return 0;
}

function commandStatus(options, io) {
  rejectPositionals(options);
  const state = store.loadState(storeOptions(io.env));
  const now = options.now || null;
  const current = getCurrentBlock(state, { now });
  const next = getNextBlock(state, { now });
  const eventLog = store.readEvents(storeOptions(io.env));

  io.stdout.write(`State: ${store.getStorePaths(storeOptions(io.env)).stateDir}\n`);
  io.stdout.write(`Active: ${state.activeBlockId || "none"}\n`);
  io.stdout.write(`Current: ${current ? formatBlock(current, now) : "none"}\n`);
  io.stdout.write(`Next: ${next ? formatBlock(next, now) : "none"}\n`);
  io.stdout.write(`Events: state=${state.events.length} log=${eventLog.length}\n`);
  io.stdout.write("Blocks:\n");
  for (const block of state.blocks) {
    io.stdout.write(`- ${block.id} [${block.status}] ${block.title}\n`);
  }

  return 0;
}

function commandStart(args, io) {
  const id = args.shift();
  if (!id) {
    throw cliError("MISSING_ID", "start requires a timeblock id.");
  }
  const options = parseFlags(args);
  rejectPositionals(options);
  const result = store.updateState(
    (state) => startBlock(state, id, { now: options.now }),
    storeOptions(io.env),
  );
  io.stdout.write(`Started ${id}; appended ${result.appendedEvents.length} event(s).\n`);
  return 0;
}

function commandStartDay(options, io) {
  rejectPositionals(options);
  const result = store.updateState(
    (state) => startDay(state, { now: options.now, blockId: options.blockId, runId: options.runId, note: options.note }),
    storeOptions(io.env),
  );
  io.stdout.write(`Started day; active=${result.state.activeBlockId || "none"}; appended ${result.appendedEvents.length} event(s).\n`);
  return 0;
}

function commandPlay(args, io) {
  const id = args[0] && !args[0].startsWith("--") ? args.shift() : null;
  const options = parseFlags(args);
  rejectPositionals(options);
  const result = store.updateState(
    (state) => startNextBlock(state, { now: options.now, blockId: id || options.blockId }),
    storeOptions(io.env),
  );
  io.stdout.write(`Played ${result.state.activeBlockId || id || "next"}; appended ${result.appendedEvents.length} event(s).\n`);
  return 0;
}

function commandDone(options, io) {
  rejectPositionals(options);
  const result = store.updateState(
    (state) => completeCurrentBlock(state, { now: options.now }),
    storeOptions(io.env),
  );
  const completed = result.appendedEvents.find((event) => event.type === "timeblock.completed");
  io.stdout.write(`Done ${completed ? completed.blockId : "current"}; appended ${result.appendedEvents.length} event(s).\n`);
  return 0;
}

function commandSkip(options, io) {
  rejectPositionals(options);
  const result = store.updateState(
    (state) =>
      skipCurrentBlock(state, {
        now: options.now,
        reason: options.reason,
        accountabilityPhrase: options.phrase || options.accountabilityPhrase,
      }),
    storeOptions(io.env),
  );
  const skipped = result.appendedEvents.find((event) => event.type === "timeblock.skipped");
  io.stdout.write(`Skipped ${skipped ? skipped.blockId : "current"}; appended ${result.appendedEvents.length} event(s).\n`);
  return 0;
}

function commandReset(args, io) {
  const id = args[0] && !args[0].startsWith("--") ? args.shift() : null;
  const options = parseFlags(args);
  rejectPositionals(options);
  const result = store.updateState(
    (state) =>
      id
        ? resetBlock(state, id, { now: options.now, reason: options.reason })
        : resetCurrentBlock(state, { now: options.now, reason: options.reason }),
    storeOptions(io.env),
  );
  const reset = result.appendedEvents.find((event) => event.type === "timeblock.reset");
  io.stdout.write(`Reset ${reset ? reset.blockId : id || "current"}; appended ${result.appendedEvents.length} event(s).\n`);
  return 0;
}

function commandAdvance(options, io) {
  rejectPositionals(options);
  if (!options.now) {
    throw cliError("MISSING_NOW", "advance requires --now <time>.");
  }
  const result = store.updateState(
    (state) => advanceTime(state, { now: options.now }),
    storeOptions(io.env),
  );
  io.stdout.write(`Advanced to ${options.now}; appended ${result.appendedEvents.length} event(s).\n`);
  return 0;
}

function commandExportView(options, io) {
  rejectPositionals(options);
  const state = store.loadState(storeOptions(io.env));
  const workstations = readJsonFile(options.workstations || SAMPLE_WORKSTATIONS_FILE);
  const taskInput = options.tasks ? readJsonFile(options.tasks) : [];
  const tasks = Array.isArray(taskInput) ? taskInput : taskInput.tasks || [];
  const runtime = options.runtime ? readJsonFile(options.runtime) : {};
  const view = createViewState({
    engineState: state,
    workstationModel: workstations,
    tasks,
    runtime,
    now: options.now,
    timeZone: options.timeZone || options.timezone,
  });
  const text = `${JSON.stringify(view, null, 2)}\n`;

  if (options.out) {
    fs.mkdirSync(path.dirname(path.resolve(options.out)), { recursive: true });
    fs.writeFileSync(options.out, text, "utf8");
    io.stdout.write(`Exported Quickshell state to ${path.resolve(options.out)}\n`);
  } else {
    io.stdout.write(text);
  }

  return 0;
}

function readJsonFile(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function parseFlags(args) {
  const options = { positionals: [] };
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (!arg.startsWith("--")) {
      options.positionals.push(arg);
      continue;
    }

    const [rawName, inlineValue] = arg.slice(2).split(/=(.*)/s, 2);
    const name = rawName.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
    const value =
      inlineValue !== undefined
        ? inlineValue
        : args[index + 1] && !args[index + 1].startsWith("--")
          ? args[++index]
          : null;

    if (
      ![
        "now",
        "reason",
        "note",
        "blockId",
        "runId",
        "phrase",
        "accountabilityPhrase",
        "out",
        "workstations",
        "tasks",
        "runtime",
        "timeZone",
        "timezone",
      ].includes(name)
    ) {
      throw cliError("UNKNOWN_FLAG", `Unknown option: --${rawName}`);
    }
    if (value === null) {
      throw cliError("MISSING_FLAG_VALUE", `--${rawName} requires a value.`);
    }
    options[name] = value;
  }
  return options;
}

function rejectPositionals(options) {
  if (options.positionals.length > 0) {
    throw cliError(
      "UNEXPECTED_ARGUMENT",
      `Unexpected argument: ${options.positionals[0]}`,
    );
  }
}

function formatBlock(block, now) {
  const timing = block.timing;
  const minutes =
    timing && Number.isFinite(timing.remainingMs)
      ? `, remaining=${Math.ceil(timing.remainingMs / 60000)}m`
      : "";
  const current = block.isCurrent ? ", current" : "";
  const next = block.isNext ? ", next" : "";
  const observed = now ? ` @ ${new Date(now).toISOString()}` : "";
  return `${block.id} [${block.status}${current}${next}] ${block.title}${minutes}${observed}`;
}

function storeOptions(env) {
  return { env: env || process.env };
}

function printHelp(stream) {
  stream.write(`Usage: lualand-next <command> [options]

Commands:
  init-sample                 Create sample state in LUALAND_NEXT_STATE_DIR.
  status [--now <time>]       Show active, current, next, blocks, and event counts.
  start-day [--now <time>]    Start the flexible day run and optional first block.
  start <id> [--now <time>]   Start a planned block.
  play [id] [--now <time>]    Start the next queued block, or the given id.
  done [--now <time>]         Complete the active block.
  skip --reason <text> --phrase <text> [--now <time>]
                              Skip the active block with the required accountability phrase.
  reset [id] [--now <time>]   Reset a block, or the active block when id is omitted.
  advance --now <time>        Run auto-complete advancement.
  export-view [--out <file>] [--now <time>] [--workstations <file>]
                              Export the Quickshell JSON view state.

State directory:
  LUALAND_NEXT_STATE_DIR or ~/.local/state/lualand-next/timeblocks
`);
}

function cliError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

if (require.main === module) {
  process.exitCode = main();
}

module.exports = {
  main,
  parseFlags,
};
