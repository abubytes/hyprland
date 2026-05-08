# Lualand

Lualand is the local productivity layer for the patched Hyprland Lua session.
It is being built as a thin, testable system:

- pure local timeblock/workstation logic,
- local JSON/JSONL state first,
- dry-run Hyprland adapter planning,
- simple Quickshell right-side UI,
- Notion and richer study integrations later.

The first visible UI target is deliberately plain:

- tri-color,
- boxy,
- no animations,
- no decorative polish,
- readable and dense.

## Layout

- `core/`: pure JavaScript logic with no compositor or QML dependency.
- `tests/`: Node built-in test suites.
- `quickshell/`: minimal Quickshell config.
- `scripts/`: smoke/integration helpers.
- `modules/*/CHECKLIST.md`: per-module task/challenge/test notes.
- `TESTING.md`: test strategy and command reference.

## Main Commands

Run pure tests:

```sh
node --test lualand/tests/*.test.js
```

Initialize a local sample plan and export the UI state:

```sh
LUALAND_STATE_DIR=/tmp/lualand-demo ./lualand/bin/lualand-timeblocks.js init-sample
LUALAND_STATE_DIR=/tmp/lualand-demo ./lualand/bin/lualand-timeblocks.js start morning --now 2026-05-07T07:00:00Z
LUALAND_STATE_DIR=/tmp/lualand-demo ./lualand/bin/lualand-timeblocks.js export-view --now 2026-05-07T07:10:00Z --out /tmp/lualand-demo/view.json
```

Run Quickshell smoke test:

```sh
lualand/scripts/qs-smoke.sh
```

Run Quickshell smoke against generated engine state:

```sh
lualand/scripts/qs-generated-smoke.sh
```

Run Quickshell live with logs:

```sh
mkdir -p /tmp/lualand
LUALAND_QS_STATE=/tmp/lualand-demo/view.json qs -p /home/marv/code/new-hyprland/lualand/quickshell --no-duplicate --log-times -v 2>&1 | tee /tmp/lualand/quickshell-live.log
```

By default the panel targets `HDMI-A-1~2`, the right-side HDMI split. Override
with `LUALAND_QS_SCREEN=<screen-name>` or use `LUALAND_QS_SCREEN=all` for one
panel per screen.

## Reference Sources

- Official Quickshell source: `/home/marv/code/new-hyprland/.refs/quickshell`
- Current Hyprland checkout: `/home/marv/code/new-hyprland`
- Old inspiration config: `/home/marv/code/projects/sick/dots/.config/quickshell/ii`

The old config is a behavior reference only. Do not inherit its visual density,
animations, or architectural complexity unless a behavior is explicitly being
ported.
