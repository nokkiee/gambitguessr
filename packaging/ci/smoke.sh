#!/usr/bin/env bash
# Starts GambitGuessr as an ordinary user on a virtual screen and checks that it fully
# starts (see GAMBIT_SMOKE in main.js).  Usage: smoke.sh <label> <command> [args...]
set -euo pipefail
label=$1; shift
id player >/dev/null 2>&1 || useradd -m player
cmd=$(printf '%q ' "$@")
log=$(mktemp)
if su player -s /bin/bash -c "cd ~ && GAMBIT_SMOKE=1 GAMBIT_DATA_DIR=\$(mktemp -d) timeout 120 xvfb-run -a -s '-screen 0 1360x860x24' $cmd" >"$log" 2>&1 \
   && grep -q GAMBIT_SMOKE_OK "$log"; then
  echo "PASS  $label: $(grep GAMBIT_SMOKE_OK "$log")"
else
  echo "FAIL  $label"; tail -40 "$log"; exit 1
fi
