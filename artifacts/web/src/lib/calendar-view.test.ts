/**
 * DEV-41: Unit tests for the Content Calendar view model.
 *
 * Node built-in runner + native TS type-stripping (see PROGRESS.md → DEV-15).
 * Everything the calendar page renders is derived by pure functions here, so
 * the grid math, UTC handling, entry grouping, and content-type colour mapping
 * verify without React or a DB (the repo has no component-test setup — all
 * tests are pure `src/lib/` logic).
 *
 * The load-bearing rule under test: Calendar Entries are stored at **UTC
 * midnight** (DEV-40), so every grid computation is UTC. Building the grid in
 * local time would shift entries a day for users behind UTC.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  toDateKey,
  parseDateKey,
  mondayOf,
  startOfMonth,
  shiftMonth,
  addDays,
  groupEntriesByDay,
  buildMonthGrid,
  buildWeekGrid,
  contentTypeMeta,
  entryStatusMeta,
  FAMILY_META,
  formatMonthLabel,
  formatWeekLabel,
  type CalendarEntryView,
} from "./calendar-view.ts";

/** UTC Monday 2026-06-01 — the same week anchor `calendar.test.ts` uses. */
const WEEK_START = new Date(Date.UTC(2026, 5, 1));

function entry(over: Partial<CalendarEntryView> = {}): CalendarEntryView {
  return {
    id: "entry-1",
    title: "Sunday roast promo",
    platform: "instagram",
    contentType: "product_showcase",
    status: "planned",
    date: "2026-06-01T00:00:00.000Z",
    time: "09:00",
    assetKitId: null,
    ...over,
  };
}

test("toDateKey formats a UTC YYYY-MM-DD, zero-padded", () => {
  assert.equal(toDateKey(new Date(Date.UTC(2026, 5, 1))), "2026-06-01");
  assert.equal(toDateKey(new Date(Date.UTC(2026, 10, 25))), "2026-11-25");
});

test("toDateKey reads UTC, not local time", () => {
  // 23:30 UTC is already the *next* day in UTC+2 and the same day in UTC-5.
  // The key must follow UTC so it matches how entries are stored.
  assert.equal(toDateKey(new Date("2026-06-01T23:30:00.000Z")), "2026-06-01");
  assert.equal(toDateKey(new Date("2026-06-01T00:30:00.000Z")), "2026-06-01");
});

test("parseDateKey returns UTC midnight", () => {
  assert.equal(
    parseDateKey("2026-06-15").toISOString(),
    "2026-06-15T00:00:00.000Z",
  );
});

test("parseDateKey rejects malformed input (fail loud on a bad drop target)", () => {
  assert.throws(() => parseDateKey("15-06-2026"), /date/i);
  assert.throws(() => parseDateKey("2026-13-01"), /date/i);
  assert.throws(() => parseDateKey(""), /date/i);
});

test("mondayOf returns the UTC Monday of the containing week", () => {
  // 2026-06-01 is itself a Monday → identity.
  assert.equal(mondayOf(WEEK_START).toISOString(), "2026-06-01T00:00:00.000Z");
  // Thursday 2026-06-04 → back to the 1st.
  assert.equal(
    mondayOf(new Date(Date.UTC(2026, 5, 4))).toISOString(),
    "2026-06-01T00:00:00.000Z",
  );
  // Sunday 2026-06-07 → back to the 1st (Sunday ends the week, not starts it).
  assert.equal(
    mondayOf(new Date(Date.UTC(2026, 5, 7))).toISOString(),
    "2026-06-01T00:00:00.000Z",
  );
});

test("mondayOf strips the time component", () => {
  assert.equal(
    mondayOf(new Date("2026-06-04T18:45:00.000Z")).toISOString(),
    "2026-06-01T00:00:00.000Z",
  );
});

test("startOfMonth returns the 1st at UTC midnight", () => {
  assert.equal(
    startOfMonth(new Date("2026-06-17T12:00:00.000Z")).toISOString(),
    "2026-06-01T00:00:00.000Z",
  );
});

