#!/usr/bin/env bash
set -euo pipefail

if [[ $# -lt 3 ]]; then
  cat <<'USAGE'
Usage:
  scripts/check-flame-bot-api.sh <base_url> <api_key> <discord_id>

Example:
  scripts/check-flame-bot-api.sh https://your-flame-bot.example.com your_secret_key 123456789012345678
USAGE
  exit 1
fi

BASE_URL="${1%/}"
API_KEY="$2"
DISCORD_ID="$3"

if [[ ! "$DISCORD_ID" =~ ^[0-9]+$ ]]; then
  echo "Error: discord_id must be numeric." >&2
  exit 1
fi

tmp_body="$(mktemp)"
all_ok=true
cleanup() {
  rm -f "$tmp_body"
}
trap cleanup EXIT

request() {
  local label="$1"
  local url="$2"
  local expected_codes_csv="$3"
  local code
  if ! code="$(curl -sS -m 15 -o "$tmp_body" -w "%{http_code}" \
    -H "X-API-Key: ${API_KEY}" \
    "$url")"; then
    code="000"
  fi

  echo "== ${label}"
  echo "URL: ${url}"
  echo "HTTP: ${code}"
  echo "Body:"
  cat "$tmp_body"
  echo

  IFS=',' read -r -a expected_codes <<< "$expected_codes_csv"
  local matched=false
  for expected in "${expected_codes[@]}"; do
    if [[ "$code" == "$expected" ]]; then
      matched=true
      break
    fi
  done

  if [[ "$matched" != true ]]; then
    all_ok=false
    echo "Expected HTTP one of [${expected_codes_csv}] for ${label}, got ${code}." >&2
  fi

  REQUEST_CODE="$code"
}

REQUEST_CODE=""
request "Root check" "${BASE_URL}/" "200"
root_code="$REQUEST_CODE"

request "Health check" "${BASE_URL}/health" "200"
health_code="$REQUEST_CODE"

request "Role check" "${BASE_URL}/api/roles/${DISCORD_ID}" "200,401,403,503"
role_code="$REQUEST_CODE"

if [[ "$root_code" == "200" && "$role_code" == "401" ]]; then
  all_ok=false
  echo "Diagnosis: flame_bot is reachable, but the API key is likely wrong (401)." >&2
fi
if [[ "$root_code" == "200" && "$role_code" == "403" ]]; then
  all_ok=false
  echo "Diagnosis: flame_bot is reachable, but access is forbidden (403)." >&2
fi
if [[ "$root_code" == "200" && "$role_code" == "503" ]]; then
  all_ok=false
  echo "Diagnosis: flame_bot is reachable, but bot cache is not ready yet (503)." >&2
fi

if [[ "$all_ok" != true ]]; then
  echo "flame_bot API check failed." >&2
  exit 2
fi

echo "flame_bot API check passed."
