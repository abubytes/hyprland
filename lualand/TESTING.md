# Lualand Testing Strategy

This file defines how the first implementation slice proves it works. The
design target is intentionally simple: tri-color, boxy Quickshell UI; no
animations; no decorative polish; readable UX and reliable behavior first.

## Test Layers

### 1. Pure Engine Tests

The timeblock, workstation, and policy code must be testable without Hyprland or
Quickshell.

Command:

```sh
node --test lualand/tests/*.test.js
```

These tests cover:

- starting a block,
- manual completion,
- auto-completion,
- skip behavior,
- skip reason and accountability phrase validation,
- skipped block does not autostart the next block,
- reset behavior,
- bleeding/overrun calculation,
- explicit auto-start chains,
- current/next block resolution,
- workstation decade mapping,
- eDP extension workspace mapping,
- visible/hidden workstation filtering,
- policy output for hard workstation locks,
- policy output for app actions and away-from-desk blocks.
- local JSON state persistence,
- append-only JSONL event logs,
- CLI state mutations,
- CLI `export-view` output for Quickshell,
- Hyprland dry-run command planning.

### 2. Static Quickshell/QML Checks

QML should parse and format before any live session test.

Commands:

```sh
find lualand/quickshell -name '*.qml' -print0 | xargs -0 qmlformat -i
qml lualand/quickshell/shell.qml
```

`qml` may not fully represent Quickshell runtime behavior, but it catches basic
QML syntax/import errors before `qs` is started.

### 3. Quickshell Smoke Test

The smoke test should run the config and tee logs somewhere inspectable.

Preferred command:

```sh
lualand/scripts/qs-smoke.sh
```

Expected log path:

```sh
/tmp/lualand-qs-smoke.log
```

The smoke script should use one of:

```sh
qs -p /home/marv/code/new-hyprland/lualand/quickshell
qs -c lualand
```

`qs --help` confirms that Quickshell discovers configs as
`<xdg dir>/quickshell/<config name>/shell.qml`, and that `--path` can run a QML
file or config folder directly.

To smoke the UI against generated engine state instead of the static sample:

```sh
lualand/scripts/qs-generated-smoke.sh
```

### 4. Live Hyprland Session Check

When a Hyprland session is active, run Quickshell with logs:

```sh
mkdir -p /tmp/lualand
LUALAND_QS_STATE=/tmp/lualand-demo/view.json qs -p /home/marv/code/new-hyprland/lualand/quickshell --no-duplicate --log-times -v 2>&1 | tee /tmp/lualand/quickshell-live.log
```

Checks:

- Quickshell starts without QML errors.
- One right-side boxy panel appears on the intended split screen.
- The timeline stack renders.
- The workstation rail renders.
- The task placeholder renders.
- Hover states do not resize or shift layout.
- The process exits cleanly when killed with `qs kill`.

### 5. Hyprland Adapter Dry Run

The first adapter layer should print planned commands before executing them.

Commands should be inspectable before live dispatch. Expected command families:

```sh
hyprctl dispatch workspace <workspace>
hyprctl dispatch moveworkspacetomonitor <workspace> <monitor>
hyprctl dispatch focusmonitor <monitor>
hyprctl keyword workspace <workspace>,monitor:<monitor>
```

The pure policy tests must pass before any real `hyprctl dispatch` command is
used for lock enforcement.

## Reference Sources

Official Quickshell source clone:

```sh
/home/marv/code/new-hyprland/.refs/quickshell
```

Current Hyprland source:

```sh
/home/marv/code/new-hyprland
```

Old inspiration config:

```sh
/home/marv/code/projects/sick/dots/.config/quickshell/ii
```

The old config is inspiration only. Do not copy its complexity or visual style
unless a specific behavior is intentionally being ported.

## Design Constraints For This Slice

- Use a simple tri-color palette.
- Use rectangular/boxy regions.
- No animations.
- No decorative backgrounds.
- No beauty work.
- Accent colors are allowed for state.
- Hover states are allowed only where they improve usability.
- Stable dimensions matter more than visual flourish.
- Keep text readable in the narrow side segment.
- Keep QML mostly display-oriented.
- Keep side effects in core/adapter scripts instead of QML.

## Per-Module Progress Files

Each module must keep a local checklist file:

- `lualand/modules/timeblocks/CHECKLIST.md`
- `lualand/modules/workstations/CHECKLIST.md`
- `lualand/modules/quickshell-ui/CHECKLIST.md`

Each checklist should include:

- task checklist,
- decisions made,
- challenges met,
- commands run,
- current failures,
- next fix if unfinished.
