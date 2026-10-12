#!/bin/bash
# HUD launcher — no sudo, no systemd. Safe to run from @reboot cron.
# Usage: ~/hud/start.sh
set -u
HUD_DIR="/home/musecell/projects/muse-pi-hud"
PIDFILE="$HUD_DIR/hud.pid"
LOG="$HUD_DIR/hud.log"

cd "$HUD_DIR" || exit 1

if [ -f "$PIDFILE" ]; then
  oldpid="$(cat "$PIDFILE" 2>/dev/null || true)"
  if [ -n "$oldpid" ] && kill -0 "$oldpid" 2>/dev/null; then
    echo "HUD already running (pid $oldpid)"
    exit 0
  fi
fi

# node must exist; npm-installed deps live in $HUD_DIR/node_modules
if ! command -v node >/dev/null 2>&1; then
  echo "node not found in PATH" >&2
  exit 1
fi

nohup node server.js >>"$LOG" 2>&1 &
echo $! > "$PIDFILE"
echo "HUD started (pid $(cat "$PIDFILE")) — log: $LOG"
