# Overnight Module Plan

Each module should have its own checklist file under `modules/`. This file is
the cross-module map and implementation order.

## Module Boundaries

The system should be split into clear layers:

1. Source readers
2. Local state core
3. Policy planner
4. Hyprland adapter
5. Navio cache/sync sidecars
6. ActivityWatch bridge
7. Quickshell display/controller
8. Launch/autostart/runtime scripts
9. Test harness

The main rule: QML should not be where expensive side effects happen.

## Data Ownership

Local-first data:

- Timeblocks
- Timeblock events
- Active block state
- Skip reasons
- Debt/overrun
- UI export snapshot
- Navio cache
- Workstation metadata copy or normalized projection

Notion-owned data:

- Projects
- Tasks
- Existing work logs
- Possibly a synced Time Blocks database later

Hyprland-owned runtime state:

- Current monitors
- Current workspaces
- Current clients
- Workspace dispatches
- Window moves
- Monitor focus

QS-owned runtime state:

- UI hover/selection state
- Scroll position
- User clicks that call commands
- Nothing that must survive a QS restart unless written by a sidecar/core

## Implementation Target

Because this correction pass must not edit established files, the implementation
target should be adjacent. Candidate names:

- `lualand-next/`
- `lualand-nightly/`
- `lualand-experiment/`

The final name can be chosen at implementation time, but it should include:

- `core/`
- `bin/`
- `daemons/`
- `quickshell/`
- `state/`
- `tests/`
- `docs/modules/`

## Timeblock Core

Purpose:

- Model planned, active, skipped, completed, bleeding, and debt timeblocks.

Must support:

- Weekly planned blocks.
- Day timeline export.
- Manual start.
- Optional autostart.
- Autocomplete.
- Manual Done.
- Skip with required reason and phrase.
- Allow/exclude workstations.
- Allow/exclude workspace ranges.
- Away-from-desk blocks.
- Study-specific blocks.
- Morning routine chain.
- Local JSON/JSONL persistence.

Inputs:

- Local plan file.
- User commands.
- Clock.
- Optional Notion-synced blocks later.

Outputs:

- Event log.
- Current state JSON.
- Exported UI view JSON.
- Optional sync queue.

## Workstation Core

Purpose:

- Preserve old workstation model and provide clean commands.

Must support:

- Many workstations.
- Numpad mapping as shortcuts.
- Decade workspace math.
- Relative workspace 1 through 10.
- `+10000` laptop mirror workspaces.
- `last_workspace`.
- `last_workspace_external`.
- Slacking/Productivity laptop special behavior.
- External mirror toggle.
- Hidden/blocked/not-assigned workstations.
- Project-to-workstation relation.

Inputs:

- Old `workstations.json`.
- Local overrides.
- Monitor role config.
- Current Hyprland monitor/workspace state.

Outputs:

- Hyprland command plan.
- Exported workstation rail.
- Watcher-compatible mapping.

## Hyprland Adapter

Purpose:

- Convert policy/workstation actions into compositor commands.

Must support:

- Detect active `HYPRLAND_INSTANCE_SIGNATURE`.
- Query monitors/workspaces/clients.
- Map monitor names to roles.
- Dispatch workspace and moveworkspacetomonitor.
- Spawn apps on a chosen monitor.
- Move windows after spawn when needed.
- Apply workspace rules for split monitors.
- Avoid stale environment issues.

Tests:

- Dry-run command generation.
- Live smoke where safe.
- Log every command and result.

## Navio Cache

Purpose:

- Read Notion-owned project/task state through navio and normalize it locally.

Must support:

- `Tasks` schema read.
- `Projects` schema read.
- Project list cache.
- Task list cache.
- Local date/status filtering.
- Five-minute polling.
- Graceful failure using last good cache.
- No secret printing.

Writes:

- Notion writeback should be a separate phase.
- Timeblock DB creation is not confirmed safe through navio high-level commands.

## Timeblock Sync

Purpose:

- Eventually sync local timeblock events to Notion.

Must support:

- Local-first operation.
- Sync queue.
- Conflict notes.
- Existing sparse `Time blocks` DB detection.
- Safe schema inspection before writes.
- No direct QML writes.

Open issue:

- Need verify whether navio internal commands can create a database or whether
  the user wants a manual Notion DB setup first.

## ActivityWatch Bridge

Purpose:

- Preserve old tracking usefulness while moving policy out of QS.

Must support:

- Read or reuse existing workstation watcher.
- Map mirror workspaces back to base workstation.
- Intersect active input with workstation time.
- Feed local productivity/day summaries.
- Later sync Work Log through navio or keep old sync isolated.

## Quickshell Dashboard

Purpose:

- Dense display and lightweight controls.

Surfaces:

- Laptop GM widget.
- HDMI side panel/top panel depending final monitor split behavior.
- Timeline.
- Current block timer/debt.
- Compact task list.
- Workstation rail.
- Notion cache status.
- Later prayer/adhkar.
- Later assistant/chat auxiliary slots.

Rules:

- Dark mode.
- Boxy.
- Compact.
- No animations required.
- No heavy polling from QML.
- Read exported state JSON.
- User actions call commands.

## Morning Scenario

Purpose:

- First end-to-end acceptance path.

Expected flow:

1. User starts Lualand from TTY.
2. Hyprland starts with split HDMI and unsplit eDP.
3. QS starts automatically.
4. Laptop shows GM/date/morning widget.
5. Notion desktop opens on the right monitor.
6. Morning timeblock is active or ready to start.
7. Timeline shows morning routine, Quran, study blocks, break, work blocks.
8. User can press Done or Skip according to timeblock policy.

## Study Scenario

Purpose:

- Preserve the high-value old study enforcement.

Expected flow:

1. Study block starts.
2. Active workstation becomes Studying.
3. Lock policy restricts to Studying allowed ranges.
4. Anki status appears if AnkiConnect is available.
5. Break behavior follows block policy.
6. Done records completion and transitions.

## Task Scenario

Purpose:

- Prove navio cache and right-panel display.

Expected flow:

1. Navio sidecar reads Projects and Tasks.
2. Local cache is written.
3. Exported UI state contains today's relevant tasks.
4. QS shows compact mono task rows.
5. In-progress and undone tasks appear before done tasks.
6. If navio fails, stale cache or sample fallback is clear.

## Launch Scenario

Purpose:

- Make TTY startup reproducible.

Expected flow:

1. Script starts from `$HOME`, not a repo cwd.
2. Script finds patched Hyprland path.
3. Script starts `start-hyprland` if seat setup is needed.
4. Script logs stdout/stderr to known files.
5. Autostart launches sidecars and QS.
6. No old `qs -c ii` calls are accidentally required for new behavior.

