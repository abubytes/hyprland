# Quickshell UI Checklist

## Tasks

- [x] Create a minimal Quickshell config under `lualand/quickshell`.
- [x] Use official Quickshell primitives: `ShellRoot`, `Variants`, `PanelWindow`, `FileView`.
- [x] Add a boxy tri-color right-side panel.
- [x] Scope the right-side panel to the HDMI right split by default.
- [x] Add a workstation icon rail.
- [x] Add a dense vertical timeline stack with scrolling.
- [x] Add a task list placeholder without touching the JS engine.
- [x] Add local sample JSON state at `lualand/quickshell/state.sample.json`.
- [x] Add smoke runner at `lualand/scripts/qs-smoke.sh`.
- [x] Run smoke checks and record exact results.
- [x] Fix QML/runtime validation errors found by smoke checks.

## Decisions

- The UI reads `LUALAND_QS_STATE` when set, otherwise it reads `state.sample.json`.
- The first slice is display-only; no Hyprland dispatch or JS engine side effects live in QML.
- The visual language is limited to paper, ink, and one accent color, with square borders and no animations.
- The panel is created per screen through `Variants { model: Quickshell.screens }`.
- The panel defaults to a single target screen, `HDMI-A-1~2`, with
  `LUALAND_QS_SCREEN=<name>` or `LUALAND_QS_SCREEN=all` as overrides.
- Plain `qml` is advisory for this config because it exits with `Did not load any objects` on the Quickshell `ShellRoot`; `qs -p` is the authoritative runtime validation.

## Challenges

- `lualand/quickshell` did not exist, so the UI slice had to be scaffolded from scratch.
- Official Quickshell docs in this repo are source-first; the implementation was grounded in local headers and manual QML examples from `.refs/quickshell`.
- The old config is intentionally not copied because it carries heavy services, animations, and a different visual system.
- Local `qmlformat 1.0` silently returned `1` for `pragma ComponentBehavior: Bound`; the pragma was removed because it was optional and blocked the documented static check.
- `Text.background` is not valid for QtQuick `Text`; the status chip is now a `Rectangle` containing `Text`.
- Repeater delegates did not expose `index` in the first timeline wiring; timeline cards now use `modelData`, and task rows declare `required property int index`.

## Commands And Results

- `qmlformat -i lualand/quickshell/shell.qml lualand/quickshell/components/RightPanel.qml lualand/quickshell/components/TimelineCard.qml lualand/quickshell/components/TaskList.qml lualand/quickshell/components/WorkstationRail.qml` -> initially failed until `pragma ComponentBehavior: Bound` was removed; then exited `0`.
- `timeout 5 qs -p /home/marv/code/new-hyprland/lualand/quickshell --no-duplicate --log-times -v` -> initially failed with `Cannot assign to non-existent property "background"`; after the status-chip patch it reached `Configuration Loaded`.
- `lualand/scripts/qs-smoke.sh` -> final result `smoke status: 0`.
- `lualand/scripts/qs-generated-smoke.sh` -> final result `smoke status: 0`.
- Final smoke details: all five QML files returned `OK` from `qmlformat -n`; `qml` exited `2` with `Did not load any objects` and was logged as advisory; `qs -p /home/marv/code/new-hyprland/lualand/quickshell --no-duplicate --log-times -v` reached `Configuration Loaded` and was stopped by timeout.
- Final smoke log path: `/tmp/lualand-qs-smoke.log`.

## Current Failures

- None from the smoke loop. Remaining log warnings are environment-level: `QSettings::value: Empty key passed`, missing `.qmlls.ini`, and portal app-id registration for `land.lualand.shell`.

## Next Fix

- Live visual review inside the target Hyprland session, then add recurring
  engine-state export or a daemon.
