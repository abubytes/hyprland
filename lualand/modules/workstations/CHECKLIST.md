# Lualand Workstations Checklist

## Tasks

- [x] Add pure workstation decade model helpers.
- [x] Generate 10 HDMI workspaces per workstation.
- [x] Support optional 10 eDP extension or mirror workspaces.
- [x] Build numpad mapping from local config data.
- [x] Filter visible, hidden, and blocked workstations.
- [x] Look up the current workstation from an active workspace id.
- [x] Add pure timeblock policy calculation.
- [x] Calculate hard workstation lock policy.
- [x] Calculate away-from-desk policy.
- [x] Normalize start app and focus app actions without executing them.
- [x] Expand allowed and blocked workstations into workspace ids.
- [x] Cover the core with Node built-in `node:test`.

## Decisions

- The implementation is CommonJS so it can run directly with `node --test`
  without a package file or dependency setup.
- HDMI decade workspace ids use `(slot - 1) * 10 + 1` through
  `(slot - 1) * 10 + 10`.
- eDP workspace ids default to HDMI decade ids plus an offset of `100`, giving
  workstation slot 3 the eDP ids `121` through `130`.
- eDP records are tagged with `role: "extension"` or `role: "mirror"` while
  remaining distinct workspace ids for lookup and policy calculation.
- Numpad bindings are local data, not hardcoded workstation choices. The helper
  only normalizes common numpad key names to keys `1` through `9`.
- Hidden and blocked workstations are excluded from visible lists by default.
  Blocked workstations can still be included explicitly with `includeBlocked`.
- Policy calculation is pure data expansion. It does not call `hyprctl`, spawn
  apps, focus windows, or touch Quickshell/QML.

## Challenges Met

- The repo did not already contain a `lualand/` implementation tree, so the
  module paths were created inside the requested scope.
- The workstation model needed to support visible rail filtering while still
  allowing hidden or blocked workstations to be resolved by workspace id.
- Away-from-desk policy needed a deterministic no-computer result, so it blocks
  every known workstation/workspace and clears allowed workstations/workspaces.
- Hard workstation lock needed to expand one workstation id into both HDMI and
  optional eDP workspaces so an adapter can enforce it later.

## Test Commands And Results

- `node --test lualand/tests/workstations-policy.test.js`
- Result after nested lock shorthand patch: `7` tests passed, `0` failed.
