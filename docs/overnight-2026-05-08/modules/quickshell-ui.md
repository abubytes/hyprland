# Module Checklist - Quickshell UI

## Goal

Build a compact, practical QS surface that reads exported JSON and exposes
actions without owning heavy behavior.

## Checklist

- [x] Add laptop GM widget surface.
- [x] Add side panel/top panel surface for HDMI right split.
- [x] Read exported JSON state.
- [x] Show current block title.
- [x] Show remaining time or debt.
- [x] Show compact scrollable timeline.
- [x] Show compact mono task list.
- [x] Show workstation rail.
- [ ] Show navio cache freshness.
- [ ] Show morning state.
- [ ] Show study state.
- [ ] Wire Done command.
- [ ] Wire Skip command.
- [ ] Wire workstation click command.
- [x] Avoid QML shell polling loops.
- [x] Avoid expensive QML timers.
- [x] Test with static state fixtures.
- [x] Runtime smoke with logs.

## Visual Rules

- Dark mode.
- Three-color boxy design.
- Compact spacing.
- No animations required.
- Active timeline block uses background difference, not borders.
- Task rows look like `- [ ] single line`.
- Workstation icons should be generated raster assets when needed.

## Challenges Met

- [x] Corrected over-focus on decorative visuals.
- [x] Corrected random emoji/SVG icon direction.
- [x] Clarified QML should be mostly read-only.

## Open Decisions

- Exact top/side placement after tomorrow's monitor discussion.
- Exact icon style set.
- Whether laptop GM widget remains all day or only morning.
