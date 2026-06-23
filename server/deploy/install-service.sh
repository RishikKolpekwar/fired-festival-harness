#!/bin/bash
# Install the Solo harness as a persistent launchd service (auto-start at login,
# auto-restart on crash/sleep). Run this ONCE from the user's account.
#
#   bash server/deploy/install-service.sh
#
# It builds the prod bundle, frees :8787, installs the LaunchAgent, and verifies
# the service is serving + auto-restarts when killed.
set -euo pipefail

SERVER_DIR="/Users/rishikkolpekwar/Documents/Coding Projects/Side Projects/solo/server"
PLIST_SRC="$SERVER_DIR/deploy/com.solo.harness.plist"
PLIST_DST="$HOME/Library/LaunchAgents/com.solo.harness.plist"
LABEL="com.solo.harness"

cd "$SERVER_DIR"
mkdir -p logs

echo "[1/5] building prod bundle…"
npm run build

echo "[2/5] stopping any dev/standalone server on :8787…"
pkill -f "tsx watch src/index.ts" 2>/dev/null || true
pkill -f "tsx src/index.ts" 2>/dev/null || true
pkill -f "node dist/index.js" 2>/dev/null || true
sleep 1

echo "[3/5] installing LaunchAgent…"
mkdir -p "$HOME/Library/LaunchAgents"
cp "$PLIST_SRC" "$PLIST_DST"
launchctl unload "$PLIST_DST" 2>/dev/null || true
launchctl load -w "$PLIST_DST"

echo "[4/5] waiting for :8787…"
for i in $(seq 1 30); do
  [ "$(curl -s -m 2 -o /dev/null -w '%{http_code}' localhost:8787/api/health || true)" = "200" ] && { echo "  up (HTTP 200)"; break; }
  sleep 1
done

echo "[5/5] proving KeepAlive auto-restart (killing the server, expecting respawn)…"
PID=$(pgrep -f "node dist/index.js" | head -1 || true)
echo "  killing pid $PID"; [ -n "$PID" ] && kill "$PID" || true
sleep 12
for i in $(seq 1 20); do
  [ "$(curl -s -m 2 -o /dev/null -w '%{http_code}' localhost:8787/api/health || true)" = "200" ] && { echo "  RESTARTED — HTTP 200 (KeepAlive works)"; break; }
  sleep 1
done

echo "done. manage with: launchctl unload/load -w $PLIST_DST ; logs at $SERVER_DIR/logs/"
