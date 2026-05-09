#!/usr/bin/env bash
set -euo pipefail

hypr_root="/home/marv/code/new-hyprland"
config="/home/marv/.config/hypr-lua/hyprland.lua"
start_hyprland="/usr/bin/start-hyprland"
hyprland_bin="$hypr_root/build/Hyprland"
log_dir="/tmp/hypr-lua-tty"
log="$log_dir/hyprland.log"
env_log="$log_dir/env.log"

mkdir -p "$log_dir"
cd "$HOME"

if [[ ! -x "$hyprland_bin" ]]; then
  echo "Missing executable: $hyprland_bin" >&2
  exit 1
fi

if [[ ! -x "$start_hyprland" ]]; then
  echo "Missing executable: $start_hyprland" >&2
  exit 1
fi

if [[ ! -f "$config" ]]; then
  echo "Missing Lua config: $config" >&2
  exit 1
fi

export LD_LIBRARY_PATH="$hypr_root/.hyprdeps/lib:${LD_LIBRARY_PATH:-}"

# TTY launches should not inherit an existing/nested compositor identity.
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

ulimit -c unlimited || true

{
  printf 'launch_time=%s\n' "$(date --iso-8601=seconds)"
  printf 'tty=%s\n' "$(tty || true)"
  printf 'cwd=%s\n' "$PWD"
  printf 'wrapper=%s\n' "$start_hyprland"
  printf 'binary=%s\n' "$hyprland_bin"
  printf 'config=%s\n' "$config"
  printf 'log=%s\n' "$log"
  printf 'ld_library_path=%s\n' "$LD_LIBRARY_PATH"
} >"$log"

env | sort >"$env_log"

exec "$start_hyprland" --path "$hyprland_bin" -- -c "$config" >>"$log" 2>&1
