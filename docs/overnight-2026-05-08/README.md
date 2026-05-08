# Lualand Overnight Source Of Truth - 2026-05-08

This directory is a new correction layer. It does not replace the earlier
`docs/lualand-productivity-system-plan.md`, and it does not modify the current
`lualand/` implementation. The point is to freeze the corrected understanding
before the next implementation pass.

## Why This Exists

The previous pass drifted in a few important ways:

- It treated Notion like a direct API integration problem.
- It treated the nine numpad keys as the workstation model.
- It treated Quickshell like the owner of behavior rather than a mostly passive
  dashboard/controller surface.
- It under-read the old workstation/external-monitor flow.
- It made visual changes before fully preserving the old muscle-memory flows.

The next pass must start from the old system behavior and then reimplement it
cleanly in Lualand.

## Current Hard Constraints

- Do not edit the existing `lualand/` files until the corrected plan has an
  implementation target.
- New implementation experiments should live in adjacent new files/configs.
- Hyprland/Lua should own compositor-facing rules and dispatches.
- Quickshell should primarily read state, show dense state, and call explicit
  commands for user actions.
- Notion access must go through `navio`, not a direct Notion API client in the
  Hyprland/QS runtime path.
- The system should be local-first. Notion is a source/sink, not a blocking
  dependency for the desktop session.
- Locks should not kill applications by default. They should constrain allowed
  workstations/workspaces and visible flows.
- Workspace/workstation behavior must preserve the old decade model and mirror
  model.
- The UI target for now is dense, tri-color, boxy, dark, compact, and practical.
  UX matters more than polish. No animations are required.

## Source Anchors

These files are the current source anchors for rebuilding the system:

- Old Quickshell entrypoint:
  `/home/marv/code/projects/sick/dots/.config/quickshell/ii/shell.qml`
- Old workstation service:
  `/home/marv/code/projects/sick/dots/.config/quickshell/ii/services/WorkstationManager.qml`
- Old workstation state:
  `/home/marv/.local/state/quickshell/user/workstations.json`
- Old Hyprland keybinds:
  `/home/marv/.config/hypr/custom/keybinds.conf`
- Old relative workspace keybinds:
  `/home/marv/.config/hypr/hyprland/keybinds.conf`
- Old monitor setup:
  `/home/marv/.config/hypr/monitors.conf`
- Old rules/static pinning:
  `/home/marv/.config/hypr/custom/rules.conf`
  `/home/marv/.config/hypr/custom/stupid.conf`
- ActivityWatch/workstation stack:
  `/home/marv/code/python/workstation-watcher/`
- Navio:
  `/home/marv/.openclaw/navio`
- Navio local skill:
  `/home/marv/cog/.claude/skills/navio/SKILL.md`
- Personal context:
  `/home/marv/cog`
- Current Lua entry:
  `/home/marv/.config/hypr-lua/hyprland.lua`
- Current launcher:
  `/home/marv/.local/bin/lualand.sh`

## Old Workstation Model To Preserve

Workstations are not only the nine numpad mappings. The old state already has
many workstations. The nine numpad keys are fast access slots into that larger
set.

Each workstation has a `number`. Its normal workspace decade is:

```text
base = (number - 1) * 10
relative workspace 1..10 = base + 1..10
```

The old code mostly used `+1..+9`; the new model should support the full ten
relative workspaces because the user explicitly wants ten.

External/laptop mirror workspaces use:

```text
mirror workspace = base workspace + 10000
```

This `+10000` offset is important. A previous Lualand sample used `100`, which
is incompatible with the old rules and watcher assumptions.

The current known numpad mapping is:

```text
1 -> Slacking special laptop toggle
2 -> Studying
3 -> Nasih
4 -> Rafid
5 -> Mr-P2
6 -> Malaria
7 -> Sarah
8 -> Atheer
9 -> Configuring
```

The known broader workstation set includes Slacking, Studying, Haulerz, Remote,
Configuring, Work, German, Shelloh, Sarah, Wadud, ADHD, Productivity, Rzn,
Sunny Valley, Nasih, TacTaxi, Mareen, Lama, N-Saloons, Howdaj, Malaria, Mr-P1,
Mr-P2, Etex, LuLu, Rafid, and Atheer.

