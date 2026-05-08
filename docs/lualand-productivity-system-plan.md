# Lualand Productivity System Plan

This document captures the current planning state for the new Hyprland Lua +
Quickshell productivity setup. It is intentionally detailed. The goal is to
preserve the whole shape of the system before implementation starts, including
open questions and decisions that are not final yet.

## Status

- This is a planning document, not an implementation document.
- The current focus is the future Lualand/Quickshell setup, not the upstream
  Hyprland codebase itself.
- The most important module to design first is the timeblock system.
- The second major pillar is the workstation model.
- The third major pillar is the persistent right-side segment on the split HDMI
  monitor.
- Implementation should not start from the dashboard. It should start from the
  data model, rules, and tested state transitions.
- Some older personal notes under `~/cog` are useful context, but the user has
  explicitly said that many of them are outdated and no longer believed. Anything
  from those notes must be treated as historical context unless reconfirmed.

## High-Level Goal

The system is not just a bar, a timer, or a window manager config. It is a
local productivity environment built around:

- planned timeblocks,
- workstation-scoped projects,
- app/workspace forcing during certain blocks,
- strict but flexible locks,
- local-first state,
- later Notion integration,
- later Anki/study dashboards,
- a persistent right-side information segment,
- and a workflow that can evolve during implementation.

The design must allow the user to plan a week ahead, start the day with a
structured routine, move through planned blocks, enforce certain flows when
needed, and record what actually happened.

## Physical And Logical Monitor Model

The intended physical setup has two physical monitors:

- `eDP`: laptop screen, 1080p, positioned on the left.
- `HDMI`: external monitor, currently 1080p for testing, intended to become a
  2K monitor later, positioned on the right.

The intended logical setup has three working regions:

- eDP full monitor.
- HDMI left/main region, using roughly 3/4 of the external monitor.
- HDMI right/side segment, using roughly 1/4 of the external monitor.

The HDMI split is core to the setup:

- The HDMI main 3/4 area is the primary serious work surface.
- The HDMI right 1/4 area is the always-present productivity/status/auxiliary
  strip.
- The eDP monitor is mostly left-side support, slacking, or extension space.

## eDP Role

The eDP laptop monitor is planned as:

- the left monitor,
- often the slacking or support area,
- sometimes an extension surface for the active HDMI workstation,
- a place where emulator/browser/result windows may live for a project,
- not the primary serious coding surface in the usual workflow.

The exact eDP behavior still needs design:

- It may host "slacking" as its own workstation.
- It may host mirror/extension workspaces for HDMI workstations.
- It may be independent by default and only enter extension mode explicitly.
- It may show 10 eDP extension workspaces for a project whose main 10
  workspaces live on HDMI.

## HDMI Main Region Role

The HDMI main 3/4 region is planned as:

- the focused project/work monitor,
- the home of the main 10 workspaces for the current workstation,
- the serious coding/client/study surface,
- the region where the active project workstation usually lives.

Typical use:

- A project/client workstation is selected.
- That workstation owns 10 main HDMI workspaces.
- Code, browsers, terminals, editors, docs, and project windows are distributed
  across those 10 workspaces.
- The user switches between workspaces and workstations by keyboard and GUI.

## HDMI Right Segment Role

The right 1/4 split of the HDMI monitor is the always-present segment. It should
be designed as a dense cockpit, not a decorative sidebar.

Planned content:

- current timeblock,
- upcoming timeblocks,
- vertical scrollable timeline,
- task list for today/current workstation,
- workstation icon rail,
- prayer time / religious timing,
- timeblock debt or overrun,
- notifications,
- auxiliary window slots,
- Telegram/OpenClaw/AI assistant slot,
- later study dashboard elements,
- later speedrun/task timing elements.

The right segment should be small-font, high-density, and scannable. The user
described the task panel as similar to a speedrun interface eventually.

## Workstation Model

A workstation is a workspace group confined to one project or major life area.

Core workstation idea:

- Each workstation is tied to a project or context.
- Each workstation usually has 10 main HDMI workspaces.
- Each workstation may also have 10 eDP extension workspaces.
- Workstations are switched by numpad keys, GUI, and possibly other shortcuts.
- Workstations should be derived from an easily editable JSON file or similar
  local config.
