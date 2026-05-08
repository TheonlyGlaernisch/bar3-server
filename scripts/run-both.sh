#!/usr/bin/env bash
set -euo pipefail

BOT_PID=""

if [[ -f flame_bot_ts/build/src/index.js ]]; then
  echo "[run-both] Starting TypeScript bot (flame_bot_ts/build/src/index.js)..."
  node flame_bot_ts/build/src/index.js &
  BOT_PID=$!
  sleep 1
  if ! kill -0 "$BOT_PID" 2>/dev/null; then
    echo "[run-both] TypeScript bot failed to start."
    exit 1
  fi

  cleanup() {
    kill "$BOT_PID" 2>/dev/null || true
  }
  trap cleanup EXIT INT TERM
else
  echo "[run-both] flame_bot_ts/build/src/index.js not found; starting root server only."
fi

exec node ./build/src/index.js