## Monitor Roles

The intended physical layout:

- eDP is the laptop screen on the left.
- HDMI is the external screen on the right.
- Current external test monitor may be 1080p.
- Future external target is 2K.
- The patched Hyprland split should split HDMI into main `3/4` and right `1/4`.
- eDP should not be split.

Monitor names can vary under the split patch, so the new system must use monitor
roles rather than blindly hardcoding `HDMI-A-1`, `HDMI-A-1~1`, or
`HDMI-A-1~2` everywhere.

The intended monitor roles:

- `laptop`: eDP full monitor.
- `work_main`: HDMI main `3/4` region.
- `side_panel`: HDMI right `1/4` region.

The right segment is not merely decoration. It is a persistent productivity
surface showing the current timeblock, timeline, today's relevant tasks,
workstation rail, prayer/adhkar later, and auxiliary assistant/chat/window
slots later.

## Morning Flow

Morning readiness should include:

- A big Quickshell widget on the left/laptop monitor saying good morning, date,
  and the first useful status for the day.
- Notion desktop spawned and shown on the right monitor.
- Morning routine timeblock first.
- The morning routine may be away-from-keyboard or partially off-screen.
- Notion is visible so habits and daily setup can be signed in.
- Then Quran/Zathura block can follow, with manual completion if configured.
- Then study blocks can start, usually around Anki.

Morning blocks are likely the main category where autostart chains matter.
Other blocks are often manually started by the user.

## Timeblocks

This is not a pomodoro timer. It is a general timeblock system that can express
pomodoros, routines, study, work, forced breaks, away-from-desk blocks, and
project-specific work sessions.

A timeblock may have:

- `id`
- `title`
- `kind`
- `start time`
- `planned duration`
- `actual start`
- `actual end`
- `status`
- `autostart relationship`
- `autocomplete`
- `allow bleed/debt`
- `allowed workstations`
- `excluded workstations`
- `allowed workspace ranges`
- `excluded workspace ranges`
- `required apps`
- `suggested apps`
- `display notes`
- `skip reason`
- `manual done reason`
- `source`
- `sync status`

Completion rules:

- If skipped, it is not marked done.
- If skipped, the user is freed and the next block does not autostart.
- Skip requires a reason and a deliberately long accountability phrase.
- If autocomplete is true, it is marked done when time runs out.
- If autocomplete is false, it remains active past its planned end until the
  user presses Done.
- Bleed/debt means the user is still in the block after planned time expires.
- Debt time should be recorded.

This system should support weekly planning, but implementation can start with a
local day plan plus import/export/sync boundaries.

## Study Flow

Study is a first-class enforced flow, not a generic work timer.

Known goals:

- Lock to the Studying workstation when study is active.
- Anki is central.
- AnkiConnect can expose what is happening in Anki.
- Study can use 50/10 style sessions.
- Breaks can be forced away-from-desk.
- Some blocks may allow bleeding, then start a break only after Done.
- The system should support a study dashboard later.

Important old behavior:

- The old study system had a lock context and a hard lock file.
- The lock was based on workspace/workstation constraints.
- It should not casually unlock just because time expired.
- The user reports completion, then the system can transition.

## Tasks And Projects

Tasks/projects are Notion-owned for now. QS should read a normalized local
cache, not query Notion directly from QML.

The right panel should eventually show:

- Today's tasks.
- Tasks grouped or filtered by active workstation/project.
- `in progress` first.
- Then undone/todo.
- Then done.
- Only a compact visible subset.
- Mono single-line task rows like `- [ ] Task title`.
- Later: a speedrun-like task timer with Start/Stop.

The old dashboard task UI is not reliable as a backend reference. Real task
source should come from navio and local cache.

Known navio schemas:

- `Tasks`: `Task Name`, `Status`, `Priority`, `Planned Date`, `Due Date`,
  `Project`, `Estimated Hours`, `Actual Hours`.
- `Projects`: `Name`, `Slug`, `Status`, `Deadline`, `Client`, `Tasks`.
- `Work Log`: `Entry`, `Hours`, `Timestamp`, `Project`, `Type`, `Notes`.
- `Time blocks`: currently exists but is sparse and may not be sufficient.

