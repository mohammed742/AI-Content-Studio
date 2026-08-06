/**
 * DEV-41: Content Calendar view model (DESIGN §9.8).
 *
 * Everything the calendar page needs to lay itself out — month grid, week
 * strip, entry grouping, labels, colour families — derived by pure functions so
 * it unit-tests without React or a DB. The components in
 * `src/components/calendar/` stay presentational and call into here.
 *
 * **All date math is UTC.** Calendar Entries are persisted at UTC midnight
 * (DEV-40, `src/lib/calendar.ts`), so building the grid in local time would
 * shift entries by a day for anyone behind UTC. `toDateKey` is the single
 * bridge between a `Date` and the `YYYY-MM-DD` string used as the grid key,
 * the drag-and-drop payload, and the reschedule API's wire format.
 *
 * Weeks run **Monday-first**, matching the Content Plan's `week_start` anchor
 * and `weekdayOffset` (monday = 0) in `calendar.ts`.
 *
 * Built with no calendar/date dependency (DESIGN §2 lists FullCalendar or
 * date-fns; neither is installed and the human confirmed zero new deps).
 */
import {
  CONTENT_TYPE_LABELS,
  type ContentType,
} from "./industry-templates.ts";

/** Which view the calendar is showing. Month is the default (DESIGN §9.8). */
export type CalendarViewMode = "month" | "week";

/**
 * A Calendar Entry as handed to the client — the DB row flattened to plain
 * JSON (dates as ISO strings), the same server→client shape `/social` uses.
 */
export interface CalendarEntryView {
  id: string;
  title: string;
  platform: string;
  contentType: ContentType;
  status: "planned" | "generated" | "scheduled" | "published" | "failed";
  /** ISO timestamp; the day is read in UTC. */
  date: string;
  /** "HH:MM" time-of-day. */
  time: string;
  assetKitId: string | null;
}

/** One cell of the grid: a day, plus whatever is scheduled on it. */
export interface CalendarDay {
  date: Date;
  /** `YYYY-MM-DD` — grid key and drag-and-drop drop-target id. */
  key: string;
  dayOfMonth: number;
  /** False for the leading/trailing days borrowed from adjacent months. */
  inCurrentMonth: boolean;
  isToday: boolean;
  entries: CalendarEntryView[];
}

// ---------------------------------------------------------------- date utils

/** `YYYY-MM-DD` for a date, read in UTC. */
export function toDateKey(date: Date): string {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/**
 * Parse a `YYYY-MM-DD` key to UTC midnight. Throws on anything malformed or
 * out of range (e.g. `2026-13-01`, `2026-02-30`) so a tampered or corrupt drop
 * payload fails loud at the API boundary instead of writing a bogus date.
 */
export function parseDateKey(key: string): Date {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(key)) {
    return badDate(key);
  }
  const [year, month, day] = key.split("-").map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  // Round-trip catches overflow that Date.UTC silently rolls over.
  if (toDateKey(parsed) !== key) {
    return badDate(key);
  }
  return parsed;
}

function badDate(key: string): never {
  throw new Error(`Invalid calendar date: ${key || "(empty)"}`);
}

/** Same instant, snapped to UTC midnight. */
export function startOfDay(date: Date): Date {
  return new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
  );
}

/** `n` days later (or earlier) at UTC midnight. */
export function addDays(date: Date, n: number): Date {
  return new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() + n),
  );
}

/** The UTC Monday of the week containing `date` (Sunday closes a week). */
export function mondayOf(date: Date): Date {
  // getUTCDay: Sunday = 0 … Saturday = 6. Shift so Monday = 0.
  const offsetFromMonday = (date.getUTCDay() + 6) % 7;
  return addDays(startOfDay(date), -offsetFromMonday);
}

/** The 1st of `date`'s month, at UTC midnight. */
export function startOfMonth(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
}

/**
 * Move `delta` whole months, returning the 1st. Anchoring on day 1 sidesteps
 * the classic overflow bug where Jan 31 + 1 month lands in March.
 */
export function shiftMonth(date: Date, delta: number): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + delta, 1));
}

// --------------------------------------------------------------- grid builder

/** Bucket entries by their UTC day key, preserving the incoming order. */
export function groupEntriesByDay(
  entries: CalendarEntryView[],
): Map<string, CalendarEntryView[]> {
  const byDay = new Map<string, CalendarEntryView[]>();
  for (const entry of entries) {
    const key = toDateKey(new Date(entry.date));
    const bucket = byDay.get(key);
    if (bucket) {
      bucket.push(entry);
    } else {
      byDay.set(key, [entry]);
    }
  }
  return byDay;
}

/** Build the run of days from `start` to `end` inclusive, as grid cells. */
function daysBetween(
  start: Date,
  end: Date,
  byDay: Map<string, CalendarEntryView[]>,
  todayKey: string,
  currentMonth: number | null,
): CalendarDay[] {
  const days: CalendarDay[] = [];
  for (let cursor = start; cursor <= end; cursor = addDays(cursor, 1)) {
    const key = toDateKey(cursor);
    days.push({
      date: cursor,
      key,
      dayOfMonth: cursor.getUTCDate(),
      inCurrentMonth:
        currentMonth === null || cursor.getUTCMonth() === currentMonth,
      isToday: key === todayKey,
      entries: byDay.get(key) ?? [],
    });
  }
  return days;
}

/**
 * The month grid for `anchor`'s month: rows of 7 Monday-first days, padded with
 * the adjacent months' days so every row is full. Row count varies (4–6) with
 * how the month falls, rather than always padding to 6.
 */
