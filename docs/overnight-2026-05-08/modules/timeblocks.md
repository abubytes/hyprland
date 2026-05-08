# Module Checklist - Timeblocks

## Goal

Build a local-first timeblock engine that can model routines, study sessions,
forced breaks, work blocks, manual completion, skip accountability, and debt.

## Checklist

- [ ] Define local JSON schema.
- [ ] Define append-only event schema.
- [ ] Support weekly planned blocks.
- [ ] Support day timeline export.
- [ ] Support manual start.
- [ ] Support autostart relationships.
- [ ] Support autocomplete blocks.
- [ ] Support non-autocomplete blocks that bleed into debt.
- [ ] Support Done command.
- [ ] Support Skip command.
- [ ] Require skip reason.
- [ ] Require skip accountability phrase.
- [ ] Record actual start/end.
- [ ] Record debt/overrun.
- [ ] Support allowed workstations.
- [ ] Support excluded workstations.
- [ ] Support allowed workspace ranges.
- [ ] Support excluded workspace ranges.
- [ ] Support away-from-desk blocks.
- [ ] Support morning routine scenario.
- [ ] Support Quran/Zathura scenario.
- [ ] Support study scenario.
- [ ] Export view-state JSON for QS.
- [ ] Unit tests for all state transitions.

## Challenges Met

- [x] Clarified this is not a pomodoro timer.
- [x] Clarified skipped does not mean done.
- [x] Clarified skip frees the user and does not autostart the next block.
- [x] Clarified non-autocomplete blocks can bleed into debt.
- [x] Clarified local-first is required.

## Open Decisions

- Exact final local state dir name.
- Exact Notion sync shape after navio DB creation capability is verified.
- Whether Quran block opens Zathura automatically in first implementation.

