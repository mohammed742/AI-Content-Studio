/**
 * DEV-27 (STU-23): Unit tests for the UGC script generation service.
 *
 * Node built-in runner + native TS type-stripping (see PROGRESS.md → DEV-15).
 * The LLM call and the retriever are injected as fakes, so prompt assembly,
 * spoken-text assembly, duration estimation, cost, and logging verify without
 * the network.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  UgcScriptService,
  buildScriptRetrievalQuery,
  buildScriptPrompt,
  assembleSpokenText,
  countWords,
  estimateSpokenSeconds,
  type ScriptLLM,
  type ScriptRetriever,
  type UgcScriptRequest,
} from "./ugc-script.ts";
import type { RetrievedChunk } from "./retrieval.ts";
import type { PipelineLogEntry } from "./muapi.ts";

function scriptRequest(overrides: Partial<UgcScriptRequest> = {}): UgcScriptRequest {
  return {
    userId: "user-1",
    business: {
      businessName: "GlowLab",
      businessType: "e-commerce",
      brandTone: "playful",
      targetCustomers: "skincare-obsessed millennials",
    },
    product: { name: "Overnight Glow Serum", description: "hydrating vitamin-C serum" },
    platform: "tiktok",
    ...overrides,
  };
}

/** Fake LLM whose segments total exactly 29 words. */
function fakeScriptLLM(cost = 0.0002): { fn: ScriptLLM; prompts: string[] } {
  const prompts: string[] = [];
  const fn: ScriptLLM = async (prompt) => {
    prompts.push(prompt);
    return {
      hook: "Okay I have to talk about this.",
      body: "This product genuinely changed my morning routine and I use it every single day now.",
      cta: "Grab yours today, you won't regret it.",
      cost,
    };
  };
  return { fn, prompts };
}

function fakeRetrieve(chunks: RetrievedChunk[] = []): {
  fn: ScriptRetriever;
  calls: Array<{ userId: string; query: string; k: number }>;
} {
  const calls: Array<{ userId: string; query: string; k: number }> = [];
  const fn: ScriptRetriever = async (userId, query, k) => {
    calls.push({ userId, query, k });
    return chunks;
  };
  return { fn, calls };
}

test("countWords counts whitespace-separated tokens, ignoring extra spaces", () => {
  assert.equal(countWords("  hello   world  "), 2);
  assert.equal(countWords(""), 0);
  assert.equal(countWords("one"), 1);
});

test("estimateSpokenSeconds converts word count at the speaking rate", () => {
  const twentyFive = Array.from({ length: 25 }, () => "word").join(" ");
  assert.equal(estimateSpokenSeconds(twentyFive), 10); // 25 / 2.5
  assert.equal(estimateSpokenSeconds(""), 0);
});

test("assembleSpokenText joins hook/body/cta in order, trimming and dropping blanks", () => {
  assert.equal(
    assembleSpokenText({ hook: "  Hey there. ", body: "Loved it.", cta: " Try it. " }),
    "Hey there. Loved it. Try it.",
  );
  assert.equal(
    assembleSpokenText({ hook: "Hook.", body: "   ", cta: "CTA." }),
    "Hook. CTA.",
  );
});

test("buildScriptRetrievalQuery surfaces the product and business", () => {
  const query = buildScriptRetrievalQuery(scriptRequest());
  assert.match(query, /Overnight Glow Serum/);
  assert.match(query, /GlowLab/);
  assert.match(query, /e-commerce/);
});

test("buildScriptPrompt includes product, brand tone, timing, structure, platform, and context", () => {
  const prompt = buildScriptPrompt(scriptRequest(), "- vitamin-C hydrating serum");
  assert.match(prompt, /Overnight Glow Serum/);
  assert.match(prompt, /Brand tone: playful/);
  assert.match(prompt, /15[\s-]second/i);
  assert.match(prompt, /hook/i);
  assert.match(prompt, /call to action|cta/i);
  assert.match(prompt, /tiktok/i);
  assert.match(prompt, /vitamin-C hydrating serum/);
});

test("generateScript assembles spoken text and derives word count + duration", async () => {
  const llm = fakeScriptLLM(0.0005);
  const retrieve = fakeRetrieve([
    { content: "Overnight Glow Serum — vitamin C", kind: "product", similarity: 0.9 },
  ]);
  const service = new UgcScriptService({ scriptLLM: llm.fn, retrieve: retrieve.fn });

  const result = await service.generateScript(scriptRequest());

  assert.equal(retrieve.calls.length, 1);
  assert.equal(retrieve.calls[0].userId, "user-1");
  assert.match(llm.prompts[0], /Overnight Glow Serum — vitamin C/);
  assert.equal(result.hook, "Okay I have to talk about this.");
  assert.equal(
    result.spokenText,
    "Okay I have to talk about this. This product genuinely changed my morning routine and I use it every single day now. Grab yours today, you won't regret it.",
  );
  assert.equal(result.wordCount, 29);
  assert.equal(result.estimatedSeconds, 12); // round(29 / 2.5)
  assert.equal(result.cost, 0.0005);
});

test("emits a success pipeline log entry for the script step", async () => {
  const entries: PipelineLogEntry[] = [];
  const service = new UgcScriptService({
    scriptLLM: fakeScriptLLM(0.0003).fn,
    retrieve: fakeRetrieve().fn,
    logger: (e) => entries.push(e),
  });

  await service.generateScript(scriptRequest());

  assert.equal(entries.length, 1);
  assert.equal(entries[0].step, "execute:ugc_script");
  assert.equal(entries[0].success, true);
  assert.equal(entries[0].model, "gpt-4.1-mini");
  assert.equal(entries[0].cost, 0.0003);
});

test("rethrows and logs a failure when the LLM throws", async () => {
  const entries: PipelineLogEntry[] = [];
  const failing: ScriptLLM = async () => {
    throw new Error("openai 429");
  };
  const service = new UgcScriptService({
    scriptLLM: failing,
    retrieve: fakeRetrieve().fn,
    logger: (e) => entries.push(e),
  });

  await assert.rejects(() => service.generateScript(scriptRequest()), /openai 429/);
  assert.equal(entries.length, 1);
  assert.equal(entries[0].success, false);
  assert.match(entries[0].error ?? "", /openai 429/);
});
