# Module Checklist - Morning Flow

## Goal

Make the first login/session path useful immediately.

## Checklist

- [ ] Define morning plan fixture.
- [ ] Show laptop GM widget.
- [ ] Show date.
- [ ] Show first actionable morning state.
- [ ] Spawn Notion desktop on right monitor.
- [ ] Start or stage morning routine block.
- [ ] Support Done.
- [ ] Support Skip with reason/phrase.
- [ ] Support bleed/debt.
- [ ] Chain to Quran block if configured.
- [ ] Open Quran/Zathura if configured.
- [ ] Chain to study blocks if configured.
- [ ] Log morning events locally.
- [ ] Export morning state for QS.
- [ ] Runtime acceptance test.

## Challenges Met

- [x] Clarified morning flow includes Notion desktop on the right monitor.
- [x] Clarified laptop should have a big GM widget.
- [x] Clarified morning blocks are the main autostart-chain case.

## Open Decisions

- Exact Notion desktop command/class matching.
- Exact Quran PDF path and Zathura command.
- Whether the first morning block autostarts immediately on login or waits for
  a "woke up" user action.

