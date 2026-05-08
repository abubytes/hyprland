#!/usr/bin/env bash
set -euo pipefail

root="/home/marv/code/new-hyprland/lualand-next"
runtime_dir="${LUALAND_NEXT_RUNTIME_DIR:-/tmp/lualand-next}"
state_dir="${LUALAND_NEXT_STATE_DIR:-$HOME/.local/state/lualand-next/timeblocks}"
view_state="${LUALAND_NEXT_QS_STATE:-$runtime_dir/view-state.json}"
workstations="${LUALAND_NEXT_WORKSTATIONS:-$root/state/sample-workstations.json}"
tasks="${LUALAND_NEXT_TASKS:-$runtime_dir/navio-cache.json}"
fixture_tasks="$runtime_dir/navio-fixture-cache.json"
interval="${LUALAND_NEXT_EXPORT_INTERVAL:-15}"
log="$runtime_dir/export-loop.log"

mkdir -p "$runtime_dir" "$state_dir"

if [[ ! -f "$state_dir/state.json" ]]; then
  LUALAND_NEXT_STATE_DIR="$state_dir" node "$root/bin/lualand-next.js" init-sample >>"$log" 2>&1 || true
fi

if [[ ! -f "$tasks" ]]; then
  node "$root/daemons/navio-cache.js" fixtures \
    --fixtures-dir "$root/fixtures/navio" \
    --cache-path "$fixture_tasks" >/dev/null
  tasks="$fixture_tasks"
fi

while true; do
  current_tasks="$tasks"
  if [[ ! -f "$current_tasks" && -f "$fixture_tasks" ]]; then
    current_tasks="$fixture_tasks"
  fi

  LUALAND_NEXT_STATE_DIR="$state_dir" node "$root/bin/lualand-next.js" export-view \
    --now "$(date --iso-8601=seconds)" \
    --workstations "$workstations" \
    --tasks "$current_tasks" \
    --out "$view_state" >>"$log" 2>&1 || true

  sleep "$interval"
done
