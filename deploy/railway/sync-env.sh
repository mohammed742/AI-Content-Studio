#!/usr/bin/env bash
# Push the local artifacts/web/.env.local secrets into the linked Railway
# project's `web` service.
#
# Run this yourself — it reads real secrets, so it is deliberately a script you
# execute rather than something an agent runs on your behalf.
#
#   railway link                      # pick the project + environment first
#   ./deploy/railway/sync-env.sh      # dry run: prints the keys it would set
#   ./deploy/railway/sync-env.sh --apply
#
# Values are never echoed. Only key names are printed.
set -euo pipefail

ENV_FILE="artifacts/web/.env.local"
SERVICE="web"
APPLY=0
[ "${1:-}" = "--apply" ] && APPLY=1

[ -f "$ENV_FILE" ] || { echo "missing $ENV_FILE — run from the repo root" >&2; exit 1; }

# PORT and NODE_ENV are injected by Railway; setting them breaks the deploy.
SKIP="PORT NODE_ENV"

while IFS= read -r line; do
  case "$line" in ''|'#'*) continue ;; esac
  key=${line%%=*}
  value=${line#*=}
  # .env.local in this repo writes some pairs as `KEY= value` — trim both ends.
  key=$(printf '%s' "$key" | tr -d '[:space:]')
  value=$(printf '%s' "$value" | sed -E 's/^[[:space:]]+//; s/[[:space:]]+$//')
  case " $SKIP " in *" $key "*) echo "skip  $key (Railway-managed)"; continue ;; esac
  [ -n "$value" ] || { echo "skip  $key (empty locally)"; continue; }

  if [ "$APPLY" -eq 1 ]; then
    # --skip-deploys so one redeploy happens at the end, not once per variable.
    railway variable set "$key=$value" --service "$SERVICE" --skip-deploys >/dev/null
    echo "set   $key"
  else
    echo "would set   $key"
  fi
done < "$ENV_FILE"

if [ "$APPLY" -eq 1 ]; then
  echo
  echo "Done. Now mirror CRON_SECRET onto the cron service:"
  echo "  railway variable set \"CRON_SECRET=\$(railway variable list --service web --kv | grep '^CRON_SECRET=' | cut -d= -f2-)\" --service cron-publish"
  echo "Then redeploy: railway redeploy --service web"
else
  echo
  echo "Dry run only. Re-run with --apply to write these to Railway."
fi
