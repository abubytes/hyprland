# Local Store + CLI Checklist

## Task Checklist

- [x] Add dependency-free CommonJS local store.
- [x] Persist canonical JSON state under `LUALAND_STATE_DIR`.
- [x] Append newly-created engine events to `events.jsonl`.
- [x] Add sample plan for `init-sample`.
- [x] Add CLI commands: `status`, `start`, `done`, `skip`, `reset`, `advance`, `export-view`, `init-sample`.
- [x] Add sample workstation config for `export-view`.
- [x] Cover store persistence and CLI behavior with `node:test`.

## Decisions Made

- The state directory is `LUALAND_STATE_DIR` when set, otherwise `~/.local/state/lualand/timeblocks`.
- `state.json` is the canonical snapshot and includes the engine's normalized `events` array.
- `events.jsonl` is append-only during mutations; the store appends events whose sequence is newer than the previous snapshot.
- `skip` operates on the active block and passes the reason plus accountability phrase directly to the engine.
- `advance` requires `--now` so test and automation runs are deterministic.
- `export-view` reads the persisted engine state and writes the JSON shape that
  Quickshell already consumes through `LUALAND_QS_STATE`.

## Challenges Met

- The engine already owns event IDs and sequences, so the store avoids inventing a second event format.
- Failed CLI mutations do not call `saveState`, which keeps rejected skips from changing state or appending events.
- Saving an unchanged state does not duplicate events in the JSONL log.
- The Quickshell bridge stays outside QML: QML reads a JSON file, while the CLI
  performs the engine-to-view conversion.

## Commands Run

- `node --test lualand/tests/*.test.js`
  - Result after export-view patch: pass, 20 tests passing, 0 failing.
- `./lualand/bin/lualand-timeblocks.js --help`
  - Result: pass, usage printed and executable bit verified.

## Current Failures

- None.

## Next Fix If Unfinished

- None for this slice.
