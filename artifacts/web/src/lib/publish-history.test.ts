/**
 * DEV-39 (STU-36): Unit tests for the Publishing History display helpers.
 *
 * Node built-in runner + native TS type-stripping (see PROGRESS.md → DEV-15).
 * These are pure functions — status summary counts, the relative-time
 * formatter (deterministic given an injected `now`), and the status → badge
 * metadata map — so the history table's logic verifies without a DOM.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  summarizePublishJobs,
  formatRelativeTime,
  statusMeta,
} from "./publish-history.ts";

test("summarizePublishJobs counts by bucket (in-progress folds pending+processing)", () => {
  const summary = summarizePublishJobs([
    { status: "completed" },
    { status: "completed" },
    { status: "failed" },
    { status: "processing" },
    { status: "pending" },
  ]);
  assert.deepEqual(summary, {
    total: 5,
    published: 2,
    failed: 1,
    inProgress: 2,
  });
});

test("summarizePublishJobs is all-zero for an empty list", () => {
  assert.deepEqual(summarizePublishJobs([]), {
    total: 0,
    published: 0,
    failed: 0,
    inProgress: 0,
  });
});

test("formatRelativeTime returns 'just now' under a minute", () => {
  const now = new Date("2026-08-02T12:00:30Z");
  assert.equal(formatRelativeTime("2026-08-02T12:00:00Z", now), "just now");
});

test("formatRelativeTime uses minutes, hours, then days", () => {
  const now = new Date("2026-08-02T12:00:00Z");
  assert.equal(formatRelativeTime("2026-08-02T11:55:00Z", now), "5m ago");
  assert.equal(formatRelativeTime("2026-08-02T09:00:00Z", now), "3h ago");
  assert.equal(formatRelativeTime("2026-07-31T12:00:00Z", now), "2d ago");
});

test("formatRelativeTime falls back to an absolute date past a week", () => {
  const now = new Date("2026-08-02T12:00:00Z");
  // 10 days earlier → absolute date, not "10d ago".
  const out = formatRelativeTime("2026-07-23T12:00:00Z", now);
  assert.match(out, /Jul/);
  assert.doesNotMatch(out, /ago/);
});

test("formatRelativeTime guards a future/clock-skew timestamp as 'just now'", () => {
  const now = new Date("2026-08-02T12:00:00Z");
  assert.equal(formatRelativeTime("2026-08-02T12:00:10Z", now), "just now");
});

test("formatRelativeTime returns em dash for an unparseable input", () => {
  assert.equal(formatRelativeTime("not-a-date", new Date()), "—");
});

test("statusMeta maps each status to a label + tone", () => {
  assert.deepEqual(statusMeta("completed"), { label: "Published", tone: "success" });
  assert.deepEqual(statusMeta("failed"), { label: "Failed", tone: "danger" });
  assert.deepEqual(statusMeta("processing"), {
    label: "Processing",
    tone: "pending",
  });
  assert.deepEqual(statusMeta("pending"), { label: "Pending", tone: "pending" });
});
