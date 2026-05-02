#!/usr/bin/env bash
set -euo pipefail

python flame_bot/bot.py &
BOT_PID=$!

cleanup() {
  kill "$BOT_PID" 2>/dev/null || true
}
trap cleanup EXIT INT TERM

exec npm run start
