/**
 * DEV-20 / STU-C6: Seasonal awareness for the Content Planner.
 *
 * A curated list of fixed-date holidays and a helper to find which ones fall
 * within an upcoming window, so a plan built shortly before (say) Valentine's
 * Day proposes timely `seasonal` content (CONTEXT.md → "Seasonal Calendar").
 *
 * STU-C6 makes this region-aware (CONTEXT.md → "Region"): a `GLOBAL` set of
 * broadly-observed occasions is merged with a per-region set. `upcomingHolidays`
 * takes an optional `region` (default "US") — the Business Profile has no
 * region column yet (deferred), so callers pass the region explicitly and it
 * falls back to US. This keeps the seasonal data a single TS source of truth
 * rather than a parallel `data/holidays.json` (STU-C6 decision).
 *
 * Fixed-date holidays only — variable-date ones (Thanksgiving, Easter) are
 * intentionally omitted to keep this dependency-free and deterministic.
 */

/** Supported regions for seasonal awareness (CONTEXT.md → "Region"). */
export type Region = "US" | "UK" | "CA" | "AU";

export const REGIONS: readonly Region[] = ["US", "UK", "CA", "AU"];

export interface Holiday {
  name: string;
  /** 1-12 */
  month: number;
  /** 1-31 */
  day: number;
}

export interface UpcomingHoliday {
  name: string;
  /** The next occurrence date (this year or next). */
  date: Date;
  /** Whole days from `now` until the holiday (0 = today). */
  daysAway: number;
}

/** Occasions observed broadly across every supported region. */
const GLOBAL_HOLIDAYS: Holiday[] = [
  { name: "New Year's Day", month: 1, day: 1 },
  { name: "Valentine's Day", month: 2, day: 14 },
  { name: "Earth Day", month: 4, day: 22 },
  { name: "Halloween", month: 10, day: 31 },
  { name: "Christmas Eve", month: 12, day: 24 },
  { name: "Christmas Day", month: 12, day: 25 },
  { name: "New Year's Eve", month: 12, day: 31 },
];

/** Fixed-date occasions specific to each region (merged with the global set). */
const REGION_HOLIDAYS: Record<Region, Holiday[]> = {
  US: [
    { name: "St. Patrick's Day", month: 3, day: 17 },
    { name: "Independence Day", month: 7, day: 4 },
    { name: "Veterans Day", month: 11, day: 11 },
  ],
  UK: [
    { name: "St. Patrick's Day", month: 3, day: 17 },
    { name: "Guy Fawkes Night", month: 11, day: 5 },
    { name: "Boxing Day", month: 12, day: 26 },
  ],
  CA: [
    { name: "Canada Day", month: 7, day: 1 },
    { name: "Remembrance Day", month: 11, day: 11 },
    { name: "Boxing Day", month: 12, day: 26 },
  ],
  AU: [
    { name: "Australia Day", month: 1, day: 26 },
    { name: "Anzac Day", month: 4, day: 25 },
    { name: "Boxing Day", month: 12, day: 26 },
  ],
};

/**
 * The full holiday set for a region: the globally-observed occasions plus the
 * region's own, de-duplicated by name (region entries win). Order is irrelevant
 * — `upcomingHolidays` sorts its result.
 */
export function holidaysForRegion(region: Region): Holiday[] {
  const byName = new Map<string, Holiday>();
  for (const holiday of GLOBAL_HOLIDAYS) {
    byName.set(holiday.name, holiday);
  }
  for (const holiday of REGION_HOLIDAYS[region]) {
    byName.set(holiday.name, holiday);
  }
  return [...byName.values()];
}

/**
 * The US holiday set. Retained as a named export for backwards compatibility;
 * new callers should prefer `holidaysForRegion(region)`.
 */
export const HOLIDAYS: Holiday[] = holidaysForRegion("US");

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** Midnight UTC for a date, so day math ignores time-of-day. */
function atUtcMidnight(year: number, month: number, day: number): Date {
  return new Date(Date.UTC(year, month - 1, day));
}

/**
 * Return the holidays whose next occurrence falls within `windowDays` of
 * `now`, nearest first, for the given `region` (default "US"). Each holiday
 * rolls over to next year if this year's date has already passed.
 */
export function upcomingHolidays(
  now: Date,
  windowDays: number,
  region: Region = "US",
): UpcomingHoliday[] {
  const today = atUtcMidnight(
    now.getUTCFullYear(),
    now.getUTCMonth() + 1,
    now.getUTCDate(),
  );
  const year = today.getUTCFullYear();

  const result: UpcomingHoliday[] = [];
  for (const holiday of holidaysForRegion(region)) {
    let date = atUtcMidnight(year, holiday.month, holiday.day);
    if (date.getTime() < today.getTime()) {
      date = atUtcMidnight(year + 1, holiday.month, holiday.day);
    }
    const daysAway = Math.round((date.getTime() - today.getTime()) / MS_PER_DAY);
    if (daysAway <= windowDays) {
      result.push({ name: holiday.name, date, daysAway });
    }
  }

  return result.sort((a, b) => a.daysAway - b.daysAway);
}
