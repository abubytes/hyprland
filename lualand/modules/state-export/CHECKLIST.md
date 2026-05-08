# Lualand State Export Checklist

## Tasks

- [x] Add a pure CommonJS state exporter in `lualand/core/view-state.js`.
- [x] Convert timeblock engine state into `dayLabel`, `summary`, `activeBlock`, and `timeline`.
- [x] Convert the workstation model into the Quickshell rail fields.
- [x] Mark the active workstation from runtime workspace data, falling back to the active block.
- [x] Normalize optional tasks into the task-list shape.
- [x] Sort tasks by status: `in-progress`, `undone`, `done`.
- [x] Export compact active-block timer fields: `remainingMs`, `overrunMs`,
  `remainingText`, `overrunText`, `isOverrun`, and `isBleeding`.
- [x] Let embedded block tasks feed the sample/emulated export when no explicit
  task list is supplied.
- [x] Expand the sample plan into the requested morning routine, Quran, repeated
  study focus/rest cycle, then free/work task blocks.
- [x] Preserve the current tri-color UI contract without QML edits.
- [x] Add Node built-in `node:test` coverage in `lualand/tests/view-state.test.js`.

## Decisions

- The exporter is pure data conversion. It does not read or write files, start timers, call Hyprland, or touch Quickshell.
- The emitted JSON keeps the existing `shell.qml` contract: `dayLabel`, `summary`, `activeBlock`, `workstations`, `timeline`, and `tasks`.
- Timeline display statuses stay UI-oriented: current blocks become `active`, terminal blocks become `done`, and open future blocks become `queued`.
- Extra timeline flags `isCurrent` and `isNext` are included for tests and future adapters; QML can ignore them.
- Tasks keep `title` and `done` for the current QML, plus normalized `status` for deterministic ordering.
- The compact UI can read raw timer numbers or preformatted text directly from
  `activeBlock`; non-overrun blocks emit an empty `overrunText`.
- The default sample task list lives on the `work-tasks` block so it survives
  timeblock state normalization and can still be overridden by an explicit task
  list.
- Workstation `workspace` labels use the HDMI workspace range because that is what the rail sample already displays.

## Commands And Results

- `node --test lualand/tests/view-state.test.js`
  - Result: passed after compact timer/sample update.
  - Tests: `5` passed, `0` failed.
- `node --test lualand/tests/timeblocks.test.js lualand/tests/workstations-policy.test.js lualand/tests/view-state.test.js`
  - Result: passed after compact timer/sample update.
  - Tests: `16` passed, `0` failed.

## Current Failures

- None from the pure test pass.

## Next Fix

- Wire the compact QML to display `remainingText` and `overrunText` when QML
  edits are in scope.
