#!/usr/bin/env bash
# Start API + web and open the app in the browser.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
API_URL="http://127.0.0.1:8787"
WEB_URL="http://127.0.0.1:5173"
API_PID=""
WEB_PID=""

cleanup() {
  trap - EXIT INT TERM
  if [[ -n "$WEB_PID" ]] && kill -0 "$WEB_PID" 2>/dev/null; then
    kill "$WEB_PID" 2>/dev/null || true
    wait "$WEB_PID" 2>/dev/null || true
  fi
  if [[ -n "$API_PID" ]] && kill -0 "$API_PID" 2>/dev/null; then
    kill "$API_PID" 2>/dev/null || true
    wait "$API_PID" 2>/dev/null || true
  fi
}
trap cleanup EXIT INT TERM

cd "$ROOT"

if [[ ! -f apps/api/.dev.vars ]]; then
  cp apps/api/.dev.vars.example apps/api/.dev.vars
  echo "Created apps/api/.dev.vars from example"
fi

echo "Applying local D1 migrations …"
(cd apps/api && npx wrangler d1 migrations apply pat-db --local) >/dev/null

# Free ports left by a previous (or aborted) session
free_port() {
  local port=$1
  local pids
  pids=$(ss -tlnp "sport = :${port}" 2>/dev/null | grep -oP 'pid=\K[0-9]+' | sort -u || true)
  if [[ -z "${pids}" ]]; then
    return 0
  fi
  echo "  freeing :${port} (pids: ${pids})"
  # shellcheck disable=SC2086
  kill $pids 2>/dev/null || true
  sleep 0.2
  # shellcheck disable=SC2086
  kill -9 $pids 2>/dev/null || true
}
echo "Ensuring ports 8787 and 5173 are free …"
free_port 8787
free_port 5173
# wrangler may leave a parent that respawns workerd
pkill -f "wrangler dev --port 8787" 2>/dev/null || true
pkill -f "vite --host 127.0.0.1 --port 5173" 2>/dev/null || true
sleep 0.3

echo "Starting API on $API_URL …"
npm run dev -w @pat/api -- --port 8787 --ip 127.0.0.1 &
API_PID=$!

echo "Starting web on $WEB_URL …"
npm run dev -w @pat/web -- --host 127.0.0.1 --port 5173 &
WEB_PID=$!

wait_for() {
  local url=$1
  local name=$2
  local i=0
  until curl -sf "$url" >/dev/null 2>&1; do
    i=$((i + 1))
    if [[ $i -gt 90 ]]; then
      echo "Timed out waiting for $name ($url)" >&2
      exit 1
    fi
    sleep 0.5
  done
  echo "$name is ready"
}

wait_for "$API_URL/api/health" "API"
wait_for "$WEB_URL" "Web"

if command -v xdg-open >/dev/null 2>&1; then
  xdg-open "$WEB_URL" >/dev/null 2>&1 || true
elif command -v open >/dev/null 2>&1; then
  open "$WEB_URL" || true
else
  echo "Open $WEB_URL in your browser"
fi

echo "Dev servers running. Ctrl+C to stop."
wait
