# Lualand Next

`lualand-next/` is the corrected adjacent implementation target. It does not
modify the earlier `lualand/` tree.

## What Exists

- Local-first timeblock core copied forward and adjusted for
  `LUALAND_NEXT_STATE_DIR`.
- Old workstation model support with decade workspace math and `+10000` eDP
  mirror workspaces.
- Navio cache sidecar for Projects/Tasks.
- Hyprland adapter with dry-run command planning and live instance detection.
- Passive Quickshell config that reads exported JSON from disk.
- TTY launcher skeleton using `start-hyprland`.
- Adjacent Lua config at `lualand-next/hypr-lua/hyprland.lua`.
- Workstation CLI for numpad and relative workspace keybinds without old
  `qs -c ii` IPC.

## State Paths

Default runtime files:

```text
/tmp/lualand-next/view-state.json
/tmp/lualand-next/qs.log
/tmp/lualand-next/navio-cache.json
/tmp/lualand-next/navio-cache.error.json
~/.local/state/lualand-next/timeblocks/state.json
~/.local/state/lualand-next/timeblocks/events.jsonl
```

## Commands

Run all tests:

```sh
node --test lualand-next/tests/*.test.js
```

Run navio cache once:

```sh
node lualand-next/daemons/navio-cache.js once \
  --cache-path /tmp/lualand-next/navio-cache.json \
  --error-path /tmp/lualand-next/navio-cache.error.json
```

Generate sample Quickshell state:

```sh
tmp="$(mktemp -d /tmp/lualand-next-store.XXXXXX)"
LUALAND_NEXT_STATE_DIR="$tmp" node lualand-next/bin/lualand-next.js init-sample
LUALAND_NEXT_STATE_DIR="$tmp" node lualand-next/bin/lualand-next.js export-view \
  --now 2026-05-08T08:10:00.000Z \
  --workstations lualand-next/state/sample-workstations.json \
  --tasks /tmp/lualand-next/navio-cache.json \
  --out /tmp/lualand-next/view-state.json
```

Smoke-test QS:

```sh
lualand-next/scripts/qs-next-smoke.sh
```

Dry-run Notion desktop spawn to the HDMI work-main split:

```sh
node lualand-next/bin/hyprland.js spawn --command notion-app --workspace 44
```

Dry-run a workstation workspace plan:

```sh
node lualand-next/bin/hyprland.js workstation \
  --workstation mr-p2 \
  --base 431 \
  --relative 1,10
```

Dry-run old numpad mapping through the new workstation CLI:

```sh
node lualand-next/bin/workstation.js switch-numpad 5 --dry-run --json
```

TTY launcher skeleton:

```sh
LUALAND_NEXT_CONFIG=/home/marv/.config/hypr-lua/hyprland.lua \
  lualand-next/scripts/lualand-next.sh
```

The launcher is intentionally not installed into `~/.local/bin` yet and does
not replace `/home/marv/.local/bin/lualand.sh`.

## Important Caveats

- `lualand-next/scripts/lualand-next.sh` is a skeleton. It points to
  `start-hyprland --path ... -- -c ...` and now defaults to
  `lualand-next/hypr-lua/hyprland.lua`.
- Notion DB creation is not implemented. Navio cache reads Projects and Tasks;
  timeblock writeback remains a separate phase.
- The QS surface is passive and basic. It intentionally avoids Notion, navio,
  hyprctl, and process polling inside QML.
- Side-panel workspaces are not guessed. Workstation plans only target
  `work_main` and eDP mirrors unless side workspaces are explicitly passed.
- The Lua config is a corrected bridge, not a complete port of every old
  keybind. It intentionally avoids old `qs -c ii` commands.
