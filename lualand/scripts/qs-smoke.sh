#!/usr/bin/env bash
set -u

ROOT="/home/marv/code/new-hyprland"
CONFIG="$ROOT/lualand/quickshell"
LOG="/tmp/lualand-qs-smoke.log"
QMLFORMAT_OUT="/tmp/lualand-qmlformat.out"
QML_OUT="/tmp/lualand-qml.out"
STATUS=0

: > "$LOG"
exec > >(tee -a "$LOG") 2>&1

echo "lualand quickshell smoke"
echo "root: $ROOT"
echo "config: $CONFIG"
echo "log: $LOG"
echo

if ! command -v qmlformat >/dev/null 2>&1; then
  echo "SKIP qmlformat: command not found"
else
  echo "qmlformat syntax pass"
  while IFS= read -r -d '' file; do
    echo "  $ qmlformat -n $file > $QMLFORMAT_OUT"
    if qmlformat -n "$file" > "$QMLFORMAT_OUT"; then
      echo "  OK $file"
    else
      echo "  FAIL $file"
      STATUS=1
    fi
  done < <(find "$CONFIG" -name '*.qml' -print0 | sort -z)
fi

echo
if ! command -v qml >/dev/null 2>&1; then
  echo "SKIP qml: command not found"
else
  echo "$ timeout 4 qml -I $CONFIG $CONFIG/shell.qml"
  timeout 4 qml -I "$CONFIG" "$CONFIG/shell.qml" 2>&1 | tee "$QML_OUT"
  rc=${PIPESTATUS[0]}
  if [ "$rc" -eq 0 ]; then
    echo "OK qml exited cleanly"
  elif [ "$rc" -eq 124 ]; then
    echo "OK qml started and was stopped by timeout"
  elif [ "$rc" -eq 2 ] && grep -q "Did not load any objects" "$QML_OUT"; then
    echo "INFO qml did not instantiate the Quickshell root here; qs validation remains authoritative"
  else
    echo "FAIL qml exited with $rc"
    STATUS=1
  fi
fi

echo
if ! command -v qs >/dev/null 2>&1; then
  echo "SKIP qs: command not found"
else
  echo "$ timeout 5 qs -p $CONFIG --no-duplicate --log-times -v"
  timeout 5 qs -p "$CONFIG" --no-duplicate --log-times -v
  rc=$?
  if [ "$rc" -eq 0 ]; then
    echo "OK qs exited cleanly"
  elif [ "$rc" -eq 124 ]; then
    echo "OK qs started and was stopped by timeout"
  else
    echo "FAIL qs exited with $rc"
    STATUS=1
  fi
fi

echo
echo "smoke status: $STATUS"
exit "$STATUS"