export function buildMonthGrid(
  anchor: Date,
  entries: CalendarEntryView[],
  today: Date,
): CalendarDay[][] {
  const monthStart = startOfMonth(anchor);
  const monthEnd = addDays(shiftMonth(monthStart, 1), -1);
  const days = daysBetween(
    mondayOf(monthStart),
    addDays(mondayOf(monthEnd), 6),
    groupEntriesByDay(entries),
    toDateKey(today),
    monthStart.getUTCMonth(),
  );

  const weeks: CalendarDay[][] = [];
  for (let i = 0; i < days.length; i += 7) {
    weeks.push(days.slice(i, i + 7));
  }
  return weeks;
}

/**
 * The 7 days of `anchor`'s week, Monday-first. Every day belongs to the view,
 * so none are greyed out.
 */
export function buildWeekGrid(
  anchor: Date,
  entries: CalendarEntryView[],
  today: Date,
): CalendarDay[] {
  const weekStart = mondayOf(anchor);
  return daysBetween(
    weekStart,
    addDays(weekStart, 6),
    groupEntriesByDay(entries),
    toDateKey(today),
    null,
  );
}

// ------------------------------------------------------------- content types

/**
 * The three colour families in the calendar legend (DESIGN §9.8):
 * emerald = photo, blue = graphic, purple = video.
 */
export type ContentFamily = "photo" | "graphic" | "video";

export interface ContentTypeMeta {
  family: ContentFamily;
  /** User-facing name — never the raw enum (agent-driven paradigm). */
  label: string;
}

/**
 * Which family a Content Type belongs to. Mirrors the actual generation
 * routing in `generation-queue.ts` rather than inventing a second taxonomy:
 * `product_showcase` runs the product-photo pipeline, `ugc_ad` is the video
 * pipeline, everything else renders as a social graphic.
 */
const TYPE_FAMILY: Record<ContentType, ContentFamily> = {
  product_showcase: "photo",
  ugc_ad: "video",
  tip: "graphic",
  behind_the_scenes: "graphic",
  promo: "graphic",
  testimonial: "graphic",
  seasonal: "graphic",
  engagement: "graphic",
};

/**
 * Legend wording per family. The matching dot *colours* deliberately live in
 * the component layer (`components/calendar/calendar-grid.tsx`), not here:
 * `tailwind.config.ts` only scans `src/app`, `src/components` and `src/pages`,
 * so a Tailwind class written in `src/lib` is never generated and silently
 * renders as no colour at all.
 */
export const FAMILY_META: Record<ContentFamily, { label: string }> = {
  photo: { label: "Photo" },
  graphic: { label: "Graphic" },
  video: { label: "Video" },
};

/**
 * Display metadata for a Content Type. Falls back to the graphic family for an
 * unrecognized value so a future enum member degrades to a plain dot instead of
 * blanking the calendar.
 */
export function contentTypeMeta(type: ContentType): ContentTypeMeta {
  return {
    family: TYPE_FAMILY[type] ?? "graphic",
    label: CONTENT_TYPE_LABELS[type] ?? "Content",
  };
}

// ------------------------------------------------------------ entry status

/** Badge tone for an entry's status, mirroring `publish-history.ts`'s tones. */
export type EntryStatusTone = "success" | "danger" | "pending" | "active";

export interface EntryStatusMeta {
  label: string;
  tone: EntryStatusTone;
}

/**
 * User-facing wording for the Calendar Entry status flow
 * (planned → generated → scheduled → published, plus failed). DEV-40 only ever
 * writes `planned`/`generated`; the later transitions arrive with DEV-42/43,
 * but the calendar renders all five now so those slices need no UI change.
 */
const STATUS_META: Record<CalendarEntryView["status"], EntryStatusMeta> = {
  planned: { label: "Planned", tone: "pending" },
  generated: { label: "Ready", tone: "success" },
  scheduled: { label: "Scheduled", tone: "active" },
  published: { label: "Published", tone: "success" },
  failed: { label: "Failed", tone: "danger" },
};

export function entryStatusMeta(
  status: CalendarEntryView["status"],
): EntryStatusMeta {
  return STATUS_META[status] ?? { label: "Planned", tone: "pending" };
}

// ------------------------------------------------------------------- labels

const MONTH_LONG = new Intl.DateTimeFormat("en-US", {
  month: "long",
  year: "numeric",
  timeZone: "UTC",
});

const MONTH_SHORT = new Intl.DateTimeFormat("en-US", {
  month: "short",
  timeZone: "UTC",
});

/** e.g. "June 2026". */
export function formatMonthLabel(date: Date): string {
  return MONTH_LONG.format(date);
}

/**
 * The Monday–Sunday span, collapsing repeated parts:
 * "Jun 1 – 7, 2026" · "Jun 29 – Jul 5, 2026" · "Dec 28, 2026 – Jan 3, 2027".
 */
export function formatWeekLabel(weekStart: Date): string {
  const start = mondayOf(weekStart);
  const end = addDays(start, 6);
  const startMonth = MONTH_SHORT.format(start);
  const endMonth = MONTH_SHORT.format(end);
  const startDay = start.getUTCDate();
  const endDay = end.getUTCDate();
  const startYear = start.getUTCFullYear();
  const endYear = end.getUTCFullYear();

  if (startYear !== endYear) {
    return `${startMonth} ${startDay}, ${startYear} – ${endMonth} ${endDay}, ${endYear}`;
  }
  if (startMonth !== endMonth) {
    return `${startMonth} ${startDay} – ${endMonth} ${endDay}, ${startYear}`;
  }
  return `${startMonth} ${startDay} – ${endDay}, ${startYear}`;
}

/** Monday-first weekday headers for the grid. */
export const WEEKDAY_HEADERS = [
  "Mon",
  "Tue",
  "Wed",
  "Thu",
  "Fri",
  "Sat",
  "Sun",
] as const;
