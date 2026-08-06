/**
 * DEV-40: Unit tests for the Content Calendar data model.
 *
 * Node built-in runner + native TS type-stripping (see PROGRESS.md → DEV-15).
 * The core is the pure `deriveCalendarEntries` (plan items → dated entry rows):
 * weekday→date math, status mapping, and denormalization all verify without a
 * DB. `CalendarService` is exercised through injected db seams so persistence
 * (idempotent create + list) verifies with fakes.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  weekdayOffset,
  deriveCalendarEntries,
  CalendarService,
  type PlanForCalendar,
} from "./calendar.ts";
import type { ContentPlanItemRecord } from "@/db/schema";

// UTC Monday 2026-06-01 (matches `currentWeekStart`'s week anchor).
const WEEK_START = new Date(Date.UTC(2026, 5, 1));

function item(over: Partial<ContentPlanItemRecord> = {}): ContentPlanItemRecord {
  return {
    id: "item-1",
    type: "product_showcase",
    title: "Sunday roast promo",
    description: "A cozy promo shot",
    platform: "instagram",
    scheduledDay: "monday",
    estimatedCredits: 3,
    status: "pending",
    ...over,
  };
}

function plan(items: ContentPlanItemRecord[]): PlanForCalendar {
  return { id: "plan-1", userId: "user-1", weekStart: WEEK_START, items };
}

test("weekdayOffset maps monday..sunday to 0..6", () => {
  assert.equal(weekdayOffset("monday"), 0);
  assert.equal(weekdayOffset("tuesday"), 1);
  assert.equal(weekdayOffset("wednesday"), 2);
  assert.equal(weekdayOffset("thursday"), 3);
  assert.equal(weekdayOffset("friday"), 4);
  assert.equal(weekdayOffset("saturday"), 5);
  assert.equal(weekdayOffset("sunday"), 6);
});

test("weekdayOffset is case-insensitive and trims", () => {
  assert.equal(weekdayOffset("  Monday "), 0);
  assert.equal(weekdayOffset("FRIDAY"), 4);
});

test("weekdayOffset throws on an unknown day (fail-loud on bad data)", () => {
  assert.throws(() => weekdayOffset("someday"), /weekday/i);
});

test("deriveCalendarEntries places each item on week_start + weekday offset", () => {
  const entries = deriveCalendarEntries(
    plan([
      item({ id: "a", scheduledDay: "monday" }),
      item({ id: "b", scheduledDay: "sunday" }),
    ]),
  );
  assert.equal(entries.length, 2);
  // Monday → week_start itself.
  assert.equal(entries[0].date.toISOString(), "2026-06-01T00:00:00.000Z");
  // Sunday → +6 days.
  assert.equal(entries[1].date.toISOString(), "2026-06-07T00:00:00.000Z");
});

test("deriveCalendarEntries denormalizes plan-item fields and links back", () => {
  const [entry] = deriveCalendarEntries(
    plan([
      item({
        id: "item-42",
        type: "promo",
        title: "Flash sale",
        platform: "linkedin",
      }),
    ]),
  );
  assert.equal(entry.userId, "user-1");
  assert.equal(entry.contentPlanId, "plan-1");
  assert.equal(entry.planItemId, "item-42");
  assert.equal(entry.platform, "linkedin"); // free text, not the 3-value enum
  assert.equal(entry.contentType, "promo");
  assert.equal(entry.title, "Flash sale");
  assert.equal(entry.time, "09:00"); // default time-of-day
  assert.equal(entry.status, "planned");
  assert.equal(entry.assetKitId, null);
});

test("deriveCalendarEntries marks an already-generated item as 'generated'", () => {
  const [entry] = deriveCalendarEntries(
    plan([item({ status: "completed", assetKitId: "kit-9" })]),
  );
  assert.equal(entry.status, "generated");
  assert.equal(entry.assetKitId, "kit-9");
});

test("deriveCalendarEntries returns no entries for an empty plan", () => {
  assert.deepEqual(deriveCalendarEntries(plan([])), []);
});

test("createCalendarEntriesForPlan inserts the derived rows and returns them", async () => {
  const seen: unknown[] = [];
  const service = new CalendarService({
    insertEntries: async (values) => {
      seen.push(...values);
      // Simulate a fresh insert: all rows are new.
      return values.map((v, i) => ({ ...v, id: `row-${i}` }) as never);
    },
    listEntries: async () => [],
  });
  const rows = await service.createCalendarEntriesForPlan(
    plan([item({ id: "a" }), item({ id: "b", scheduledDay: "friday" })]),
  );
  assert.equal(seen.length, 2);
  assert.equal(rows.length, 2);
});

test("createCalendarEntriesForPlan skips the insert entirely for an empty plan", async () => {
  let called = false;
  const service = new CalendarService({
    insertEntries: async (values) => {
      called = true;
      return values as never;
    },
    listEntries: async () => [],
  });
  const rows = await service.createCalendarEntriesForPlan(plan([]));
  assert.equal(called, false);
  assert.deepEqual(rows, []);
});

test("listCalendarEntries delegates to the list seam", async () => {
  const service = new CalendarService({
    insertEntries: async (values) => values as never,
    listEntries: async (userId) => [{ id: "e1", userId } as never],
  });
  const rows = await service.listCalendarEntries("user-7");
  assert.equal(rows.length, 1);
  assert.equal((rows[0] as { userId: string }).userId, "user-7");
});
