/**
 * DEV-20: Unit tests for the Content Plan Proposal engine.
 *
 * Node built-in runner + native TS type-stripping (see PROGRESS.md → DEV-15).
 * The LLM and the RAG retriever are injected as fakes and the clock is fixed,
 * so prompt assembly, normalization, and item clamping verify without the
 * network or DB.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  ContentPlannerService,
  buildRetrievalQuery,
  buildPlannerPrompt,
  normalizeItems,
  type PlannableProfile,
  type ProposedItem,
  type PlanGenerator,
  type PlanRetriever,
} from "./content-planner.ts";
import { INDUSTRY_TEMPLATES } from "./industry-templates.ts";
import type { RetrievedChunk } from "./retrieval.ts";
import type { PipelineLogEntry } from "./muapi.ts";

const FEB_9 = new Date(Date.UTC(2026, 1, 9)); // 5 days before Valentine's

function profile(overrides: Partial<PlannableProfile> = {}): PlannableProfile {
  return {
    businessName: "Tony's Trattoria",
    businessType: "restaurant",
    brandTone: "friendly",
    targetCustomers: "local families",
    products: [{ name: "Margherita Pizza", description: "wood-fired" }],
    socialPlatforms: ["instagram", "tiktok"],
    ...overrides,
  };
}

function sixItems(): ProposedItem[] {
  const days = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday"] as const;
  return days.map((day, i) => ({
    type: i === 0 ? "seasonal" : "product_showcase",
    title: `Item ${i}`,
    description: `Description ${i}`,
    platform: "instagram",
    scheduledDay: day,
  }));
}

function fakeGenerate(items: ProposedItem[], cost = 0.0002): {
  fn: PlanGenerator;
  prompts: string[];
} {
  const prompts: string[] = [];
  const fn: PlanGenerator = async (prompt) => {
    prompts.push(prompt);
    return { items, cost };
  };
  return { fn, prompts };
}

function fakeRetrieve(chunks: RetrievedChunk[] = []): {
  fn: PlanRetriever;
  calls: Array<{ userId: string; query: string; k: number }>;
} {
  const calls: Array<{ userId: string; query: string; k: number }> = [];
  const fn: PlanRetriever = async (userId, query, k) => {
    calls.push({ userId, query, k });
    return chunks;
  };
  return { fn, calls };
}

test("proposePlan accepts the first plan when it scores at/above the threshold", async () => {
  const generate = fakeGenerate(sixItems());
  const service = new ContentPlannerService({
    generate: generate.fn,
    retrieve: fakeRetrieve().fn,
    now: () => FEB_9,
    scorePlan: () => 80,
  });

  const plan = await service.proposePlan("user-1", profile());

  assert.equal(generate.prompts.length, 1); // no regenerate
  assert.equal(plan.score, 80);
});

test("proposePlan regenerates below the threshold and keeps the best score", async () => {
  const generate = fakeGenerate(sixItems());
  const scores = [40, 90];
  let i = 0;
  const service = new ContentPlannerService({
    generate: generate.fn,
    retrieve: fakeRetrieve().fn,
    now: () => FEB_9,
    scorePlan: () => scores[i++],
    maxAttempts: 2,
  });

  const plan = await service.proposePlan("user-1", profile());

  assert.equal(generate.prompts.length, 2); // regenerated once
  assert.equal(plan.score, 90); // best of the two
  assert.ok(Math.abs(plan.cost - 0.0004) < 1e-9); // both attempts' cost summed
});

test("proposePlan stops at maxAttempts and returns the best low-scoring plan", async () => {
  const generate = fakeGenerate(sixItems());
  const service = new ContentPlannerService({
    generate: generate.fn,
    retrieve: fakeRetrieve().fn,
    now: () => FEB_9,
    scorePlan: () => 30,
    maxAttempts: 2,
  });

  const plan = await service.proposePlan("user-1", profile());

  assert.equal(generate.prompts.length, 2); // exhausted attempts
  assert.equal(plan.score, 30);
});

test("proposePlan injects performance insights into the prompt", async () => {
  const generate = fakeGenerate(sixItems());
  const service = new ContentPlannerService({
    generate: generate.fn,
    retrieve: fakeRetrieve().fn,
    now: () => FEB_9,
    scorePlan: () => 80,
  });

  await service.proposePlan("user-1", profile(), {
    performanceInsights: "Your audience loves product_showcase content.",
  });

  assert.match(generate.prompts[0], /audience loves product_showcase/);
});

test("buildRetrievalQuery includes the business, audience, and upcoming holidays", () => {
  const q = buildRetrievalQuery(profile(), [
    { name: "Valentine's Day", date: new Date(), daysAway: 5 },
  ]);
  assert.match(q, /Tony's Trattoria/);
  assert.match(q, /local families/);
  assert.match(q, /Valentine's Day/);
});

test("buildPlannerPrompt embeds strategy, platforms, context, and holidays", () => {
  const prompt = buildPlannerPrompt({
    profile: profile(),
    strategy: INDUSTRY_TEMPLATES.restaurant,
    context: "- Margherita Pizza — wood-fired",
    holidays: [{ name: "Valentine's Day", date: new Date(), daysAway: 5 }],
  });
  assert.match(prompt, /instagram, tiktok/);
  assert.match(prompt, /Margherita Pizza/);
  assert.match(prompt, /Valentine's Day \(in 5 days\)/);
  assert.match(prompt, /between 5 and 7 content items/);
});

test("proposePlan retrieves context, prompts the LLM, and returns normalized items", async () => {
  const generate = fakeGenerate(sixItems());
  const retrieve = fakeRetrieve([
    { content: "Margherita Pizza — wood-fired", kind: "product", similarity: 0.9 },
  ]);
  const service = new ContentPlannerService({
    generate: generate.fn,
    retrieve: retrieve.fn,
    now: () => FEB_9,
  });

  const plan = await service.proposePlan("user-1", profile());

  // Retrieval happened with a business-derived query.
  assert.equal(retrieve.calls.length, 1);
  assert.equal(retrieve.calls[0].userId, "user-1");
  assert.match(retrieve.calls[0].query, /Tony's Trattoria/);
  // The prompt saw the retrieved context + the in-window holiday.
  assert.match(generate.prompts[0], /Margherita Pizza/);
  assert.match(generate.prompts[0], /Valentine's Day/);
  // Result normalized.
  assert.equal(plan.items.length, 6);
  assert.equal(plan.cost, 0.0002);
  for (const item of plan.items) {
    assert.equal(item.estimatedCredits, 1);
    assert.ok(["instagram", "tiktok"].includes(item.platform));
  }
});

test("normalizeItems caps at 7 items", () => {
  const many: ProposedItem[] = Array.from({ length: 10 }, (_, i) => ({
    type: "product_showcase",
    title: `t${i}`,
    description: `d${i}`,
    platform: "instagram",
    scheduledDay: "monday",
  }));
  assert.equal(normalizeItems(many, profile()).length, 7);
});

test("normalizeItems drops unknown content types", () => {
  const items = [
    { type: "product_showcase", title: "ok", description: "d", platform: "instagram", scheduledDay: "monday" },
    { type: "meme_dump" as unknown as ProposedItem["type"], title: "bad", description: "d", platform: "instagram", scheduledDay: "tuesday" },
  ] as ProposedItem[];
  const out = normalizeItems(items, profile());
  assert.equal(out.length, 1);
  assert.equal(out[0].title, "ok");
});

test("normalizeItems snaps an unlisted platform to one the business uses", () => {
  const items: ProposedItem[] = [
    { type: "promo", title: "t", description: "d", platform: "linkedin", scheduledDay: "friday" },
  ];
  const out = normalizeItems(items, profile({ socialPlatforms: ["instagram"] }));
  assert.equal(out[0].platform, "instagram");
});

test("emits a success pipeline log entry", async () => {
  const entries: PipelineLogEntry[] = [];
  const service = new ContentPlannerService({
    generate: fakeGenerate(sixItems()).fn,
    retrieve: fakeRetrieve().fn,
    now: () => FEB_9,
    logger: (e) => entries.push(e),
  });

  await service.proposePlan("user-1", profile());

  assert.equal(entries.length, 1);
  assert.equal(entries[0].step, "plan");
  assert.equal(entries[0].model, "gpt-4.1-mini");
  assert.equal(entries[0].success, true);
});

test("rethrows and logs a failure when the LLM throws", async () => {
  const entries: PipelineLogEntry[] = [];
  const failing: PlanGenerator = async () => {
    throw new Error("llm timeout");
  };
  const service = new ContentPlannerService({
    generate: failing,
    retrieve: fakeRetrieve().fn,
    now: () => FEB_9,
    logger: (e) => entries.push(e),
  });

  await assert.rejects(() => service.proposePlan("user-1", profile()), /llm timeout/);
  assert.equal(entries.length, 1);
  assert.equal(entries[0].success, false);
  assert.match(entries[0].error ?? "", /llm timeout/);
});
