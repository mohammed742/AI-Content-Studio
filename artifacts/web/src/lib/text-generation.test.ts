/**
 * DEV-22: Unit tests for the text generation service (captions, ad copy).
 *
 * Node built-in runner + native TS type-stripping (see PROGRESS.md → DEV-15).
 * The LLM calls and the retriever are injected as fakes, so prompt assembly,
 * hashtag normalization, cost, and logging verify without the network.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  TextGenerationService,
  buildCaptionPrompt,
  buildAdCopyPrompt,
  normalizeHashtags,
  type CaptionLLM,
  type AdCopyLLM,
  type TextRetriever,
  type CaptionRequest,
} from "./text-generation.ts";
import type { RetrievedChunk } from "./retrieval.ts";
import type { PipelineLogEntry } from "./muapi.ts";

function captionRequest(overrides: Partial<CaptionRequest> = {}): CaptionRequest {
  return {
    userId: "user-1",
    business: {
      businessName: "Tony's",
      businessType: "restaurant",
      brandTone: "friendly",
      targetCustomers: "local families",
    },
    topic: "wood-fired margherita pizza fresh from the oven",
    platform: "instagram",
    contentType: "product_showcase",
    ...overrides,
  };
}

function fakeCaptionLLM(cost = 0.0001): { fn: CaptionLLM; prompts: string[] } {
  const prompts: string[] = [];
  const fn: CaptionLLM = async (prompt) => {
    prompts.push(prompt);
    return {
      caption: "Fresh from the oven 🍕",
      hashtags: ["#pizza", "pizza", "  ", "foodie", "#Foodie", "eatlocal"],
      cost,
    };
  };
  return { fn, prompts };
}

function fakeAdCopyLLM(cost = 0.0001): { fn: AdCopyLLM; prompts: string[] } {
  const prompts: string[] = [];
  const fn: AdCopyLLM = async (prompt) => {
    prompts.push(prompt);
    return { headline: "Pizza night, solved", body: "Wood-fired and family-sized.", cta: "Order now", cost };
  };
  return { fn, prompts };
}

function fakeRetrieve(chunks: RetrievedChunk[] = []): {
  fn: TextRetriever;
  calls: Array<{ userId: string; query: string; k: number }>;
} {
  const calls: Array<{ userId: string; query: string; k: number }> = [];
  const fn: TextRetriever = async (userId, query, k) => {
    calls.push({ userId, query, k });
    return chunks;
  };
  return { fn, calls };
}

test("normalizeHashtags strips '#', drops blanks and case-insensitive dupes, caps at 10", () => {
  assert.deepEqual(
    normalizeHashtags(["#pizza", "pizza", " ", "foodie", "#Foodie", "eatlocal"]),
    ["pizza", "foodie", "eatlocal"],
  );
  const many = Array.from({ length: 15 }, (_, i) => `tag${i}`);
  assert.equal(normalizeHashtags(many).length, 10);
});

test("prompt builders include topic, brand, platform, and retrieved context", () => {
  const captionPrompt = buildCaptionPrompt(captionRequest(), "- wood-fired oven");
  assert.match(captionPrompt, /margherita pizza/);
  assert.match(captionPrompt, /Brand tone: friendly/);
  assert.match(captionPrompt, /instagram caption/);
  assert.match(captionPrompt, /Content style: product_showcase/);
  assert.match(captionPrompt, /wood-fired oven/);

  const adPrompt = buildAdCopyPrompt(
    { userId: "u", business: captionRequest().business, topic: "family pizza bundle" },
    "- ctx",
  );
  assert.match(adPrompt, /family pizza bundle/);
  assert.match(adPrompt, /headline/);
  assert.match(adPrompt, /call-to-action/);
});

test("generateCaption retrieves context and returns normalized hashtags", async () => {
  const llm = fakeCaptionLLM(0.0003);
  const retrieve = fakeRetrieve([
    { content: "Margherita Pizza — wood-fired", kind: "product", similarity: 0.9 },
  ]);
  const service = new TextGenerationService({ captionLLM: llm.fn, retrieve: retrieve.fn });

  const result = await service.generateCaption(captionRequest());

  assert.equal(retrieve.calls.length, 1);
  assert.equal(retrieve.calls[0].userId, "user-1");
  assert.match(llm.prompts[0], /Margherita Pizza — wood-fired/);
  assert.equal(result.caption, "Fresh from the oven 🍕");
  assert.deepEqual(result.hashtags, ["pizza", "foodie", "eatlocal"]);
  assert.equal(result.cost, 0.0003);
});

test("generateAdCopy returns headline/body/cta with brand-conditioned prompt", async () => {
  const llm = fakeAdCopyLLM();
  const service = new TextGenerationService({
    adCopyLLM: llm.fn,
    retrieve: fakeRetrieve([{ content: "wood-fired", kind: "product", similarity: 0.8 }]).fn,
  });

  const result = await service.generateAdCopy({
    userId: "user-1",
    business: captionRequest().business,
    topic: "family pizza bundle",
  });

  assert.match(llm.prompts[0], /wood-fired/);
  assert.equal(result.headline, "Pizza night, solved");
  assert.equal(result.cta, "Order now");
});

test("emits success pipeline log entries per operation", async () => {
  const entries: PipelineLogEntry[] = [];
  const service = new TextGenerationService({
    captionLLM: fakeCaptionLLM().fn,
    adCopyLLM: fakeAdCopyLLM().fn,
    retrieve: fakeRetrieve().fn,
    logger: (e) => entries.push(e),
  });

  await service.generateCaption(captionRequest());
  await service.generateAdCopy({
    userId: "user-1",
    business: captionRequest().business,
    topic: "bundle",
  });

  assert.deepEqual(
    entries.map((e) => [e.step, e.success]),
    [
      ["execute:caption", true],
      ["execute:ad_copy", true],
    ],
  );
  assert.equal(entries[0].model, "gpt-4.1-mini");
});

test("rethrows and logs a failure when the LLM throws", async () => {
  const entries: PipelineLogEntry[] = [];
  const failing: CaptionLLM = async () => {
    throw new Error("openai 429");
  };
  const service = new TextGenerationService({
    captionLLM: failing,
    retrieve: fakeRetrieve().fn,
    logger: (e) => entries.push(e),
  });

  await assert.rejects(() => service.generateCaption(captionRequest()), /openai 429/);
  assert.equal(entries.length, 1);
  assert.equal(entries[0].success, false);
  assert.match(entries[0].error ?? "", /openai 429/);
});
