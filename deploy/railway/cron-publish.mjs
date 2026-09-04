/**
 * Railway cron entrypoint for scheduled publishing (DEV-42, STU-40).
 *
 * `POST /api/cron/publish` runs one Publish Scheduler pass — advance in-flight
 * Calendar Entries, then submit everything now due. It authenticates with a
 * shared secret, not a Clerk session (see
 * `artifacts/web/src/app/api/cron/publish/route.ts`).
 *
 * This is a one-shot process: it fires the request, logs the outcome, and
 * exits. Railway skips the next tick if the previous one is still running, so
 * exiting matters.
 *
 * Deliberately zero-dependency plain Node — the cron service installs the
 * workspace but must not need it to run.
 *
 * Required service variables:
 *   CRON_TARGET_URL  full URL of the endpoint, e.g.
 *                    https://${{web.RAILWAY_PUBLIC_DOMAIN}}/api/cron/publish
 *   CRON_SECRET      must match the web service's CRON_SECRET exactly
 */
const target = process.env.CRON_TARGET_URL;
const secret = process.env.CRON_SECRET;

/** Wall-clock cap. The route itself declares maxDuration = 300. */
const TIMEOUT_MS = 300_000;

function fail(message) {
  console.error(`[cron-publish] ${message}`);
  process.exit(1);
}

if (!target) fail("CRON_TARGET_URL is not set — refusing to run");
if (!secret) fail("CRON_SECRET is not set — refusing to run");

const startedAt = Date.now();

try {
  const res = await fetch(target, {
    method: "POST",
    headers: {
      authorization: `Bearer ${secret}`,
      "content-type": "application/json",
    },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });

  const body = await res.text();
  const elapsed = Date.now() - startedAt;

  if (!res.ok) {
    // 401 = secret mismatch between the two services, 503 = web service has no
    // CRON_SECRET at all. Both are config errors, not transient.
    fail(`HTTP ${res.status} after ${elapsed}ms: ${body.slice(0, 500)}`);
  }

  console.log(`[cron-publish] ok in ${elapsed}ms: ${body.slice(0, 500)}`);
  process.exit(0);
} catch (error) {
  fail(`request failed: ${error instanceof Error ? error.message : String(error)}`);
}