test("shiftMonth moves whole months without day-overflow drift", () => {
  const jan31 = new Date(Date.UTC(2026, 0, 31));
  // Naive setMonth(+1) on the 31st rolls into March. Anchoring on the 1st can't.
  assert.equal(shiftMonth(jan31, 1).toISOString(), "2026-02-01T00:00:00.000Z");
  assert.equal(shiftMonth(jan31, -1).toISOString(), "2025-12-01T00:00:00.000Z");
  // Year boundaries both ways.
  assert.equal(
    shiftMonth(new Date(Date.UTC(2026, 11, 5)), 1).toISOString(),
    "2027-01-01T00:00:00.000Z",
  );
});

test("addDays crosses month and year boundaries in UTC", () => {
  assert.equal(
    addDays(new Date(Date.UTC(2026, 5, 30)), 1).toISOString(),
    "2026-07-01T00:00:00.000Z",
  );
  assert.equal(
    addDays(new Date(Date.UTC(2026, 11, 31)), 1).toISOString(),
    "2027-01-01T00:00:00.000Z",
  );
  assert.equal(
    addDays(new Date(Date.UTC(2026, 5, 1)), -1).toISOString(),
    "2026-05-31T00:00:00.000Z",
  );
});

test("groupEntriesByDay buckets by UTC day, ignoring time-of-day", () => {
  const grouped = groupEntriesByDay([
    entry({ id: "a", date: "2026-06-01T00:00:00.000Z" }),
    entry({ id: "b", date: "2026-06-01T21:00:00.000Z" }),
    entry({ id: "c", date: "2026-06-03T00:00:00.000Z" }),
  ]);
  assert.deepEqual(
    grouped.get("2026-06-01")?.map((e) => e.id),
    ["a", "b"],
  );
  assert.deepEqual(
    grouped.get("2026-06-03")?.map((e) => e.id),
    ["c"],
  );
  assert.equal(grouped.get("2026-06-02"), undefined);
});

test("buildMonthGrid starts each row on Monday and covers the whole month", () => {
  // June 2026: the 1st IS a Monday, 30 days → exactly 5 rows.
  const weeks = buildMonthGrid(WEEK_START, [], WEEK_START);
  assert.equal(weeks.length, 5);
  for (const week of weeks) {
    assert.equal(week.length, 7);
  }
  assert.equal(weeks[0][0].key, "2026-06-01");
  // Last cell of the last row is the Sunday closing the final week.
  assert.equal(weeks[4][6].key, "2026-07-05");
});

test("buildMonthGrid back-fills leading days from the previous month", () => {
  // July 2026 starts on a Wednesday → the row leads with Mon 29 + Tue 30 June.
  const weeks = buildMonthGrid(new Date(Date.UTC(2026, 6, 1)), [], WEEK_START);
  assert.equal(weeks[0][0].key, "2026-06-29");
  assert.equal(weeks[0][0].inCurrentMonth, false);
  assert.equal(weeks[0][2].key, "2026-07-01");
  assert.equal(weeks[0][2].inCurrentMonth, true);
  assert.equal(weeks[0][2].dayOfMonth, 1);
});

test("buildMonthGrid attaches each entry to its day cell", () => {
  const weeks = buildMonthGrid(
    WEEK_START,
    [
      entry({ id: "a", date: "2026-06-01T00:00:00.000Z" }),
      entry({ id: "b", date: "2026-06-01T00:00:00.000Z" }),
      entry({ id: "c", date: "2026-06-10T00:00:00.000Z" }),
    ],
    WEEK_START,
  );
  assert.deepEqual(weeks[0][0].entries.map((e) => e.id), ["a", "b"]);
  assert.deepEqual(weeks[0][1].entries, []);
  // 2026-06-10 is the Wednesday of row 2.
  assert.deepEqual(weeks[1][2].entries.map((e) => e.id), ["c"]);
});

test("buildMonthGrid marks exactly one cell as today", () => {
  const today = new Date("2026-06-10T14:00:00.000Z");
  const weeks = buildMonthGrid(WEEK_START, [], today);
  const todayCells = weeks.flat().filter((d) => d.isToday);
  assert.equal(todayCells.length, 1);
  assert.equal(todayCells[0].key, "2026-06-10");
});

test("buildMonthGrid marks no cell as today when today is another month", () => {
  const weeks = buildMonthGrid(WEEK_START, [], new Date("2026-09-10T00:00:00.000Z"));
  assert.equal(weeks.flat().filter((d) => d.isToday).length, 0);
});

