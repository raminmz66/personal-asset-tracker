#!/usr/bin/env bash
# Clear TOTP enrollment and any attempt lock, so login falls back to the
# password alone. Recovery path for a lost authenticator.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
TARGET="--local"

for arg in "$@"; do
  case "$arg" in
    --local) TARGET="--local" ;;
    --remote) TARGET="--remote" ;;
    *)
      echo "Unknown option: $arg" >&2
      echo "Usage: npm run 2fa:reset [-- --remote]" >&2
      exit 2
      ;;
  esac
done

if [[ "$TARGET" == "--remote" ]]; then
  echo "⚠️  This will disable two-factor auth on PRODUCTION (pat-db --remote)."
  # A non-interactive stdin (EOF) must abort, not fall through.
  if ! read -r -p "Type RESET to continue: " reply; then
    echo
    echo "Aborted (no confirmation received)."
    exit 1
  fi
  if [[ "$reply" != "RESET" ]]; then
    echo "Aborted."
    exit 1
  fi
fi

cd "$ROOT/apps/api"

echo "Clearing TOTP enrollment and attempt lock ($TARGET) …"
npx wrangler d1 execute pat-db "$TARGET" --command "
  DELETE FROM settings WHERE key IN ('totp_secret','totp_pending_secret','totp_last_step');
  DELETE FROM auth_throttle;
" >/dev/null

echo "Done. Two-factor auth is off and any lockout is cleared."
echo "Log in with your password, then re-enroll from Settings."
