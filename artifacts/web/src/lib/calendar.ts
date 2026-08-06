/**
 * DEV-40: Content Calendar data model.
 *
 * A Calendar Entry (CONTEXT.md → "Calendar Entry") is one scheduled piece of
 * content. Entries are auto-created from a Content Plan's items when the plan is
 * approved: each item lands on a concrete date = the plan's `week_start` (a UTC
 * Monday) plus the item's `scheduledDay` weekday offset. Fields the calendar
 * needs (platform / type / title / date) are denormalized onto the row so it
 * stays self-describing even after the source plan or Asset Kit is deleted
 * (both refs are SET NULL — see schema.ts).
 *
 * The mapping is a pure function (`deriveCalendarEntries`) so the date math,
 * status mapping, and denormalization unit-test without a DB. Persistence goes
 * through injectable seams; defaults lazily load Drizzle so the module still
 * imports under the bare Node test runner.
 *
 * Scope (DEV-40): the table + derivation + auto-create on approval. The visual
 * calendar (DEV-41), scheduled auto-publish (DEV-42), and the status-flow
 * transitions beyond the initial planned/generated value (DEV-43) come later.
 */
import type {
  CalendarEntry,
  ContentPlanItemRecord,
  InsertCalendarEntry,
} from "@/db/schema";

/** Weekday → offset from the week's Monday (0..6). */
const WEEKDAY_OFFSETS: Record<string, number> = {
  monday: 0,
  tuesday: 1,
  wednesday: 2,
  thursday: 3,
  friday: 4,
  saturday: 5,
  sunday: 6,
};

/** Time-of-day for auto-created entries; plan items carry none. "HH:MM". */
export const DEFAULT_ENTRY_TIME = "09:00";

/**
 * Offset (in days) of a weekday from the week's Monday. Case-insensitive and
 * trimmed; throws on an unrecognized day so corrupt plan data fails loud rather
 * than silently mis-placing an entry.
 */
export function weekdayOffset(day: string): number {
  const offset = WEEKDAY_OFFSETS[day.trim().toLowerCase()];
  if (offset === undefined) {
    throw new Error(`Unknown weekday: ${day}`);
  }
  return offset;
}

/** The plan fields the calendar derivation reads (a `ContentPlanRow` subset). */
export interface PlanForCalendar {
  id: string;
  userId: string;
  /** The week's anchor — a UTC Monday at 00:00 (see `currentWeekStart`). */
  weekStart: Date;
  items: ContentPlanItemRecord[];
}

/** The concrete calendar date for `weekStart + weekday`, at UTC midnight. */
function entryDate(weekStart: Date, day: string): Date {
  return new Date(
    Date.UTC(
      weekStart.getUTCFullYear(),
      weekStart.getUTCMonth(),
      weekStart.getUTCDate() + weekdayOffset(day),
    ),
  );
}

/**
 * Map an approved plan's items to calendar-entry insert rows. Pure — no DB.
 * An item that already produced an Asset Kit starts as `generated`; otherwise
 * `planned`. The full status flow (scheduled → published) is DEV-43.
 */
export function deriveCalendarEntries(
  plan: PlanForCalendar,
): InsertCalendarEntry[] {
  return plan.items.map((item) => ({
    userId: plan.userId,
    contentPlanId: plan.id,
    planItemId: item.id,
    assetKitId: item.assetKitId ?? null,
    date: entryDate(plan.weekStart, item.scheduledDay),
    time: DEFAULT_ENTRY_TIME,
    platform: item.platform,
    contentType: item.type,
    title: item.title,
    status: item.assetKitId ? "generated" : "planned",
  }));
}

/**
 * Batch-insert entries, doing nothing on a `(content_plan_id, plan_item_id)`
 * conflict, and return the rows that were actually inserted. Injectable.
 */
export type CalendarEntryInserter = (
  values: InsertCalendarEntry[],
) => Promise<CalendarEntry[]>;

/** List a user's entries (newest scheduled date first). Injectable. */
export type CalendarEntryLister = (userId: string) => Promise<CalendarEntry[]>;

export interface CalendarServiceConfig {
  insertEntries?: CalendarEntryInserter;
  listEntries?: CalendarEntryLister;
}

export class CalendarService {
  private readonly insertEntries: CalendarEntryInserter;
  private readonly listEntries: CalendarEntryLister;

  constructor(config: CalendarServiceConfig = {}) {
    this.insertEntries = config.insertEntries ?? defaultInsertEntries;
    this.listEntries = config.listEntries ?? defaultListEntries;
  }

  /**
   * Create calendar entries for an approved plan. Idempotent: re-approving a
   * plan (retry) inserts nothing new, thanks to the unique-index conflict.
   * Returns the rows actually inserted (empty on a no-op re-approval).
   */
  async createCalendarEntriesForPlan(
    plan: PlanForCalendar,
  ): Promise<CalendarEntry[]> {
    const values = deriveCalendarEntries(plan);
    if (values.length === 0) {
      return [];
    }
    return this.insertEntries(values);
  }

  /** A user's calendar entries (for the calendar view, DEV-41). */
  listCalendarEntries(userId: string): Promise<CalendarEntry[]> {
    return this.listEntries(userId);
  }
}

/** Default insert — batch insert, skip conflicts on the plan-item unique key. */
const defaultInsertEntries: CalendarEntryInserter = async (values) => {
  const [{ db }, { calendarEntries }] = await Promise.all([
    import("@/db"),
    import("@/db/schema"),
  ]);
  return db
    .insert(calendarEntries)
    .values(values)
    .onConflictDoNothing({
      target: [calendarEntries.contentPlanId, calendarEntries.planItemId],
    })
    .returning();
};

/** Default lister — a user's entries, soonest scheduled date first. */
const defaultListEntries: CalendarEntryLister = async (userId) => {
  const [{ db }, { calendarEntries }, { asc, eq }] = await Promise.all([
    import("@/db"),
    import("@/db/schema"),
    import("drizzle-orm"),
  ]);
  return db
    .select()
    .from(calendarEntries)
    .where(eq(calendarEntries.userId, userId))
    .orderBy(asc(calendarEntries.date));
};

export const calendarService = new CalendarService();
