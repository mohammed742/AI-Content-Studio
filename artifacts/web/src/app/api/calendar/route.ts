/**
 * DEV-41 (STU-39): Content Calendar API.
 *
 * PATCH — mutate one Calendar Entry, owner-scoped via our internal user id, so
 *         touching someone else's entry is a 404 rather than a cross-account
 *         write. Two mutations share the verb because they're one row edit:
 *           • `{ entryId, date }`      — reschedule (drag-and-drop on the grid)
 *           • `{ entryId, scheduled }` — DEV-42, opt in/out of auto-publishing
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

  let body: { entryId?: unknown; date?: unknown; scheduled?: unknown };
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

  // DEV-42: the auto-publish opt-in. Checked before the date branch so a body
  // carrying `scheduled` is never mistaken for a reschedule.
  if (typeof body.scheduled === "boolean") {
    try {
      const entry = await calendarService.setEntrySchedule({
        userId: user.id,
        entryId,
        scheduled: body.scheduled,
      });
      return NextResponse.json({
        data: { entry: { id: entry.id, status: entry.status } },
        error: null,
      });
    } catch (err) {
      // The service's refusals are all "this transition isn't legal for you" —
      // not found, not yours, not generated, or already in flight.
      const message =
        err instanceof Error ? err.message : "Couldn't update that item.";
      if (/not found/i.test(message)) {
        return NextResponse.json({ data: null, error: message }, { status: 404 });
      }
      console.error("Calendar schedule toggle failed", err);
      return NextResponse.json(
        { data: null, error: "Couldn't update that item. Please try again." },
        { status: 502 },
      );
    }
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