- Workstations can be assigned, hidden, blocked, or visible depending on daily
  planning and timeblock policy.

Typical workstation:

- Project entity in Notion.
- Local workstation config entry.
- Icon.
- Name.
- Numeric mapping.
- 10 HDMI workspaces.
- Optional 10 eDP extension workspaces.
- List of tasks, eventually derived from Notion.
- Visible/hidden state for the day.

## Workstation Workspace Layout

The intended default workstation structure:

- 10 main workspaces on HDMI.
- 10 extended workspaces on eDP.

Example:

- Workstation A owns HDMI workspaces `A1` through `A10`.
- Workstation A may also own eDP extension workspaces `A1-ext` through
  `A10-ext`.
- The eDP extension may hold emulator, browser preview, docs, or results.

The old system used a decade model:

- workstation 1 owns workspaces 1-10,
- workstation 2 owns workspaces 11-20,
- workstation 3 owns workspaces 21-30,
- and so on.

This model is still considered a good base because it gives every workstation a
predictable block of 10 spaces.

## Workstation Switching

Switching must work through both keyboard and GUI.

Keyboard:

- The 9 numpad keys are assigned to 9 different workstations.
- The mapping should come from local JSON or another easily editable local file.
- This mapping should not be hardcoded deeply in QML or Lua.

GUI:

- The right segment should show a long workstation icon rail.
- Each workstation gets an icon.
- The user can click an icon to switch workstations.
- Hidden or blocked workstations may not appear.
- Workstations not assigned for the day may be hidden or de-emphasized.

Open design point:

- Whether hidden workstations disappear entirely or remain visible but disabled.

## Workstation Visibility

Workstations can be hidden or blocked.

Reasons a workstation might be hidden:

- project is blocked,
- project is not assigned for this day,
- no tasks are planned for it today,
- current timeblock policy excludes it,
- user manually hides it from the day's rail.

Reasons a workstation might stay visible:

- it has an active task,
- it is mapped to a numpad key,
- it is part of today's timeblock plan,
- it is urgent,
- it is the current workstation,
- it is part of the right-side auxiliary flow.

This needs a visibility policy, but the first implementation can start simple.

## Project And Notion Relationship

Each project workstation is intended to correspond to a project entity in the
user's Notion database.

Eventually:

- project comes from Notion,
- tasks come from Notion,
- tasks have planned dates,
- today's tasks are displayed in the right segment,
- tasks can be grouped by workstation/project,
- task timing can be measured later,
- task progress can feed back into Notion later.

Important implementation constraint:

- Start local-first.
- Do not make Notion the first blocking dependency.
- Notion sync should come after the local model is stable.

## Task Sidecar

The task sidecar is a module in the right segment.

End goal:

- derive tasks from Notion,
- display tasks for today,
- associate tasks with workstations,
- allow starting a task,
- track how much time the task takes,
- feel like a gamified speedrun interface.

First version:

- simple task list,
- no interaction,
- tasks displayed in a small, dense list,
- only a limited number of tasks shown,
- sorted by status.

Sorting:

- in progress tasks at the top,
- then undone tasks,
- then done tasks.

Later:

- "Start" action for a task,
- elapsed timer,
- task time measurement,
- speedrun-style feedback,
- integration with timeblocks,
- integration with ActivityWatch or local event logs,
- eventual Notion writeback.

## Timeblock System

The timeblock system is the core of the entire plan.

The user explicitly clarified that timeblocks are not just a Pomodoro timer.
They are complex, programmable blocks with properties.

The system must support:

- weekly planning,
- local-first block storage,
- broad blocks,
- precise blocks,
- blocks with app flow,
- blocks with workstation locks,
- blocks that require manual completion,
- blocks that auto-complete,
- blocks that bleed into overrun/debt,
- blocks that auto-start related blocks,
- blocks that can be skipped,
- blocks that can be reset,
- blocks that can be edited as the day unfolds,
- away-from-desk blocks,
- rest blocks,
- study blocks,
- morning routine blocks,
- Quran blocks,
- work blocks,
- project-specific feature blocks.

The timeblock system is an entire separate design area and must be thought
through deeply before final implementation decisions.

