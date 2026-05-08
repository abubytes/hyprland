# Module Checklist - ActivityWatch And Work Logs

## Goal

Keep real workstation/productivity measurement without putting tracking logic
inside QS.

## Checklist

- [ ] Inventory current watcher processes.
- [ ] Preserve Hyprland socket watcher concept.
- [ ] Preserve workstation mapping watcher concept.
- [ ] Preserve input activity watcher concept.
- [ ] Preserve aggregation concept.
- [ ] Map `+10000` mirrors to base workstation.
- [ ] Export day totals for UI.
- [ ] Keep screen recorder integration untouched unless requested.
- [ ] Avoid killing existing watcher processes.
- [ ] Define navio-compatible Work Log sync path.
- [ ] Unit test workspace-to-workstation mapping.
- [ ] Runtime smoke with ActivityWatch bucket reads if available.

## Challenges Met

- [x] Identified old `workstation-watcher` as the stack to preserve.
- [x] Identified older direct-Notion sync as not matching the requested navio
  model.

## Open Decisions

- Whether to replace old Work Log sync immediately or wrap it later.
- How much ActivityWatch summary appears in the first QS panel.

