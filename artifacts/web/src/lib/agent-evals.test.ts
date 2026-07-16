/**
 * DEV-25: Unit tests for Agent Evals.
 * Node built-in runner + native TS type-stripping (see PROGRESS.md → DEV-15).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  scorePlanQuality,
  aggregateFeedback,
  summarizeInsights,
  aggregateReliability,
  AgentEvalsService,
  MIN_PLAN_SCORE,
  type ScorableItem,
  type FeedbackRow,
  type LogRow,
} from "./agent-evals.ts";

function diversePlan(): ScorableItem[] {
  return [
    { type: "product_showcase", title: "Pizza", platform: "instagram", scheduledDay: "monday" },
    { type: "behind_the_scenes", title: "Kitchen", platform: "tiktok", scheduledDay: "tuesday" },
    { type: "promo", title: "Deal", platform: "instagram", scheduledDay: "wednesday" },
    { type: "testimonial", title: "Review", platform: "tiktok", scheduledDay: "thursday" },
    { type: "seasonal", title: "Valentine", platform: "instagram", scheduledDay: "friday" },
  ];
}

test("scorePlanQuality: a diverse, well-spread plan scores high (>= MIN)", () => {
  const score = scorePlanQuality(diversePlan());
  assert.ok(score >= MIN_PLAN_SCORE, `expected >= ${MIN_PLAN_SCORE}, got ${score}`);
  assert.ok(score <= 100);
});

test("scorePlanQuality: a monotonous plan scores low (< MIN)", () => {
  const dull: ScorableItem[] = Array.from({ length: 5 }, () => ({
    type: "product_showcase",
    title: "Same Thing",
    platform: "instagram",
    scheduledDay: "monday",
  }));
  assert.ok(scorePlanQuality(dull) < MIN_PLAN_SCORE);
});

test("scorePlanQuality: empty plan scores 0", () => {
  assert.equal(scorePlanQuality([]), 0);
});

test("aggregateFeedback tallies up/down and like rate per type", () => {
  const rows: FeedbackRow[] = [
    { contentType: "product_showcase", rating: "up" },
    { contentType: "product_showcase", rating: "up" },
    { contentType: "product_showcase", rating: "down" },
    { contentType: "promo", rating: "down" },
  ];
  const byType = aggregateFeedback(rows);
  assert.equal(byType.product_showcase.up, 2);
  assert.equal(byType.product_showcase.total, 3);
  assert.ok(Math.abs(byType.product_showcase.likeRate - 2 / 3) < 1e-9);
  assert.equal(byType.promo.likeRate, 0);
});

test("summarizeInsights names best + worst types above the signal threshold", () => {
  const summary = summarizeInsights({
    product_showcase: { up: 9, down: 1, total: 10, likeRate: 0.9 },
    promo: { up: 4, down: 6, total: 10, likeRate: 0.4 },
    tip: { up: 1, down: 0, total: 1, likeRate: 1 }, // below MIN_RATINGS — ignored
  });
  assert.match(summary, /product_showcase content \(90% liked\)/);
  assert.match(summary, /promo \(40% liked\)/);
  assert.doesNotMatch(summary, /tip/); // filtered by signal threshold
});

test("summarizeInsights returns empty string with no significant data", () => {
  assert.equal(summarizeInsights({}), "");
  assert.equal(
    summarizeInsights({ tip: { up: 1, down: 0, total: 1, likeRate: 1 } }),
    "",
  );
});

test("aggregateReliability computes per-step + overall metrics", () => {
  const rows: LogRow[] = [
    { step: "execute", success: true, durationMs: 100, cost: 0.05 },
    { step: "execute", success: false, durationMs: 300, cost: 0 },
    { step: "plan", success: true, durationMs: 500, cost: 0.001 },
  ];
  const r = aggregateReliability(rows);
  assert.equal(r.totalRuns, 3);
  assert.ok(Math.abs(r.overallSuccessRate - 2 / 3) < 1e-9);
  assert.equal(r.byStep.execute.count, 2);
  assert.equal(r.byStep.execute.successRate, 0.5);
  assert.equal(r.byStep.execute.avgDurationMs, 200);
  assert.ok(Math.abs(r.byStep.execute.totalCost - 0.05) < 1e-9);
  assert.equal(r.byStep.plan.successRate, 1);
});

test("getPerformanceInsights composes fetch + aggregate + summarize", async () => {
  const service = new AgentEvalsService({
    fetchFeedback: async () => [
      { contentType: "product_showcase", rating: "up" },
      { contentType: "product_showcase", rating: "up" },
    ],
  });
  const insights = await service.getPerformanceInsights("user-1");
  assert.equal(insights.hasData, true);
  assert.equal(insights.byType.product_showcase.total, 2);
  assert.match(insights.summary, /product_showcase/);
});

test("getPerformanceInsights is empty when there is no feedback", async () => {
  const service = new AgentEvalsService({ fetchFeedback: async () => [] });
  const insights = await service.getPerformanceInsights("user-1");
  assert.equal(insights.hasData, false);
  assert.equal(insights.summary, "");
});

test("getPipelineReliability composes fetch + aggregate", async () => {
  const service = new AgentEvalsService({
    fetchLogs: async () => [
      { step: "plan", success: true, durationMs: 200, cost: 0.001 },
    ],
  });
  const r = await service.getPipelineReliability();
  assert.equal(r.totalRuns, 1);
  assert.equal(r.byStep.plan.successRate, 1);
});
