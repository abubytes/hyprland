# Implementation Log

This log records what was built in the adjacent `lualand-next/` target after
the corrected source pass.

## Built

- `lualand-next/core/timeblocks.js`
  - Local-first timeblock core copied forward.
  - Supports manual Done, autocomplete, skip with reason/phrase, bleed/debt,
    relations, and event logs.

- `lualand-next/core/workstations.js`
  - Supports old `workstations.json` shape.
  - Normalizes workstation IDs from old names.
  - Uses `+10000` eDP mirror offset.
  - Preserves `mapping`, `last_workspace`, and `last_workspace_external`.

- `lualand-next/core/view-state.js`
  - Exports QS-oriented JSON.
  - Adds GM widget state, updated timestamp, debt text, workstation ranges,
    compact timeline fields, and task ordering.

- `lualand-next/daemons/navio-cache.js`
  - Reads Projects and Tasks through navio.
  - Uses `uv run navio ... --json` from `/home/marv/.openclaw/navio`.
  - Normalizes task/project data and caches local JSON.
  - Keeps last good cache on failure.

- `lualand-next/core/hyprland-adapter.js`
  - Resolves monitor roles for laptop, work_main, and side_panel.
  - Handles live split behavior where `HDMI-A-1~1` is the larger 3/4 region and
    `HDMI-A-1~2` is the right 1/4 region.
  - Dry-runs workstation workspace plans and app spawn plans.
  - Does not pin side-panel workspaces unless explicit.

- `lualand-next/bin/workstation.js`
  - Provides new numpad and relative workspace commands without old
    `qs -c ii` IPC.
  - Uses old workstation mappings and `last_workspace`.
  - Writes current workstation runtime state under `/tmp/lualand-next`.

- `lualand-next/quickshell/`
  - Passive QS config reading only `LUALAND_NEXT_QS_STATE` or
    `/tmp/lualand-next/view-state.json`.
  - Laptop GM widget.
  - Compact side panel with block summary, tasks, timeline, and workstation
    rail.
  - No QML navio/hyprctl/process polling.

- `lualand-next/scripts/lualand-next.sh`
  - New TTY launcher.
  - Starts from `$HOME`.
  - Uses `start-hyprland --path`.
  - Logs under `/tmp/lualand-next`.
  - Defaults to `lualand-next/hypr-lua/hyprland.lua`.

- `lualand-next/hypr-lua/hyprland.lua`
  - Adjacent Lua entrypoint.
  - Splits HDMI `3fr|1fr` and keeps eDP unsplit.
  - Autostarts Lualand Next sidecars/QS.
  - Binds `Super+Enter`, close-window keys, monitor focus, numpad
    workstation switching, and relative workspace switching/moving.
  - Avoids old `qs -c ii` calls.

## Verification

Commands run:

```sh
node --test lualand-next/tests/*.test.js
node --check lualand-next/core/hyprland-adapter.js
node --check lualand-next/bin/hyprland.js
node --check lualand-next/bin/lualand-next.js
node --check lualand-next/daemons/navio-cache.js
node --check lualand-next/bin/workstation.js
luac -p lualand-next/hypr-lua/hyprland.lua
bash -n lualand-next/scripts/lualand-next.sh lualand-next/scripts/autostart.sh lualand-next/scripts/export-loop.sh
node lualand-next/daemons/navio-cache.js once --cache-path /tmp/lualand-next/navio-cache.json --error-path /tmp/lualand-next/navio-cache.error.json
lualand-next/scripts/qs-next-smoke.sh
```

Observed results:

- Node tests: `31/31` passed.
- Real navio cache: `ok=true`, `14` projects, `200` tasks, `32` undone tasks,
  `0` empty task titles.
- QS smoke: `qmlformat` passed, QS config loaded, then timeout stopped it.
- Hyprland dry-run spawn: `notion-app` targets `HDMI-A-1~1` as `work_main`.
- Hyprland dry-run workstation: `mr-p2` base `431`, mirror `10431`, no implicit
  side-panel workspace pin.
- Workstation CLI dry-run: numpad `5` maps to Mr-P2 workspace `433` using old
  `last_workspace`.
- Lua syntax: `luac -p` passed.

## Still Open

- The new Lua config is an adjacent bridge, not a complete old-config port.
- Slacking/Productivity special toggle behavior is detected in the model but
  not fully reimplemented in the new CLI yet.
- No existing `lualand/` files were edited.
- No `~/.local/bin/lualand.sh` replacement was installed.
- No Notion timeblock database schema was created.
- No real TTY launch was attempted in this pass.
- Exact top-panel vs side-panel placement remains a tomorrow discussion item.
