#!/usr/bin/env bash
set -euo pipefail

ROOT="/home/marv/code/new-hyprland"
STATE_DIR="${LUALAND_GENERATED_STATE_DIR:-/tmp/lualand-generated-smoke}"
VIEW_FILE="$STATE_DIR/view.json"

rm -rf "$STATE_DIR"
mkdir -p "$STATE_DIR"

LUALAND_STATE_DIR="$STATE_DIR" "$ROOT/lualand/bin/lualand-timeblocks.js" init-sample
LUALAND_STATE_DIR="$STATE_DIR" "$ROOT/lualand/bin/lualand-timeblocks.js" start morning --now 2026-05-07T07:00:00Z
LUALAND_STATE_DIR="$STATE_DIR" "$ROOT/lualand/bin/lualand-timeblocks.js" export-view \
  --now 2026-05-07T07:10:00Z \
  --time-zone UTC \
  --out "$VIEW_FILE"

LUALAND_QS_STATE="$VIEW_FILE" "$ROOT/lualand/scripts/qs-smoke.sh"
