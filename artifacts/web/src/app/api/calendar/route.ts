/**
 * DEV-41 (STU-39): Content Calendar API.
 *
 * PATCH — reschedule a Calendar Entry to a new date (drag-and-drop on the
 *         month/week grid). Owner-scoped via our internal user id, so dragging
 *         someone else's entry is a 404 rather than a cross-account write.
 *
 * Browser-called via fetch, self-authing with `auth()` — the same shape as
 * /api/social/accounts (the CLAUDE.md "Server Actions only" rule is stale;
 * every feature here uses /api route handlers). The GET list is served by the
 * /calendar server component, so it isn't duplicated here.
 */
import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { ensureLocalUser } from "@/lib/local-user";
import { calendarService } from "@/lib/calendar";
import { parseDateKey } from "@/lib/calendar-view";

function unauthorized() {
  return NextResponse.json(
    { data: null, error: "Unauthorized" },
    { status: 401 },
  );
}

export async function PATCH(req: Request) {
  const { userId: clerkId } = await auth();
  if (!clerkId) {
    return unauthorized();
  }
  const user = await ensureLocalUser(clerkId);
  if (!user) {
    return unauthorized();
  }

  let body: { entryId?: unknown; date?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { data: null, error: "Expected a JSON body" },
      { status: 400 },
    );
  }

  const entryId = typeof body.entryId === "string" ? body.entryId.trim() : "";
  const dateKey = typeof body.date === "string" ? body.date.trim() : "";
  if (!entryId) {
    return NextResponse.json(
      { data: null, error: "entryId is required" },
      { status: 400 },
    );
  }

  // `YYYY-MM-DD` → UTC midnight. Throws on a malformed or out-of-range key.
  let date: Date;
  try {
    date = parseDateKey(dateKey);
  } catch {
    return NextResponse.json(
      { data: null, error: "date must be a valid YYYY-MM-DD date" },
      { status: 400 },
    );
  }

  try {
    const entry = await calendarService.rescheduleEntry({
      userId: user.id,
      entryId,
      date,
    });
    return NextResponse.json({
      data: { entry: { id: entry.id, date: entry.date.toISOString() } },
      error: null,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "";
    if (/not found/i.test(message)) {
      return NextResponse.json(
        { data: null, error: "Calendar entry not found" },
        { status: 404 },
      );
    }
    console.error("Calendar reschedule failed", err);
    return NextResponse.json(
      { data: null, error: "Couldn't reschedule that item. Please try again." },
      { status: 502 },
    );
  }
}
