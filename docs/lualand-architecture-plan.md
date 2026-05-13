# Lualand Architecture Plan

Status: **draft, iterating.** Companion to `lualand-productivity-system-plan.md`
(which captures *what* the system should do). This doc captures *how* we'll
build it — the module layout and separation of concerns.

This plan supersedes the existing `lualand-next/` implementation. The intent is
to throw away most of the JS layer and rebuild on patterns inspired by
end4-dots.

---

## Headline Shift

The previous agent read "QML must stay passive" as "QML can't hold logic →
build a 4,585-line Node.js backend." That was wrong.

End4-dots shows the right reading:

- **Panels and widgets** stay passive (no business logic in view files).
- **Service singletons inside Quickshell** are where state and side-effects
  live. Quickshell already provides `Process`, `FileView`, `Timer`,
  `Quickshell.Hyprland`, and `IpcHandler` — that *is* the runtime.

No Node.js daemons. No 15-second export loop. No 8 env vars. No JSON shim
between two layers of the same system.

## What Goes Away

| Current `lualand-next/` | Replacement |
| --- | --- |
| `core/timeblocks.js` (997L) | `services/Timeblocks.qml` |
| `core/view-state.js` (616L) | property bindings — no JSON shim layer |
| `core/hyprland-adapter.js` (658L) | `services/Hyprland.qml` over `Quickshell.Hyprland` |
| `core/store.js` (166L) | `services/Persistence.qml` over `FileView` |
| `daemons/navio-cache.js` (403L) | `services/Navio.qml` (Timer + Process) |
| `bin/*.js` (719L) | Hyprland keybinds → `qs ipc call ...` directly |
| `scripts/export-loop.sh` (15s polling) | gone — bindings are reactive |
| 8 `LUALAND_NEXT_*` env vars | one `Config.qml` reading a single JSON |

## What Stays

- **Hypr config stays Lua.** Don't split into `.conf` files like end4. The
  existing `hypr-lua/hyprland.lua` is the surface; we'll edit it in place as
  the keybind contract evolves toward `qs ipc call`.
- The architectural principles from `lualand-productivity-system-plan.md`:
  generic block + preset/type field, local-first, hybrid storage, hard
  workstation lock first, app flow declared per block, accountability skip
  phrase.

## Top-Level Layout (proposed)

```
~/.config/lualand/                ← standalone repo lives here
├── hypr-lua/
│   └── hyprland.lua              ← stays as-is, Lua, in-place edits
├── data/                         ← user content (tracked or per-machine)
│   ├── workstations.json
│   └── plan.json                 ← week plan
└── quickshell/                   ← qs -p points here
    ├── shell.qml
    ├── services/                 ← runtime layer (singletons)
    ├── modules/
    │   ├── common/
    │   ├── sidePanel/            ← right 1/4 strip
    │   ├── topBar/
    │   └── overlay/
    ├── scripts/                  ← only for things QML can't do
    └── assets/icons/

XDG runtime paths:
  ~/.local/state/lualand/{state.json, events.jsonl}   (durable)
  /tmp/lualand/{*.log, navio-cache.json}              (ephemeral)
```

> Note on presets: the previous draft suggested
> `data/presets/{routine,quran,study-focus,...}.json`. **Dropped** — user does
> not plan to use a preset library. Block `type` stays a string field on each
> block, but block instances are written directly into `plan.json`, not
> reified from a preset file.

## Service Singletons (the modules to design)

Listed in dependency order. Each gets its own spec section below as we drill
in. Treat as a checklist of design pieces.

1. **Config** — reads single JSON; replaces env-var sprawl.
2. **Time** — `now`, `today`, ticks once per minute.
3. **Persistence** — `FileView` over `state.json`; read/write/migrate.
4. **EventLog** — append-only JSONL.
5. **Plan** — reactive read of `data/plan.json` (the week plan).
6. **Workstations** — reactive read of `data/workstations.json`; current ws;
   numpad map.
7. **Hyprland** — dispatch wrapper over `Quickshell.Hyprland`; decade math;
   `+10000` mirror handling.
8. **Timeblocks** — state machine: `planned → active → {done, skipped, missed}`;
   bleeding/overrun; auto-start chains. IPC surface: `start-day`, `done`,
   `skip(reason, phrase)`, `reset`, `advance`.
9. **PolicyEngine** — pure: active block → `{lockMode, allowedWorkstations,
   startApps, focusApps, awayFromDesk}`.