## Weekly Planning

The user wants to be able to plan timeblocks for the entire week.

This weekly plan is a guideline, not a prison.

Important properties:

- The week can be planned ahead.
- Some blocks are general.
- Some blocks are specific.
- Blocks can be edited later.
- Blocks can be skipped or reset.
- The live day can diverge from the plan.
- Actual outcomes should be recorded.

Examples of broad blocks:

- `Study`
- `Work`
- `Morning routine`
- `Rest`

Examples of specific blocks:

- `Work on feature X in workstation A for 45 minutes`
- `Study Anki for 50 minutes`
- `Quran reading in Zathura for 25 minutes`
- `Morning habits in Notion for 20 minutes`

## Timeblock Precision Levels

Blocks need to support different levels of detail.

Broad block:

- title: `Study`
- duration: 2 hours
- lock: study workstation
- details may be filled later.

Specific block:

- title: `Work on feature X`
- workstation: project A
- duration: X minutes
- task: feature X
- lock: workstation A
- maybe start a repo/editor/browser.

Routine block:

- title: `Morning routine`
- duration: 20 minutes
- no computer apps except maybe Notion,
- requires manual completion,
- may bleed if user is slow.

Away-from-desk block:

- title: `Rest`
- duration: 10 minutes,
- no computer interaction,
- may show countdown only,
- may or may not auto-complete.

## Timeblock Completion Semantics

The completion rules are now clarified.

Skipping:

- If a block is skipped, it is not marked done.
- Skipping frees the user.
- Skipping does not autostart the next block.
- Skipping requires a reason.
- Skipping requires writing a deliberate, lengthy accountability phrase that
  says the user is skipping because they are in need to skip.

Done:

- A block can be marked done automatically or manually.
- If a block is configured to auto-complete, it is marked done when its planned
  time runs out.
- If a block is not configured to auto-complete, it is marked done only when the
  user presses `Done`.

Reset:

- A reset action should exist.
- Exact reset behavior needs implementation design.
- Likely behavior: clear the active run state and put the block back into a
  planned/not-started state.

Early finish:

- The user previously wanted the ability to finish a timeblock earlier.
- If finished early, the system should store when the user stopped it.
- The system should allow notes or a reason.
- Exact scoring or debt behavior for early finish is not decided yet.

## Auto-Complete Blocks

Some blocks finish when their timer ends.

Example:

- A simple work sprint may auto-complete after its duration.
- A simple rest timer may auto-complete after its duration.

When auto-complete happens:

- block is marked done,
- planned end time is reached,
- actual completion is recorded,
- next relation may run if configured.

Open question:

- Whether auto-completed blocks should always autostart the next block or only
  do so if an explicit relation exists.

Current assumption:

- Only explicit auto-start relations should start the next block.

## Manual-Done Blocks

Some blocks do not finish just because time runs out.

They require the user to press `Done`.

Examples:

- morning routine,
- Quran reading,
- any block where completion matters more than timer expiry,
- blocks that should bleed into debt if slow.

For these blocks:

- timer reaching zero does not end the block,
- the block continues active,
- overrun is recorded as bleeding/debt,
- the user stays in that block until pressing `Done`, skipping, or resetting.

## Bleeding And Debt

Bleeding means a block continues beyond its planned duration.

Current decision:

- Bleeding/debt is just recorded for now.

It should not initially:

- shorten later rest,
- force automatic punishment,
- block the day,
- rewrite the schedule automatically.

It should initially:

- record planned duration,
- record actual duration,
- record overrun,
- show that overrun in the UI,
- preserve it for later review.

Later possible behavior:

- debt can affect rest,
- debt can delay future blocks,
- debt can become part of daily scoring,
- debt can become part of slacking accountability,
- debt can be used in reports.

## Auto-Start Relations

Blocks can be related so that one starts after another.

Examples:

- Study focus block followed by rest block.
- Morning routine followed by Quran block.
- Quran block followed by study block.
- 50 minute focus followed by 10 minute rest.

Important clarified rule:

- If a block is skipped, the next block should not autostart.

For non-skipped blocks:

- auto-start may happen if the block has an explicit relation.
- some chains should move from block to block automatically.
- some blocks should stop and wait for user action.

