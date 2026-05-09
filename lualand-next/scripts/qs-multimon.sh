#!/usr/bin/env bash
set -euo pipefail

log_dir="/tmp/qs-multimon"
log="$log_dir/qs.log"
mkdir -p "$log_dir"

# Keep this script non-blocking when Hyprland execs it.
setsid -f qs -c multimon --no-duplicate --log-times -v >>"$log" 2>&1
