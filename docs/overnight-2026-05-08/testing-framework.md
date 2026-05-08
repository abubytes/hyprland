# Testing Framework

The implementation needs tests at three levels: pure logic, command adapters,
and live session smoke tests. The live tests should be small and log-heavy, not
fragile visual automation.

## Test Principles

- Test pure logic first.
- Dry-run Hyprland command plans before live dispatch.
- Keep QML passive enough that it can be tested by feeding state JSON.
- Runtime smoke tests should write logs to `/tmp` or a known state dir.
- Every daemon should have a last-good JSON output and an error log.
- Do not rely on Notion availability for core desktop startup.

## Pure Logic Tests

Use Node's built-in test runner or the repo's existing JS test pattern for:

- Timeblock transitions.
- Skip rules.
- Debt/bleed calculation.
- Autocomplete behavior.
- Manual Done behavior.
- Workstation decade math.
- `+10000` mirror math.
- Numpad mapping.
- Hidden/blocked workstation filtering.
- Task sorting/filtering.
- Navio JSON normalization from fixtures.

Required fixtures:

- Old `workstations.json` sample.
- Navio `Tasks` schema sample.
- Navio `Projects` schema sample.
- Navio task query sample with mixed planned dates.
- Morning plan sample.
- Study plan sample.

## Hyprland Adapter Tests

Dry-run tests should verify:

- Workspace switch command for workstation N relative workspace R.
- Move-window command for workstation N relative workspace R.
- Mirror workspace command uses `+10000`.
- Monitor role resolver accepts split names such as `HDMI-A-1~1` and
  `HDMI-A-1~2`.
- Spawn-on-monitor plan includes focus/move fallback.
- Lock policy creates allowed workspace sets.

Live smoke tests should be opt-in and write logs:

```sh
/tmp/lualand-next-smoke/hyprctl-monitors.json
/tmp/lualand-next-smoke/hyprctl-workspaces.json
/tmp/lualand-next-smoke/hyprctl-clients.json
/tmp/lualand-next-smoke/commands.log
```

## Navio Tests

Navio sidecar tests should include:

- Command path check.
- Schema command check.
- Query command check.
- JSON parser fixture test.
- Local filtering test.
- Last-good-cache fallback test.
- Poll interval test without waiting five real minutes.

Runtime navio logs:

```text
/tmp/lualand-next/navio-cache.log
/tmp/lualand-next/navio-cache.last.json
/tmp/lualand-next/navio-cache.error.json
```

Do not print token contents.

## Quickshell Tests

QML should be testable by feeding static exported state:

- Morning state.
- Study active state.
- Work block active state.
- Navio unavailable/stale state.
- Many tasks.
- Many timeline blocks.
- Many workstations.

Smoke approaches:

- Run QS with `LUALAND_QS_STATE=/path/to/state.json`.
- Tee output to a known file.
- Check logs for QML exceptions.
- Query the running process.
- Optionally capture screenshot if running in a compositor.

Expected log path:

```text
/tmp/lualand-next/qs.log
```

## Runtime Acceptance Tests

The end-to-end smoke should prove:

- QS autostarts.
- `Super+Enter` spawns foot once.
- Close-window key closes focused program.
- Numpad workstation switching changes workspace as expected.
- `Super+1..0` changes relative workspaces in current workstation.
- HDMI is split `3/4` + `1/4`.
- eDP is not split.
- Cursor remains visible on all monitor roles.
- Notion desktop can appear on the right monitor.
- Laptop GM widget appears on eDP.
- Right panel/task panel appears on the side panel role.
- Logs are accessible.

## Manual Checks

Some checks are better done by the user in the real seat:

- Whether cursor visibility is fixed on physical HDMI.
- Whether start-hyprland seat setup behaves better than direct Hyprland.
- Whether key muscle memory feels correct.
- Whether QS panel placement matches the desired split.

The scripts should pause or log clear instructions for these checks, but not
silently guess success.