Examples:

- `study #1 focus 50m` may autostart `study #1 rest 10m`.
- `morning routine` may start `Quran reading` after user presses Done.
- `Quran reading` may start `study block` after user presses Done.

## Morning Routine Scenario

The user described a concrete start-of-day flow.

Flow:

1. User starts the day.
2. User presses `Woke up`.
3. The system records wake-up time.
4. The system starts a 20 minute morning routine block.
5. During this block, no apps appear except Notion.
6. The user signs habits and morning state into Notion.
7. If 20 minutes pass and the user is not done, the block does not end.
8. The block bleeds into overrun/debt.
9. The user eventually presses `Done`.
10. The system starts the Quran block.

Morning routine details:

- off-screen tasks,
- get room ready,
- brush teeth,
- clean some stuff,
- read morning azkar,
- sign habits in Notion,
- possibly use Notion as the only visible app.

This block should probably be manual-done, not auto-complete.

## Quran Block Scenario

The Quran block is another concrete example.

Flow:

1. Morning routine is completed.
2. System opens or focuses Zathura with a Quran PDF.
3. It opens where the user last stopped if possible.
4. The user reads Quran for about 25 minutes.
5. The intended target may be around 20 pages.
6. The block does not necessarily finish automatically.
7. If time runs out and the user is not done, it bleeds into debt.
8. User presses `Done` when finished.
9. System can move into study blocks afterward.

This block should support:

- start app: Zathura,
- document path,
- last-location tracking if feasible,
- manual completion,
- bleeding,
- notes later if needed.

## Study Block Scenario

Study blocks have special treatment.

Expected behavior:

- lock the user into the `Studying` workstation,
- first workspace has Anki open,
- study dashboard appears later,
- likely uses 50/10 Pomodoro-like structure,
- but should be represented as timeblocks, not a standalone Pomodoro timer.

Possible study chain:

- 50 minute focus block,
- forced 10 minute rest block,
- repeat as planned.

Important flexibility:

- Some focus blocks may allow bleeding.
- Some rest blocks may allow no computer interaction.
- Some rest blocks may be scheduled breaks.
- Some study sessions may be planned ahead for the week.

The study dashboard will be planned later. It should not block the first
timeblock engine implementation.

## Rest Block Scenario

Rest blocks are first-class blocks, not just "unlock the computer".

Rest can mean:

- no computer interaction,
- walk away from desk,
- free mind,
- maybe countdown only,
- maybe lock input or hide windows later,
- maybe no auto-unlock depending on block policy.

Example:

- 50 minute study focus with allowed bleeding,
- then only 10 minutes of rest,
- rest may require the user to actually leave the computer.

Rest behavior must be flexible because different rest blocks may have different
requirements.

## Work Block Scenario

Work blocks can be broad or specific.

Broad:

- `Work`
- duration set,
- maybe current chosen workstation,
- maybe no explicit task.

Specific:

- `Work on feature X in workstation A`
- allocated X minutes,
- attached to project/workstation A,
- maybe attached to a Notion task,
- hard lock to workstation A,
- maybe later start a task timer.

Work blocks should support:

- workstation lock,
- task association,
- app launching/focusing if needed,
- actual time measurement,
- notes,
- early completion,
- skip with reason.

## App Flow And Forced Apps

The system should support forcing specific flows of apps per timeblock.

This belongs to the nature of timeblocks, not to a separate fixed morning-only
script.

Examples:

- Morning routine opens or focuses Notion only.
- Quran block opens or focuses Zathura Quran PDF.
- Study block opens/focuses Anki in the first study workspace.
- Work block may open/focus the proper editor/browser/project workspace.

Current prioritization:

- Morning blocks will mainly need app flow first.
- Most other blocks may be manually started by the user for now.

Implementation implication:

- Timeblocks need declarative app actions.
- The policy engine should calculate app actions.
- The Hyprland adapter or shell script layer should execute them.
- The core timeblock engine should not directly execute window manager commands.

## Locking And Enforcement

Current chosen initial enforcement target:

- hard lock to workstation.

This means:

- during a block, the user may be confined to a workstation,
- leaving the allowed workstation should be prevented or corrected,
- the lock policy comes from the active timeblock.

