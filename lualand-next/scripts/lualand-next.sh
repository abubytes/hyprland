#!/usr/bin/env bash
set -euo pipefail

cd "$HOME"

log_dir="/tmp/lualand-next"
mkdir -p "$log_dir"

timestamp="$(date +%Y%m%dT%H%M%S)"
log_file="$log_dir/hyprland-${timestamp}.log"

hyprland_bin="/home/marv/code/new-hyprland/build/Hyprland"
config_path="${LUALAND_NEXT_CONFIG:-/home/marv/code/new-hyprland/lualand-next/hypr-lua/hyprland.lua}"
start_hyprland="/usr/bin/start-hyprland"

if [[ ! -x "$hyprland_bin" ]]; then
  echo "Missing executable: $hyprland_bin" >&2
  exit 1
fi

if [[ ! -x "$start_hyprland" ]]; then
  echo "Missing executable: $start_hyprland" >&2
  exit 1
fi

if [[ ! -f "$config_path" ]]; then
  echo "Missing Lua config: $config_path" >&2
  exit 1
fi

export LD_LIBRARY_PATH="/home/marv/code/new-hyprland/.hyprdeps/lib:${LD_LIBRARY_PATH:-}"

unset DISPLAY
unset WAYLAND_DISPLAY
unset HYPRLAND_INSTANCE_SIGNATURE
unset HYPRLAND_CMD
unset XDG_CURRENT_DESKTOP

export XDG_CURRENT_DESKTOP=Hyprland
export XDG_SESSION_DESKTOP=Hyprland
export XDG_SESSION_TYPE=wayland
export HYPRLAND_LOG_WLR="${HYPRLAND_LOG_WLR:-1}"
export AQ_TRACE="${AQ_TRACE:-0}"

{
  printf 'launch_time=%s\n' "$(date --iso-8601=seconds)"
  printf 'cwd=%s\n' "$PWD"
  printf 'binary=%s\n' "$hyprland_bin"
  printf 'config=%s\n' "$config_path"
  printf 'log=%s\n' "$log_file"
  printf 'ld_library_path=%s\n' "$LD_LIBRARY_PATH"
} >"$log_dir/launcher-env-${timestamp}.log"

exec "$start_hyprland" --path "$hyprland_bin" -- -c "$config_path" >"$log_file" 2>&1
