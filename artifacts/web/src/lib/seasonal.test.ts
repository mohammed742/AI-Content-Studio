/**
 * DEV-20: Unit tests for seasonal awareness (upcoming holidays).
 * Node built-in runner + native TS type-stripping (see PROGRESS.md → DEV-15).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { upcomingHolidays } from "./seasonal.ts";

// Feb 9 2026 (UTC) — 5 days before Valentine's Day.
const FEB_9 = new Date(Date.UTC(2026, 1, 9));

test("finds Valentine's Day 5 days out within a 21-day window", () => {
  const upcoming = upcomingHolidays(FEB_9, 21);
  assert.equal(upcoming[0].name, "Valentine's Day");
  assert.equal(upcoming[0].daysAway, 5);
});

test("excludes holidays beyond the window", () => {
  // St. Patrick's Day (Mar 17) is ~36 days from Feb 9 — outside 21.
  const upcoming = upcomingHolidays(FEB_9, 21);
  assert.ok(!upcoming.some((h) => h.name === "St. Patrick's Day"));
});

test("returns results sorted nearest-first", () => {
  // Dec 26 → New Year's Eve (Dec 31), then New Year's Day (Jan 1 next year).
  const dec26 = new Date(Date.UTC(2026, 11, 26));
  const upcoming = upcomingHolidays(dec26, 10);
  const names = upcoming.map((h) => h.name);
  assert.deepEqual(names.slice(0, 2), ["New Year's Eve", "New Year's Day"]);
  assert.equal(upcoming[1].daysAway, 6); // Jan 1 is 6 days after Dec 26
});

test("rolls a passed holiday over to next year", () => {
  const jan2 = new Date(Date.UTC(2026, 0, 2));
  assert.equal(upcomingHolidays(jan2, 5).length, 0); // Valentine's is 43 days out
  const wide = upcomingHolidays(jan2, 60);
  assert.ok(wide.some((h) => h.name === "Valentine's Day"));
});

test("includes a holiday that is today (0 days away)", () => {
  const feb14 = new Date(Date.UTC(2026, 1, 14));
  const upcoming = upcomingHolidays(feb14, 21);
  assert.equal(upcoming[0].name, "Valentine's Day");
  assert.equal(upcoming[0].daysAway, 0);
});