Potential future enforcement levels:

- display-only,
- nudge-only,
- focus/switch workspace,
- hard lock to workstation,
- allowed app list,
- blocked app list,
- no-computer/off-screen mode,
- password/friction override.

But for first implementation:

- focus on hard lock to workstation.

## Skip And Override Accountability

Skipping is allowed but should require friction.

Decision:

- Skip requires a reason.
- Skip also requires writing a lengthy phrase for self-accountability.
- The phrase should make the user explicitly acknowledge that they are skipping
  because they are in need to skip.

Effects:

- block is not done,
- user is freed,
- next block does not autostart,
- skip event is recorded.

Open design:

- exact phrase text,
- whether the phrase must match exactly,
- whether phrase varies by block,
- whether skip reason is free text,
- whether a later review surface shows skipped blocks.

## Local-First Hybrid Storage

Decision:

- hybrid model,
- local first.

This means:

- the first source of truth should be local,
- Notion is not required for the first version,
- runtime state should be debuggable on disk,
- sync can be added later.

Likely local files:

- planned blocks file,
- runtime state file,
- append-only event log,
- workstation config file,
- task cache file later.

Possible storage formats:

- JSON for easiest initial editing,
- SQLite later if queries and history become complex.

Recommendation for first version:

- JSON for planned config,
- JSON for current runtime state,
- JSONL for event log.

## Event Log

The system should record actual behavior, not just current state.

Useful events:

- woke up,
- block planned,
- block edited,
- block started,
- block autocompleted,
- block manually completed,
- block skipped,
- block reset,
- block overran,
- block note added,
- workstation lock applied,
- workstation lock released,
- app action requested,
- app action failed.

Why:

- debugging,
- replay,
- later metrics,
- later Notion sync,
- later productivity reports,
- audit of skipped blocks and debt.

## Timeblock UI

The initial UI should be simple and vertical.

The user described:

- a bunch of blocks stacked on top of each other,
- like a scrollable timeline,
- vertical scrollable thing,
- displayed in the right segment.

Initial UI should show:

- current block,
- upcoming blocks,
- previous done/skipped blocks,
- active state,
- remaining time,
- overrun/bleeding if active past duration,
- Done action,
- Skip action,
- Reset action,
- reason/phrase prompt for Skip,
- maybe compact notes later.

The UI should not start as a huge dashboard. It should start as a clear
timeline controller.

## Timeblock Data Model Draft

This is not final schema, but captures the needed fields.

Core identity:

- `id`
- `title`
- `type`
- `preset`
- `date`

Planning:

- `plannedStart`
- `plannedDurationMinutes`
- `plannedEnd`
- `weekPlanId`
- `sortOrder`

Runtime:

- `status`: `planned`, `active`, `done`, `skipped`, `missed`, `reset`
- `actualStart`
- `actualEnd`
- `actualDurationMinutes`
- `overrunMinutes`

Completion:

- `autoComplete`
- `requiresDone`
- `canBleed`
- `doneAt`
- `doneMethod`: `auto`, `manual`

Relations:

- `autoStartNextBlockId`
- `dependsOnBlockId`
- `chainId`

Policy:

- `lockMode`
- `allowedWorkstations`
- `blockedWorkstations`
- `allowedWorkspaces`
- `blockedWorkspaces`
- `allowedApps`
- `blockedApps`
- `awayFromDesk`

Apps:

- `startApps`
- `focusApps`
- `workspaceActions`

Accountability:

- `skipReason`
- `skipPhrase`
- `notes`
- `earlyFinishReason`

Integration:

- `workstationId`
- `taskIds`
- `notionProjectId`
- `notionTaskIds`
- `ankiDecks`

## Generic Blocks With Presets

The preferred model is:

- one generic block object,
- plus a `type` or `preset` field.

Examples:

- `routine`
- `quran`
- `study-focus`
- `study-rest`
- `work`
- `task-sprint`
- `rest`
- `offscreen`
- `prayer`
- `slacking`

Why:

- The user wants broad and specific blocks.
- New behavior will be discovered during implementation.
- Hardcoding every block as a separate special class would become rigid.
- A generic object with policy presets gives flexibility.

