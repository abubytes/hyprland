# Lualand Hyprland Adapter Checklist

## Tasks

- [x] Add a pure CommonJS Hyprland adapter under `lualand/core`.
- [x] Convert calculated policies into inspectable dry-run command objects.
- [x] Emit escaped shell strings for executable Hyprland commands.
- [x] Plan `focusmonitor`, `workspace`, `keyword workspace`, and `moveworkspacetomonitor` commands.
- [x] Keep start-app and focus-app requests as non-executing placeholders.
- [x] Keep away-from-desk policy as a no-execute plan.
- [x] Add Node built-in `node:test` coverage.

## Source-Backed Command Choices

- `hyprctl dispatch <dispatcher> [args]` and `hyprctl keyword <name> <value>` are listed in `hyprctl/src/Strings.hpp:20` and `hyprctl/src/Strings.hpp:28`.
- `src/config/legacy/DispatcherTranslator.cpp:800`, `src/config/legacy/DispatcherTranslator.cpp:814`, and `src/config/legacy/DispatcherTranslator.cpp:821` register the legacy dispatchers used here: `workspace`, `focusmonitor`, and `moveworkspacetomonitor`.
- `moveworkspacetomonitor` expects `workspace monitor`, so the adapter emits `hyprctl dispatch moveworkspacetomonitor <workspace> <monitor>`.
- `handleWorkspaceRules` in `src/config/legacy/ConfigManager.cpp:1668` parses `monitor:` at `src/config/legacy/ConfigManager.cpp:1735`, so the adapter emits `hyprctl keyword workspace <workspace>,monitor:<monitor>`.
- App start and focus are placeholders only in this slice. The adapter records the calculated policy actions but does not spawn apps or match windows.

## Decisions

- The command builder is pure and never calls `hyprctl`.
- The execution helper returns dry-run results unless `execute:true` is passed.
- `node:child_process` is required lazily only inside the explicit execution path.
- Existing workspaces get both a dynamic monitor rule and a move command: the rule declares intended ownership, while the move command is the immediate runtime action.
- Hard workstation lock focuses the first HDMI workspace for the locked workstation after planning the workspace monitor rules and moves.
- Away-from-desk produces one non-executable placeholder because enforcing a no-computer policy should not focus monitors, move workspaces, or start apps.

## Commands And Results

- `node --check lualand/core/hyprland-adapter.js && node --check lualand/tests/hyprland-adapter.test.js`
  - Result: exited `0`.
- `node --test lualand/tests/hyprland-adapter.test.js`
  - Result: `2` tests passed, `0` failed.
  - Covered hard workstation lock command planning and away-from-desk no-execute planning.
- `node --test lualand/tests/*.test.js`
  - Result after integration patches: `21` tests passed, `0` failed.
