/**
 * DEV-41 (STU-39): Content Calendar page (DESIGN §9.8).
 *
 * Month grid (default) + week view of the user's Calendar Entries — the rows
 * DEV-40 auto-creates when a Content Plan is approved. Colour-coded by content
 * type, click a day for the slide-over, drag an entry to reschedule.
 *
 * Server component: auth + ensureLocalUser + list the user's entries, then hand
 * plain JSON (dates as ISO strings) to the client view — the same shape /social
 * uses. In the (dashboard) group so it reuses DashboardShell and lives at
 * /calendar per DESIGN §9.8. Rescheduling mutates via /api/calendar and
 * `router.refresh()` re-runs this list.
 */
import { Metadata } from "next";
import { redirect } from "next/navigation";
import { auth } from "@clerk/nextjs/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { assetKits } from "@/db/schema";
import { ensureLocalUser } from "@/lib/local-user";
import { calendarService } from "@/lib/calendar";
import type { CalendarEntryView } from "@/lib/calendar-view";
import { CalendarView } from "@/components/calendar/calendar-view";
import type { KitThumbnails } from "@/components/calendar/day-panel";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Calendar",
  description: "Your scheduled content, week by week.",
};

export default async function CalendarPage() {
  const { userId: clerkId } = await auth();
  if (!clerkId) {
    redirect("/sign-in");
  }
  const user = await ensureLocalUser(clerkId);
  if (!user) {
    redirect("/sign-in");
  }

  const entries: CalendarEntryView[] = (
    await calendarService.listCalendarEntries(user.id)
  ).map((entry) => ({
    id: entry.id,
    title: entry.title,
    platform: entry.platform,
    contentType: entry.contentType,
    status: entry.status,
    date: entry.date.toISOString(),
    time: entry.time,
    assetKitId: entry.assetKitId,
  }));

  // Thumbnails for the day slide-over (DESIGN §9.8 — "thumbnail (if
  // generated)"). One scoped query keyed by kit id, rather than a join per
  // entry; skipped entirely when nothing on the calendar has generated yet.
  const thumbnails: KitThumbnails = {};
  if (entries.some((entry) => entry.assetKitId)) {
    const kits = await db
      .select({
        id: assetKits.id,
        mediaUrl: assetKits.mediaUrl,
        mediaType: assetKits.mediaType,
      })
      .from(assetKits)
      .where(eq(assetKits.userId, user.id));
    for (const kit of kits) {
      thumbnails[kit.id] = { url: kit.mediaUrl, mediaType: kit.mediaType };
    }
  }

  return <CalendarView entries={entries} thumbnails={thumbnails} />;
}
