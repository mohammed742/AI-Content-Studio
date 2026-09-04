#!/usr/bin/env bash
# Push a local env file's values into the linked Railway project's `web` service.
#
# Run this yourself — it reads real secrets, so it is deliberately a script you
# execute rather than something an agent runs on your behalf.
#
#   railway link                                   # pick project + environment
#   ./deploy/railway/sync-env.sh                   # dry run against the default file
#   ./deploy/railway/sync-env.sh --apply
#   ./deploy/railway/sync-env.sh --file artifacts/web/.env.production.local --apply
#
# Values are never echoed. Only key names are printed.
#
# Clerk: the deployed app is backed by a Clerk PRODUCTION instance, so this
# refuses to push pk_test_ / sk_test_ keys. Clerk production keys are locked to
# your custom domain and cannot be used on localhost, which is why the
# production values live in a separate file from .env.local rather than
# replacing it. Override with --allow-test-keys only for a throwaway instance
# you do not intend to put users on.
set -euo pipefail

ENV_FILE="artifacts/web/.env.local"
SERVICE="web"
APPLY=0
ALLOW_TEST_KEYS=0

while [ $# -gt 0 ]; do
  case "$1" in
    --apply) APPLY=1 ;;
    --allow-test-keys) ALLOW_TEST_KEYS=1 ;;
    --file) shift; ENV_FILE="${1:?--file needs a path}" ;;
    --service) shift; SERVICE="${1:?--service needs a name}" ;;
    *) echo "unknown argument: $1" >&2; exit 2 ;;
  esac
  shift
done

[ -f "$ENV_FILE" ] || { echo "missing $ENV_FILE — run from the repo root" >&2; exit 1; }

# PORT and NODE_ENV are injected by Railway; setting them breaks the deploy.
# The two NEXT_PUBLIC_CLERK_SIGN_*_URL values are declared in
# .railway/railway.ts, so pushing them here would just fight that file.
SKIP="PORT NODE_ENV NEXT_PUBLIC_CLERK_SIGN_IN_URL NEXT_PUBLIC_CLERK_SIGN_UP_URL"

pending=""
while IFS= read -r line; do
  case "$line" in ''|'#'*) continue ;; esac
  key=${line%%=*}
  value=${line#*=}
  # .env.local in this repo writes some pairs as `KEY= value` — trim both ends.
  key=$(printf '%s' "$key" | tr -d '[:space:]')
  value=$(printf '%s' "$value" | sed -E 's/^[[:space:]]+//; s/[[:space:]]+$//')
  case " $SKIP " in *" $key "*) echo "skip  $key (managed elsewhere)"; continue ;; esac
  [ -n "$value" ] || { echo "skip  $key (empty in $ENV_FILE)"; continue; }

  if [ "$ALLOW_TEST_KEYS" -eq 0 ]; then
    case "$key:$value" in
      NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY:pk_test_*|CLERK_SECRET_KEY:sk_test_*)
        echo >&2
        echo "REFUSING: $key in $ENV_FILE is a Clerk *test* key." >&2
        echo "This deployment is backed by a Clerk production instance." >&2
        echo "Put the pk_live_/sk_live_ pair and the production webhook secret in" >&2
        echo "artifacts/web/.env.production.local and pass --file, or override with" >&2
        echo "--allow-test-keys if you genuinely want a test-key deploy." >&2
        exit 1
        ;;
    esac
  fi

  pending="$pending $key"
  if [ "$APPLY" -eq 1 ]; then
    # --skip-deploys so one redeploy happens at the end, not once per variable.
    railway variable set "$key=$value" --service "$SERVICE" --skip-deploys >/dev/null
    echo "set   $key"
  else
    echo "would set   $key"
  fi
done < "$ENV_FILE"

echo
case " $pending " in
  *" NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY "*)
    echo "NOTE: NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY is inlined into the client bundle"
    echo "      at BUILD time. Changing it requires a rebuild, not just a restart."
    echo
    ;;
esac

if [ "$APPLY" -eq 1 ]; then
  echo "Done. Now mirror CRON_SECRET onto the cron service:"
  echo "  railway variable set \"CRON_SECRET=\$(railway variable list --service web --kv | grep '^CRON_SECRET=' | cut -d= -f2-)\" --service cron-publish"
  echo "Then rebuild so the publishable key is baked in: railway redeploy --service web"
else
  echo "Dry run only. Re-run with --apply to write these to Railway."
fi
