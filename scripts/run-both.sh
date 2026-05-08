#!/usr/bin/env bash
set -euo pipefail

BOT_PID=""

if [[ -f flame_bot/bot.py ]]; then
  echo "[run-both] Starting Python bot (flame_bot/bot.py)..."
  python flame_bot/bot.py &
  BOT_PID=$!

  cleanup() {
    kill "$BOT_PID" 2>/dev/null || true
  }
  trap cleanup EXIT INT TERM
else
  echo "[run-both] flame_bot/bot.py not found; starting TypeScript server only."
fi

exec npm run start
