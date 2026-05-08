# Misunderstandings To Correct

This file records the places where the previous implementation mental model was
wrong or incomplete.

## Notion Access

Wrong assumption:

- Treating the system as if it should call the Notion API directly from new
  services or UI.

Correct understanding:

- Use `navio`.
- `navio` is the local Notion access boundary.
- Quickshell should be read-only from local cache/exported state.
- Notion polling should be around every 5 minutes.
- Local-first state should keep the desktop usable if Notion is unavailable.

Implementation correction:

- Build a sidecar that shells out to:

```sh
cd /home/marv/.openclaw/navio
uv run navio ...
```

- Normalize the JSON locally.
- Filter locally when navio filters are unreliable.
- Keep writes/sync separate from UI and Hyprland startup.

## Workstation Count

Wrong assumption:

- Treating nine numpad keys as the workstation universe.

Correct understanding:

- Workstations are many. The old state already has far more than nine.
- Numpad keys are fast mappings into the larger workstation list.
- Workstations are project/life contexts, each with its own workspace decade.

Implementation correction:

- Preserve `workstations.json` shape and semantics.
- Make the UI show a larger workstation rail/list.
- Keep numpad mapping configurable.
- Keep hidden/blocked/not-assigned workstations possible.

## Workspace Math

Wrong assumption:

- Using a new small external offset such as `100`.

Correct understanding:

- Old external mirror workspaces use `+10000`.
- Normal workspaces use the workstation decade:

```text
(number - 1) * 10 + relative
```

Implementation correction:

- Use `+10000` for laptop mirrors.
- Support relative workspace 1 through 10.
- Update watchers/adapters so mirrors map back to the same workstation.

## Quickshell Responsibility

Wrong assumption:

- Treating QS as the place where policy, polling, and shell-side behavior should
  live.

Correct understanding:

- QS should be mostly read-only display plus explicit user action calls.
- Heavy polling, Notion access, ActivityWatch aggregation, Hyprland dispatch
  planning, and persistence belong in sidecars/core modules.

Implementation correction:

- Keep QML passive.
- Use exported JSON state.
- Use explicit commands for actions.
- Avoid QML loops that shell out.

## Old Flow Preservation

Wrong assumption:

- Building a new visible UI before fully porting the old flows.

Correct understanding:

- Muscle memory matters first: keybinds, monitor focus, workstation switching,
  external mirror mode, special scratchpads, study lock.

Implementation correction:

- Read and map old Hyprland keybinds before rewriting Lua binds.
- Treat stale `qs -c ii` calls as a porting blocker.
- Test keybind actions by observing Hyprland state, not by assuming Lua syntax.

## Morning Flow

Wrong assumption:

- Morning is just a timer/dashboard state.

Correct understanding:

- Morning readiness includes a visible laptop GM widget, date, the first
  actionable status, Notion desktop spawned on the right monitor, and a routine
  block that may be partly away from the screen.

Implementation correction:

- Make a morning scenario as an acceptance test.
- Spawn Notion desktop to the right monitor.
- Show laptop-side GM widget.
- Start with local timeblock state even before Notion sync exists.

## Locking

Wrong assumption:

- Locks might need to kill apps or aggressively manage windows.

Correct understanding:

- Default lock should be hard workstation/workspace confinement.
- Do not kill applications unless explicitly configured later.

Implementation correction:

- Implement lock as allowed workstation/workspace policy.
- Keep escape/skip flows accountable.
- Record skip reason and phrase.

## Visual Assets

Wrong assumption:

- SVG placeholders were acceptable for workstation icons.

Correct understanding:

- Use generated raster assets for test icons when assets are needed.
- Keep them descriptive and transparent-background where appropriate.

Implementation correction:

- Do not hand-roll placeholder SVG icons for this.
- Generate or curate image assets in an asset step.

## Existing Files

Wrong assumption:

- Continuing to mutate the already-created Lualand files was okay.

Correct understanding:

- For this correction pass, put new planning and future implementation files in
  new paths.

Implementation correction:

- This directory is additive.
- Future experimental implementation should use an adjacent target until the
  corrected design is accepted.

