# Module Checklist - Workstations

## Goal

Preserve the old workstation universe and make it available to Lua, sidecars,
QS, and ActivityWatch.

## Checklist

- [x] Load old `workstations.json`.
- [x] Preserve workstation `number`.
- [x] Preserve `mapping`.
- [x] Preserve `last_workspace`.
- [x] Preserve `last_workspace_external`.
- [x] Preserve all workstations, not only numpad 1..9.
- [x] Implement decade math.
- [x] Support relative workspaces 1..10.
- [x] Implement mirror offset `+10000`.
- [x] Map mirrors back to base workstation for tracking.
- [ ] Preserve Slacking special behavior.
- [ ] Preserve Productivity laptop behavior.
- [ ] Preserve external monitor toggle.
- [ ] Support hidden workstations.
- [ ] Support blocked workstations.
- [ ] Support day-assigned workstations.
- [x] Export workstation rail model.
- [x] Unit test old mappings.
- [x] Unit test workspace math.

## Challenges Met

- [x] Corrected misunderstanding that numpad keys define the universe.
- [x] Corrected mirror offset from `100` to `+10000`.
- [x] Captured current numpad map.
- [x] The new model detects `slacking` and `productivity` as special roles, but
  the actual old toggle behavior is not implemented yet.

## Open Decisions

- Whether the new source of truth remains the old JSON path or a copied Lualand
  state file.
- How hidden/blocked/day-assigned flags are stored.
