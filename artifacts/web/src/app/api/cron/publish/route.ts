/**
 * DEV-42 (STU-40): the scheduled-publishing cron trigger.
 *
 * Runs one Publish Scheduler pass: advance in-flight Calendar Entries, then
 * submit everything now due (see `src/lib/publish-scheduler.ts` — all of the
 * behaviour lives there; this file is auth + wiring).
 *
 * Called by an external scheduler (a Replit Scheduled Deployment running curl,
 * or any cron pinger), never by a browser — the same exception to the
 * "no browser-called /api routes" rule as the Clerk webhook. There is no Clerk
 * session here, so the gate is a shared secret:
 *
 *     curl -X POST https://<host>/api/cron/publish \
 *       -H "Authorization: Bearer $CRON_SECRET"
 *
 * `CRON_SECRET` unset → 503, never an unauthenticated run. GET is accepted
 * alongside POST because many schedulers can only issue GETs.
 *
 * Cadence: every 15 minutes is plenty — entries carry an "HH:MM" time, and a
 * run also needs to come back later to finish jobs Muapi is still processing.
 */
import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { env } from "@/env";
import { publishSchedulerService } from "@/lib/publish-scheduler";

export const dynamic = "force-dynamic";
// Publishing is submit-only per run (no inline polling), but a full batch is
// still N sequential Muapi calls.
export const maxDuration = 300;

/** Constant-time compare, length-safe (timingSafeEqual throws on a mismatch). */
function secretMatches(provided: string, expected: string): boolean {
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * Authorize the caller. Returns a response to send back, or null when the
 * request may proceed. Fails closed: no configured secret means no runs.
 */
function authorize(req: Request): NextResponse | null {
  const expected = env.CRON_SECRET;
  if (!expected) {
    console.error("[api/cron/publish] CRON_SECRET is not set — refusing to run");
    return NextResponse.json(
      { data: null, error: "Scheduled publishing is not configured" },
      { status: 503 },
    );
  }
  const header = req.headers.get("authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  if (!token || !secretMatches(token, expected)) {
    return NextResponse.json(
      { data: null, error: "Unauthorized" },
      { status: 401 },
    );
  }
  return null;
}

async function handle(req: Request) {
  const denied = authorize(req);
  if (denied) {
    return denied;
  }

  try {
    const summary = await publishSchedulerService.runDuePublishes();
    console.log("[api/cron/publish] run complete", summary);
    return NextResponse.json({ data: summary, error: null });
  } catch (error) {
    // runDuePublishes isolates per-entry failures internally, so reaching here
    // means something systemic (the DB, most likely). A 500 lets the scheduler's
    // own alerting notice.
    const message = error instanceof Error ? error.message : "unknown";
    console.error("[api/cron/publish] run failed:", message);
    return NextResponse.json(
      { data: null, error: "Scheduler run failed" },
      { status: 500 },
    );
  }
}

export async function POST(req: Request) {
  return handle(req);
}

export async function GET(req: Request) {
  return handle(req);
}