## Policy Engine

The policy engine answers:

- What should the active block allow?
- What should it block?
- What apps should be started?
- What workstation should be focused?
- What lock should be applied?
- Is skip allowed?
- Does skip require phrase?
- Can this block bleed?
- Should next block autostart?
- Is this an away-from-desk block?

Inputs:

- active block,
- current time,
- workstation config,
- current runtime state,
- maybe current monitor/workspace state later.

Outputs:

- lock policy,
- app actions,
- UI state,
- next allowed actions,
- warnings,
- state transition effects.

Important boundary:

- The policy engine should calculate.
- The adapter should execute.

## Hyprland Adapter

The Hyprland adapter should be thin.

Responsibilities:

- switch workspace,
- switch workstation,
- lock to workstation,
- unlock workstation,
- spawn app,
- focus app if possible,
- move window if needed later,
- query monitors/workspaces if needed.

It should not own:

- block state,
- Notion sync,
- Anki math,
- task state,
- productivity scoring.

## Quickshell Role

Quickshell should primarily:

- display the right segment,
- show timeline,
- show workstation rail,
- show tasks,
- show current block state,
- expose Done/Skip/Reset actions,
- send commands to the local timeblock service/CLI,
- read local state or subscribe to updates.

Quickshell should not become the heavy side-effect owner.

Avoid putting directly into QML:

- Notion sync logic,
- ActivityWatch aggregation,
- complex Anki calculations,
- long-running productivity state,
- direct database ownership,
- complicated lock state.

## CLI / Local Service

The first implementation can expose a CLI before full UI.

Example commands:

- `timeblocks status`
- `timeblocks start <id>`
- `timeblocks done`
- `timeblocks skip`
- `timeblocks reset`
- `timeblocks plan list`
- `timeblocks event-log`

The CLI is valuable because:

- it can be tested outside Quickshell,
- it makes behavior debuggable,
- it lets Hyprland binds call simple commands,
- it lets Quickshell stay thinner.

Later this could become:

- a daemon,
- an IPC server,
- a DBus service,
- or a local HTTP/socket service.

## Testing Plan

TDD is realistic and useful here.

The first tests should target pure timeblock logic.

Test groups:

- starting a block,
- manual Done,
- auto-complete,
- skip behavior,
- skip does not autostart next,
- skip records reason and phrase,
- reset behavior,
- bleeding behavior,
- overrun calculation,
- auto-start chain,
- current/next block calculation,
- policy calculation,
- hard-lock policy for workstation,
- away-from-desk policy,
- app action calculation,
- event log entries.

Example scenario test:

1. Morning routine starts after `Woke up`.
2. It runs for 20 minutes.
3. It does not auto-complete.
4. It bleeds for 7 minutes.
5. User presses Done.
6. Quran block starts.
7. Quran block opens/focuses Zathura action.
8. Quran block bleeds if not Done.
9. User presses Done.
10. Study focus starts.
11. Study locks to Studying workstation.
12. Study focus auto-completes or chains into rest depending on config.

## First Implementation Slice

The first implementation should be laser-focused.

Recommended order:

1. Define local timeblock schema.
2. Build pure timeblock engine.
3. Add tests for state transitions.
4. Add local JSON store.
5. Add append-only JSONL event log.
6. Add CLI commands.
7. Add policy output for hard workstation lock.
8. Add Hyprland adapter only after policy output works.
9. Add minimal Quickshell right-segment timeline.
10. Add workstation rail after the timeline can drive state.

Do not start with:

- full Notion sync,
- full study dashboard,
- full speedrun tasks,
- complex UI polish,
- heavy QML state.

## Implementation Success Criteria For First Slice

The first slice is successful if it can model and drive this day:

- user presses `Woke up`,
- morning routine block starts,
- Notion can be opened/focused,
- routine block can bleed,
- user presses Done,
- Quran block starts,
- Zathura Quran can be opened/focused,
- Quran block can bleed,
- user presses Done,
- study block starts,
- Studying workstation lock policy becomes active,
- rest block can follow if configured,
- skip frees user and does not autostart next block,
- reset works,
- event log clearly shows what happened.

## Study Dashboard Later

The studying dashboard is important but should be planned later.

