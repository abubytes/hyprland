#!/usr/bin/env bash
set -euo pipefail

root="/home/marv/code/new-hyprland/lualand-next"
runtime_dir="${LUALAND_NEXT_RUNTIME_DIR:-/tmp/lualand-next}"
state_dir="${LUALAND_NEXT_STATE_DIR:-$HOME/.local/state/lualand-next/timeblocks}"
view_state="${LUALAND_NEXT_QS_STATE:-$runtime_dir/view-state.json}"
workstations="${LUALAND_NEXT_WORKSTATIONS:-$root/state/sample-workstations.json}"
tasks="${LUALAND_NEXT_TASKS:-$runtime_dir/navio-cache.json}"
fixture_tasks="$runtime_dir/navio-fixture-cache.json"
log="$runtime_dir/timeblock-action.log"
action="${1:-}"
now="$(date --iso-8601=seconds)"

mkdir -p "$runtime_dir" "$state_dir"

if [[ ! -f "$state_dir/state.json" ]]; then
  LUALAND_NEXT_STATE_DIR="$state_dir" node "$root/bin/lualand-next.js" init-sample >>"$log" 2>&1 || true
fi

case "$action" in
  start-day)
    LUALAND_NEXT_STATE_DIR="$state_dir" node "$root/bin/lualand-next.js" start-day --now "$now" >>"$log" 2>&1
    ;;
  play)
    LUALAND_NEXT_STATE_DIR="$state_dir" node "$root/bin/lualand-next.js" play --now "$now" >>"$log" 2>&1
    ;;
  done)
    LUALAND_NEXT_STATE_DIR="$state_dir" node "$root/bin/lualand-next.js" done --now "$now" >>"$log" 2>&1
    ;;
  skip)
    LUALAND_NEXT_STATE_DIR="$state_dir" node "$root/bin/lualand-next.js" skip --now "$now" >>"$log" 2>&1
    ;;
  *)
    printf 'unknown action: %s\n' "$action" >>"$log"
    exit 2
    ;;
esac

if [[ ! -f "$tasks" ]]; then
  node "$root/daemons/navio-cache.js" fixtures \
    --fixtures-dir "$root/fixtures/navio" \
    --cache-path "$fixture_tasks" >/dev/null
  tasks="$fixture_tasks"
fi

LUALAND_NEXT_STATE_DIR="$state_dir" node "$root/bin/lualand-next.js" export-view \
  --now "$now" \
  --workstations "$workstations" \
  --tasks "$tasks" \
  --out "$view_state" >>"$log" 2>&1
