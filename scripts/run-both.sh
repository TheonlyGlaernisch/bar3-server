#!/usr/bin/env bash
set -euo pipefail

BOT_PID=""

if [[ -f flame_bot_ts/build/src/index.js ]]; then
  echo "[run-both] Starting TypeScript bot (flame_bot_ts/build/src/index.js)..."
  node flame_bot_ts/build/src/index.js &
  BOT_PID=$!

  cleanup() {
    kill "$BOT_PID" 2>/dev/null || true
  }
  trap cleanup EXIT INT TERM
else
  echo "[run-both] flame_bot_ts/build/src/index.js not found; starting root server only."
fi

exec node ./build/src/index.js