Because navio date filtering may return wider results than requested, the
sidecar should pull bounded JSON and filter dates/status/project locally.

## Navio Boundary

Use:

```sh
cd /home/marv/.openclaw/navio
uv run navio <command>
```

Rules:

- Always inspect schema before writes or filtered queries.
- Do not print secrets.
- Do not put a Notion client inside QML.
- Do not block Hyprland session startup on Notion.
- Poll Notion roughly every 5 minutes.
- Cache normalized data under the Lualand state dir.
- QS reads cache/exported state only.

Open issue:

- There is no confirmed safe high-level navio command for creating a full
  Notion database schema. Until verified, the local timeblock schema should be
  primary, and Notion writeback should either target an existing DB safely or be
  queued for explicit schema creation.

## Quickshell UI Shape

For now the UI should be simple and dense:

- Dark mode.
- Three-color boxy design.
- No animations.
- Hover states only where useful.
- Compact spacing.
- Compact timeline.
- Active timeline item has a different background, not heavy borders.
- Task list is mono and single-line.
- Right side panel should act like a practical status/control panel, not a
  decorative app.
- Workstation icons should be descriptive raster assets when generated, not
  random emoji and not SVG placeholders.
- Keep QML display-oriented. Expensive shelling, polling, and policy decisions
  belong in daemons/adapters.

Avoid old QML pitfalls:

- No 1ms resource timers.
- No Bun/Python/curl loops from QML every second.
- Do not assume LazyLoader alone prevents singleton startup cost.

## Hyprland/Lua Shape

Lualand should preserve the old muscle memory before adding new behavior:

- `Super+Enter` spawns foot.
- `Super+Q` closes focused program if that remains the chosen old behavior.
- `Super+j/k/h/l` preserve focus/move/layout muscle memory.
- `Super+1..0` switches relative workspace inside the current workstation.
- `Super+Shift+1..0` moves the window to relative workspace inside current
  workstation.
- Numpad keys switch mapped workstations.
- Numpad `*` toggles external mirror mode.
- Numpad `1` preserves the Slacking/Productivity laptop special behavior.
- Monitor focus shortcuts should preserve old behavior.
- Study lock shortcut should be preserved.
- Special scratchpads should be preserved.

Stale `qs -c ii` calls in current Lua are a known risk. New code should either
replace them with the new command boundary or intentionally bridge to the old
service while porting.

## ActivityWatch And Work Logs

The old watcher stack is useful and should be preserved conceptually:

- Hyprland socket watcher records workspace changes.
- Quickshell/workstation watcher maps workspaces to workstation names.
- Input watcher records active/idle.
- Aggregator intersects mapped workstation time with active input time.
- Sync writes work logs.

For the new system:

- Keep tracking sidecars outside QML.
- Decide how `+10000` mirror workspaces map back to base workstations.
- Prefer local aggregation first.
- Notion sync should be a separate daemon and should use navio where practical.

## Overnight Implementation Order

1. Freeze source facts and misunderstanding log.
2. Build a new adjacent implementation target, not edits to existing `lualand/`.
3. Implement pure local timeblock core and event log.
4. Implement workstation model with old decade and `+10000` mirror semantics.
5. Implement navio sidecar read cache for projects/tasks.
6. Implement exported view-state JSON.
7. Implement passive QS panels reading only exported JSON.
8. Implement Hyprland adapter commands and launch scripts.
9. Add morning flow launcher: GM widget, Notion desktop, initial block.
10. Add tests around each module.
11. Runtime smoke-test inside current Hyprland if available, with logs tee'd to
    accessible files.

## Done Means

The morning-ready result is not "pretty UI appears". Done means:

- The workstation math matches old behavior.
- Numpad mapping preserves old intent.
- The split monitor roles are detected or configured cleanly.
- QS autostarts from the chosen launcher.
- QS reads exported local state without Notion dependency.
- `Super+Enter`, close-window, monitor focus, and workstation switching work.
- Notion desktop can be spawned to the right monitor for morning flow.
- The right panel shows compact tasks from navio cache or sample fallback.
- The laptop monitor can show the morning widget.
- Timeblocks can start, complete, skip with reason, and record debt locally.
- Tests exist and can be run without a full compositor where possible.
- Runtime logs are written to known files.

