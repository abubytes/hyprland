#!/usr/bin/env bash
set -euo pipefail

root="/home/marv/code/new-hyprland/lualand-next"
runtime_dir="${LUALAND_NEXT_RUNTIME_DIR:-/tmp/lualand-next}"
state_dir="${LUALAND_NEXT_STATE_DIR:-$HOME/.local/state/lualand-next/timeblocks}"
log="$runtime_dir/autostart.log"

mkdir -p "$runtime_dir" "$state_dir"

{
  printf 'autostart_time=%s\n' "$(date --iso-8601=seconds)"
  printf 'root=%s\n' "$root"
  printf 'runtime_dir=%s\n' "$runtime_dir"
  printf 'state_dir=%s\n' "$state_dir"
} >>"$log"

start_locked() {
  local name="$1"
  shift
  (
    flock -n 9 || exit 0
    "$@"
  ) 9>"$runtime_dir/$name.lock" &
}

start_locked navio-cache \
  node "$root/daemons/navio-cache.js" watch \
    --cache-path "$runtime_dir/navio-cache.json" \
    --error-path "$runtime_dir/navio-cache.error.json" \
    --interval-ms 300000 >>"$runtime_dir/navio-cache.log" 2>&1

start_locked export-loop \
  env LUALAND_NEXT_RUNTIME_DIR="$runtime_dir" \
      LUALAND_NEXT_STATE_DIR="$state_dir" \
      "$root/scripts/export-loop.sh" >>"$runtime_dir/export-loop.wrapper.log" 2>&1

sleep 1

env LUALAND_NEXT_QS_STATE="$runtime_dir/view-state.json" \
    LUALAND_NEXT_RUNTIME_DIR="$runtime_dir" \
    LUALAND_NEXT_STATE_DIR="$state_dir" \
    LUALAND_NEXT_WORKSTATIONS="${LUALAND_NEXT_WORKSTATIONS:-$root/state/sample-workstations.json}" \
    LUALAND_NEXT_TASKS="${LUALAND_NEXT_TASKS:-$runtime_dir/navio-cache.json}" \
    LUALAND_NEXT_SIDE_SCREEN="${LUALAND_NEXT_SIDE_SCREEN:-HDMI-A-1~2}" \
    qs -p "$root/quickshell" --no-duplicate --log-times -v >>"$runtime_dir/qs.log" 2>&1 &

(
  flock -n 9 || exit 0
  sleep 3
  if hyprctl -j clients 2>/dev/null | rg -qi 'notion'; then
    exit 0
  fi
  node "$root/bin/hyprland.js" spawn --live --execute --command notion-app --role work_main --workspace 301 \
    >>"$runtime_dir/notion-spawn.log" 2>&1 || true
) 9>"$runtime_dir/notion-spawn.lock" &
