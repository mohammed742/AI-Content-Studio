/**
 * DEV-20: Seasonal awareness for the Content Planner.
 *
 * A curated list of fixed-date holidays and a helper to find which ones fall
 * within an upcoming window, so a plan built shortly before (say) Valentine's
 * Day proposes timely `seasonal` content (CONTEXT.md → "Seasonal Calendar").
 *
 * Fixed-date holidays only — variable-date ones (Thanksgiving, Easter) are
 * intentionally omitted to keep this dependency-free and deterministic. No
 * `region` field exists on the Business Profile yet (DEV-9), so this is a US
 * default set; a future slice can make it region-aware.
 */

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

export const HOLIDAYS: Holiday[] = [
  { name: "New Year's Day", month: 1, day: 1 },
  { name: "Valentine's Day", month: 2, day: 14 },
  { name: "St. Patrick's Day", month: 3, day: 17 },
  { name: "Earth Day", month: 4, day: 22 },
  { name: "Independence Day", month: 7, day: 4 },
  { name: "Halloween", month: 10, day: 31 },
  { name: "Veterans Day", month: 11, day: 11 },
  { name: "Christmas Eve", month: 12, day: 24 },
  { name: "Christmas Day", month: 12, day: 25 },
  { name: "New Year's Eve", month: 12, day: 31 },
];

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** Midnight UTC for a date, so day math ignores time-of-day. */
function atUtcMidnight(year: number, month: number, day: number): Date {
  return new Date(Date.UTC(year, month - 1, day));
}

/**
 * Return the holidays whose next occurrence falls within `windowDays` of
 * `now`, nearest first. Each holiday rolls over to next year if this year's
 * date has already passed.
 */
export function upcomingHolidays(
  now: Date,
  windowDays: number,
  holidays: Holiday[] = HOLIDAYS,
): UpcomingHoliday[] {
  const today = atUtcMidnight(
    now.getUTCFullYear(),
    now.getUTCMonth() + 1,
    now.getUTCDate(),
  );
  const year = today.getUTCFullYear();

  const result: UpcomingHoliday[] = [];
  for (const holiday of holidays) {
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