10. **Navio** — `Timer` (5 min) + `Process` wrapping `navio.sh`; exposes
    `projects`, `tasks`.
11. **Prayer** — stub first; later prayer-time computation or external pull.

UI modules (`modules/sidePanel/*`) consume these via property bindings only.

## Hyprland Keybind Contract

Keybinds defined in `hypr-lua/hyprland.lua` call Quickshell IPC directly. No
Node.js CLIs in the path.

```
SUPER + KP_1..9   → qs ipc call workstations switch <n>
SUPER ALT + ENTER → qs ipc call timeblocks done
SUPER ALT + S     → qs ipc call timeblocks skip   (overlay then prompts phrase)
SUPER ALT + R     → qs ipc call timeblocks reset
SUPER ALT + N     → qs ipc call timeblocks advance
```

This means each service singleton declares an `IpcHandler` for its commands.
Argument parsing lives next to the handler.

## Repo Extraction Decisions (open)

- **Where the standalone repo lives.** Candidates: `~/.config/lualand`
  (dotfiles-style), `~/code/lualand` (sibling to new-hyprland).
- **Hyprland binary coupling.** `lualand-next/scripts/lualand-next.sh`
  hardcodes `/home/marv/code/new-hyprland/build/Hyprland`. Either parameterize
  via Config, or accept the coupling and document it.
- **What to do with `lualand/` legacy directory.** Delete after extraction; it
  was kept frozen as a "wrong-model reference" but adds no ongoing value.

## Module Specs (to fill in as we plan)

Each section below is a placeholder. Pick which to drill into next, draft the
spec inline, iterate.

### Config

_Spec TBD._

Initial fields likely needed:

- `workstationsPath`, `planPath` (data files)
- `stateDir`, `runtimeDir` (XDG paths)
- `sideScreen` (e.g. `HDMI-A-1~2`)
- `mainMonitor`, `auxMonitor`
- `navioRepo` (path to `~/.openclaw/navio` or similar)
- `hyprlandBinary` (if we keep the launcher)

### Time

_Spec TBD._

### Persistence

_Spec TBD._

### EventLog

_Spec TBD._

### Plan

_Spec TBD._

### Workstations

_Spec TBD._

Schema (from `lualand-productivity-system-plan.md`):

- `id`, `name`, `icon`
- `numpad` (1–9 or null)
- `notionProjectId` (later)
- `mainWorkspaces` (10 HDMI workspaces by decade)
- `extWorkspaces` (10 eDP extension workspaces, optional)
- `visible`, `blocked`

### Hyprland

_Spec TBD._

Decade math:

```
mainWorkspace(workstationIndex, relative)  = (workstationIndex - 1) * 10 + relative
mirrorWorkspace(mainWorkspace)             = mainWorkspace + 10000
```

### Timeblocks

_Spec TBD._ This is the design pillar. State machine, schema, IPC, event log
shape all need to be nailed down here before UI work.

### PolicyEngine

_Spec TBD._

### Navio

_Spec TBD._

### Prayer

_Spec TBD._

---

## Open Questions

Carrying forward from `lualand-productivity-system-plan.md` plus new ones from
this rearchitecture pass:

**Storage**

- Where does `data/plan.json` live — tracked in repo, or per-machine in
  `~/.local/share/lualand/`?
- Should `state.json` be a single file or split per concern (timeblocks vs
  workstation runtime vs UI prefs)?

**IPC**

- Quickshell `IpcHandler` for everything, or fall back to writing a command
  file that a `FileView` watches? (IpcHandler is cleaner but binds us to a QS
  version that supports it.)

**Notion / Navio**

- Fixture fallback — keep the `fixtures/navio/` JSON for offline development?
- Where does `navio.sh` live — inside `quickshell/scripts/` or as a top-level
  helper?

**Migration**

- Do we keep `lualand-next/core/timeblocks.js` test cases as a *spec* for the
  Timeblocks singleton's state machine? (~997 lines of tested behavior is
  worth not throwing away even if the runtime moves to QML.)

## Next Step

Pick the first module to drill into. The planning doc says start with
Timeblocks (state machine before UI). I agree — propose drafting
**`Timeblocks.qml` spec** next: schema, exact state transitions, IPC surface,
event log entries, test scenarios.

Alternative starting points if Timeblocks feels too big:

- `Config` + repo extraction — unblocks file paths for everything else.
- `Workstations` + `Hyprland` decade math — small, concrete, immediately
  testable.
