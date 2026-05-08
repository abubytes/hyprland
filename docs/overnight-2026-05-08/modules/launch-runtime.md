# Module Checklist - Launch And Runtime

## Goal

Make the corrected system easy to start from TTY, log everything, and avoid
session-seat surprises.

## Checklist

- [x] New launcher script starts from `$HOME`.
- [x] Launcher does not require repo cwd.
- [x] Launcher chooses patched Hyprland path explicitly.
- [x] Launcher uses `start-hyprland` when seat setup is needed.
- [x] Launcher sets config path explicitly.
- [x] Launcher writes stdout/stderr logs.
- [x] Autostart starts QS.
- [x] Autostart starts navio cache sidecar.
- [x] Autostart starts timeblock/state exporter.
- [x] Autostart avoids old quickshell config unless deliberately bridged.
- [ ] Runtime status command shows PIDs and log paths.
- [ ] Stop command only stops processes owned by the new launcher.
- [ ] Smoke test script checks QS, Hyprland, and logs.

## Expected Logs

```text
/tmp/lualand-next/hyprland.log
/tmp/lualand-next/qs.log
/tmp/lualand-next/navio-cache.log
/tmp/lualand-next/exporter.log
/tmp/lualand-next/runtime-status.json
```

## Challenges Met

- [x] Confirmed direct Hyprland can cause seat/session uncertainty.
- [x] Confirmed user wants start-hyprland path when the real seat is free.
- [x] Confirmed previous logs under `/tmp/hypr-lua-tty/` were useful.

## Open Decisions

- Final script name for corrected experiment.
- Whether to update `~/.local/bin/lualand.sh` or create an adjacent
  `lualand-next.sh` after the corrected design is accepted.
