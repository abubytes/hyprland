# Lualand Timeblocks Core Checklist

## Implemented Tasks

- [x] Created a pure CommonJS timeblock engine in `lualand/core/timeblocks.js`.
- [x] Added immutable state transitions for starting, manual Done, auto-complete, skip, and reset.
- [x] Added live timing views with elapsed, remaining, bleeding, and overrun values.
- [x] Added explicit `autoStartNext` relations.
- [x] Ensured skipped blocks do not auto-start their next relation.
- [x] Added current/next resolution helpers.
- [x] Added structured event objects with stable sequence ids and payloads.
- [x] Added `node:test` coverage in `lualand/tests/timeblocks.test.js`.

## Decisions

- Used CommonJS so the core can run without a `package.json` module-type decision.
- Kept the engine pure and local: no filesystem, network, timers, shell calls, QML, Hyprland, or Quickshell side effects.
- All state-changing APIs return a new state object and leave the input state untouched.
- Auto-start only happens through explicit relations with `type: "autoStartNext"`.
- Manual and auto completion both produce `timeblock.completed`; auto-start adds `timeblock.auto_start_next` followed by the next block's `timeblock.started`.
- Auto-complete uses the planned end time as the completion time, even if `advanceTime` observes it later.
- Skip requires both a non-empty reason and the exported exact accountability phrase:
  `I am skipping this timeblock because I am in need to skip, and I accept that this choice is recorded.`
- Reset clears active run fields and returns the block to `planned` while preserving the event log.

## Challenges Met

- Manual blocks do not finish when their timer runs out; they stay active and report bleeding/overrun until Done, skip, or reset.
- Study/rest chains can be advanced deterministically without real timers.
- A skipped block records accountability data and suppresses auto-start while still allowing the next block to resolve as upcoming.
- App actions and policy metadata pass through the pure core without being executed.
- No Quickshell or QML files were touched.

## Test Commands And Results

- `node --test lualand/tests/timeblocks.test.js`
  - Result: passed.
  - Tests: 4 passed, 0 failed.
  - Coverage scenarios:
    - Morning routine bleeds for 7 minutes, then manual Done starts Quran.
    - Quran manual Done starts study.
    - Study auto-completes into rest.
    - Rest auto-completes without auto-starting anything else.
    - Skip requires reason and accountability phrase and does not auto-start Quran.
    - Reset clears an active Quran block back to planned.