Known direction:

- study workstation has special treatment,
- first workspace has Anki open,
- later dashboard will show study tracking,
- likely integrates with AnkiConnect,
- may show progress/rate/targets,
- may connect to planned study blocks.

But this is not first slice.

## Prayer / Religious Timing

Prayer time and religious rhythm belong in the side segment eventually.

Known ideas:

- show prayer time,
- show morning/evening adhkar windows,
- morning routine may include morning azkar,
- prayer/adhkar reminders should respect their real windows.

Open implementation:

- whether prayer times are computed locally,
- whether they come from an existing script,
- whether they are pulled from another source.

## Slacking

Slacking remains part of the system but needs controlled structure.

Known ideas:

- eDP may be the slacking monitor,
- slacking may have its own workstation,
- slacking may be hidden/blocked during certain blocks,
- slacking debt may be recorded later,
- social/slacking behavior can eventually be timeboxed.

Important correction:

- do not overfit to outdated `~/cog` rules unless reconfirmed.
- Current confirmed design point is that timeblocks can enforce app/workstation
  flow when configured.

## Auxiliary Window Region

The HDMI right segment may include or control auxiliary window slots.

Possible occupants:

- Telegram chat with OpenClaw,
- AI assistant,
- notifications,
- small utility windows,
- side information surfaces.

The user mentioned:

- a bunch of workstations or special keys to swap between auxiliary items,
- Telegram chat with OpenClaw,
- other stuff.

This needs later design.

## Current Open Questions

Timeblocks:

- Should auto-completed blocks always autostart their linked next block, or only
  when a relation explicitly says so?
- What exactly does reset do to active, done, skipped, and overrun state?
- Should early completion create positive credit, just record time, or do
  nothing beyond actual end time?
- Should skip phrase be exact-match or any sufficiently long phrase?
- Should skipped blocks appear in the timeline as red/gray/struck out?
- Should a skipped block be reschedulable later that day?

Debt:

- Should debt remain purely historical for the first version?
- Should debt eventually affect rest?
- Should debt eventually affect daily score?
- Should overrun debt and slacking debt be separate concepts?

Workstations:

- Should eDP extension workspaces be active automatically with each HDMI
  workstation, or only by explicit toggle?
- Should hidden workstations disappear from the icon rail or appear disabled?
- Should Notion tasks decide workstation visibility, or should local day plan
  decide it?
- Should numpad mapping only include visible workstations?

Tasks:

- Where should first local task data live before Notion?
- Should tasks be global for the day or scoped to workstation?
- Should in-progress task state be local-only until Notion sync exists?

UI:

- How compact should the right timeline be?
- How many tasks should show at once?
- Should Done/Skip/Reset be visible buttons or keyboard-driven commands?
- Should the right segment have separate tabs or one dense vertical layout?

Adapters:

- Should the timeblock engine be a CLI first or a daemon first?
- Should Quickshell poll state files or subscribe to an IPC stream?
- Should Hyprland binds call CLI commands directly?

## Non-Goals For The First Pass

Do not implement these first:

- full Notion writeback,
- full Anki dashboard,
- fully gamified task speedrun mode,
- final polished Quickshell UI,
- all lock strength levels,
- domain/app blocking,
- complicated scoring,
- historical productivity reports,
- perfect prayer calculation,
- exact auxiliary Telegram/OpenClaw integration.

## Design Principles

- Build data logic first.
- Test state transitions before wiring UI.
- Keep local state debuggable.
- Prefer local-first and later sync.
- Keep QML display-oriented.
- Keep Hyprland Lua and adapters thin.
- Make timeblocks flexible enough that unknown future behaviors do not require a
  rewrite.
- Do not treat outdated notes as binding user intent.
- Do not design this as just Pomodoro.
- Do not make the dashboard before the engine.

## Immediate Next Step

Before implementation, create the first technical spec for the timeblock engine:

- final schema draft,
- exact state machine,
- exact event log format,
- exact CLI commands,
- exact test cases,
- first sample day plan:
  - woke up,
  - morning routine 20m,
  - Quran/Zathura 25m,
  - study focus 50m,
  - rest 10m,
  - next study/work block.

After that, implementation can begin with tests.
