# Module Checklist - Hyprland Lua Adapter

## Goal

Make Lua/Hyprland preserve old keybinds, monitor behavior, workspace dispatch,
and split-monitor startup without relying on stale old QS calls.

## Checklist

- [ ] Read old keybinds into a mapping table.
- [ ] Identify every current stale `qs -c ii` call.
- [x] Preserve `Super+Enter` foot.
- [x] Preserve close focused window key.
- [x] Preserve `Super+j/k/h/l` behavior.
- [x] Preserve relative workspace switching.
- [x] Preserve move-to-relative-workspace.
- [x] Preserve numpad workstation switching.
- [x] Preserve monitor focus keys.
- [x] Preserve special scratchpads.
- [ ] Preserve study lock shortcut.
- [x] Detect active Hyprland instance signature.
- [ ] Query monitors/workspaces/clients.
- [x] Resolve monitor roles.
- [x] Support HDMI `3/4` and `1/4` split.
- [ ] Keep eDP unsplit.
- [x] Spawn Notion desktop on right monitor.
- [ ] Log commands and failures.
- [x] Dry-run adapter tests.
- [ ] Live smoke tests.

## Challenges Met

- [x] Cursor visibility issue was fixed in previous patching work, but the new
  implementation must keep the monitor/split assumptions explicit.
- [x] Current split names can be `HDMI-A-1~1` and `HDMI-A-1~2`.
- [x] Current lualand has stale old QS command calls that must be removed or
  intentionally bridged.
- [x] Corrected role mapping: `HDMI-A-1~1` is `work_main`; `HDMI-A-1~2` is
  the right `side_panel`.
- [x] Removed the bad default that pinned workstation workspace `base+1` to the
  side panel.
- [x] Added adjacent Lua entrypoint and new workstation CLI so new keybinds do
  not depend on `qs -c ii`.

## Open Decisions

- Final close-window key: old config evidence includes `Super+Shift+C`, while
  user expects old `Super+Q` behavior. This must be explicitly settled before
  overwriting muscle memory.
- Whether direct `Hyprland` or `start-hyprland` is the final launcher in all
  paths. Current seat behavior points toward `start-hyprland`.
