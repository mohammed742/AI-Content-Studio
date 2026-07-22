/**
 * DEV-20: Unit tests for seasonal awareness (upcoming holidays).
 * Node built-in runner + native TS type-stripping (see PROGRESS.md → DEV-15).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { upcomingHolidays, holidaysForRegion } from "./seasonal.ts";

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

// --- STU-C6: region awareness ---

test("holidaysForRegion(US) merges global + US-specific holidays", () => {
  const us = holidaysForRegion("US").map((h) => h.name);
  // Global occasion present in every region.
  assert.ok(us.includes("Christmas Day"));
  // US-specific.
  assert.ok(us.includes("Independence Day"));
  assert.ok(us.includes("Veterans Day"));
  // No holiday appears twice.
  assert.equal(new Set(us).size, us.length);
});

test("region-specific holidays don't leak across regions", () => {
  const au = holidaysForRegion("AU").map((h) => h.name);
  assert.ok(au.includes("Australia Day"));
  assert.ok(au.includes("Anzac Day"));
  assert.ok(!au.includes("Independence Day")); // US-only
  // Global occasions still present.
  assert.ok(au.includes("New Year's Day"));
});

test("upcomingHolidays surfaces region-specific holidays for that region", () => {
  // Jan 20 2026 → Australia Day (Jan 26) is 6 days out.
  const jan20 = new Date(Date.UTC(2026, 0, 20));
  const au = upcomingHolidays(jan20, 21, "AU");
  const auDay = au.find((h) => h.name === "Australia Day");
  assert.ok(auDay);
  assert.equal(auDay.daysAway, 6);
  // The same window for the US surfaces no Australia Day.
  const us = upcomingHolidays(jan20, 21, "US");
  assert.ok(!us.some((h) => h.name === "Australia Day"));
});

test("region defaults to US when omitted", () => {
  const withDefault = upcomingHolidays(FEB_9, 21);
  const explicitUs = upcomingHolidays(FEB_9, 21, "US");
  assert.deepEqual(
    withDefault.map((h) => h.name),
    explicitUs.map((h) => h.name),
  );
});