test("buildWeekGrid returns 7 Monday-first days with entries attached", () => {
  const days = buildWeekGrid(
    new Date("2026-06-04T09:00:00.000Z"), // a Thursday — snaps back to Monday
    [entry({ id: "a", date: "2026-06-07T00:00:00.000Z" })],
    WEEK_START,
  );
  assert.equal(days.length, 7);
  assert.equal(days[0].key, "2026-06-01");
  assert.equal(days[6].key, "2026-06-07");
  assert.deepEqual(days[6].entries.map((e) => e.id), ["a"]);
  // Every day of a week grid belongs to the view, so none are greyed out.
  assert.ok(days.every((d) => d.inCurrentMonth));
});

test("contentTypeMeta follows the generation routing for its colour family", () => {
  // Mirrors generation-queue routing: product_showcase → photo pipeline,
  // ugc_ad → video (Phase 3), everything else → social graphic.
  assert.equal(contentTypeMeta("product_showcase").family, "photo");
  assert.equal(contentTypeMeta("ugc_ad").family, "video");
  assert.equal(contentTypeMeta("tip").family, "graphic");
  assert.equal(contentTypeMeta("promo").family, "graphic");
  assert.equal(contentTypeMeta("seasonal").family, "graphic");
});

test("contentTypeMeta gives every content type a human label and a family", () => {
  for (const type of [
    "product_showcase",
    "tip",
    "behind_the_scenes",
    "promo",
    "testimonial",
    "ugc_ad",
    "seasonal",
    "engagement",
  ] as const) {
    const meta = contentTypeMeta(type);
    assert.ok(meta.label.length > 0, `${type} needs a label`);
    // Every family must have legend wording, or the dot has no key.
    assert.ok(FAMILY_META[meta.family], `${type} needs a known family`);
    // No raw enum values leak to the user (agent-driven paradigm).
    assert.ok(!meta.label.includes("_"), `${type} label must be humanized`);
  }
});

test("contentTypeMeta carries no Tailwind classes", () => {
  // Colours belong to the component layer: tailwind.config.ts doesn't scan
  // src/lib, so a class string here would never be generated and the dot
  // would silently render colourless. Regression guard for that bug.
  const meta = contentTypeMeta("tip") as unknown as Record<string, unknown>;
  assert.equal(meta.dotClass, undefined);
  for (const family of ["photo", "graphic", "video"] as const) {
    assert.deepEqual(Object.keys(FAMILY_META[family]), ["label"]);
  }
});

test("contentTypeMeta falls back rather than throwing on an unknown type", () => {
  // content_type is a DB enum, but a future value must not blank the calendar.
  const meta = contentTypeMeta("something_new" as never);
  assert.ok(meta.label.length > 0);
  assert.equal(meta.family, "graphic");
});

test("entryStatusMeta labels every status in the flow without leaking enums", () => {
  assert.equal(entryStatusMeta("planned").label, "Planned");
  assert.equal(entryStatusMeta("generated").tone, "success");
  assert.equal(entryStatusMeta("scheduled").label, "Scheduled");
  assert.equal(entryStatusMeta("published").tone, "success");
  assert.equal(entryStatusMeta("failed").tone, "danger");
});

test("entryStatusMeta falls back for an unknown status", () => {
  const meta = entryStatusMeta("weird" as never);
  assert.ok(meta.label.length > 0);
  assert.equal(meta.tone, "pending");
});

test("formatMonthLabel renders the month in UTC", () => {
  assert.equal(formatMonthLabel(WEEK_START), "June 2026");
  // Late-UTC-day timestamps must not roll into the next month.
  assert.equal(formatMonthLabel(new Date("2026-06-30T23:30:00.000Z")), "June 2026");
});

test("formatWeekLabel renders the Monday–Sunday span", () => {
  assert.equal(formatWeekLabel(WEEK_START), "Jun 1 – 7, 2026");
});

test("formatWeekLabel spans months and years", () => {
  // Mon 2026-06-29 → Sun 2026-07-05.
  assert.equal(
    formatWeekLabel(new Date(Date.UTC(2026, 5, 29))),
    "Jun 29 – Jul 5, 2026",
  );
  // Mon 2026-12-28 → Sun 2027-01-03.
  assert.equal(
    formatWeekLabel(new Date(Date.UTC(2026, 11, 28))),
    "Dec 28, 2026 – Jan 3, 2027",
  );
});
