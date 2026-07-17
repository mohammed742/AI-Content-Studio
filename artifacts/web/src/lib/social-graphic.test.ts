/**
 * DEV-21: Unit tests for the social media graphic generation pipeline.
 *
 * Node built-in runner + native TS type-stripping (see PROGRESS.md → DEV-15).
 * The Muapi call and the retriever are injected as fakes, so prompt assembly,
 * routing (incl. the free-tier override), and format→aspect-ratio handling
 * verify without the network.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  SocialGraphicService,
  buildGraphicPrompt,
  buildGraphicQuery,
  FORMAT_ASPECT_RATIOS,
  type MuapiGenerate,
  type GraphicRetriever,
  type SocialGraphicRequest,
} from "./social-graphic.ts";
import type { RetrievedChunk } from "./retrieval.ts";

function request(overrides: Partial<SocialGraphicRequest> = {}): SocialGraphicRequest {
  return {
    userId: "user-1",
    business: {
      businessName: "Tony's",
      businessType: "restaurant",
      brandTone: "friendly",
      brandColors: ["#e11d48", "#f59e0b"],
      targetCustomers: "local families",
    },
    topic: "Valentine's Day family pizza bundle",
    contentType: "promo",
    ...overrides,
  };
}

function fakeMuapi(cost = 0.03) {
  const calls: Array<{ model: string; params: Record<string, unknown>; step?: string }> = [];
  const fn: MuapiGenerate = async (model, params, options) => {
    calls.push({ model, params: params as Record<string, unknown>, step: options?.step });
    return {
      outputs: ["https://img/graphic"],
      imageUrl: "https://img/graphic",
      cost,
      model,
      requestId: "r",
    };
  };
  return { fn, calls };
}

function fakeRetrieve(chunks: RetrievedChunk[] = []): {
  fn: GraphicRetriever;
  calls: Array<{ userId: string; query: string; k: number }>;
} {
  const calls: Array<{ userId: string; query: string; k: number }> = [];
  const fn: GraphicRetriever = async (userId, query, k) => {
    calls.push({ userId, query, k });
    return chunks;
  };
  return { fn, calls };
}

test("buildGraphicQuery and buildGraphicPrompt include brand + topic + colors", () => {
  assert.match(buildGraphicQuery("promo", request().business), /Tony's/);

  const prompt = buildGraphicPrompt(request(), "- wood-fired pizza");
  assert.match(prompt, /Valentine's Day family pizza bundle/);
  assert.match(prompt, /friendly brand tone/);
  assert.match(prompt, /#e11d48, #f59e0b/);
  assert.match(prompt, /local families/);
  assert.match(prompt, /Content style: promo/);
  assert.match(prompt, /Brand context:/);
});

test("default format is a 1:1 post; generation carries the aspect ratio", async () => {
  const muapi = fakeMuapi();
  const service = new SocialGraphicService({ muapi: muapi.fn, retrieve: fakeRetrieve().fn });

  const result = await service.generate(request());

  assert.equal(result.format, "post");
  assert.equal(result.aspectRatio, "1:1");
  assert.equal(muapi.calls[0].params.aspect_ratio, "1:1");
  assert.equal(muapi.calls[0].step, "execute:social_graphic");
});

test("story and banner map to their aspect ratios", async () => {
  for (const [format, ratio] of Object.entries(FORMAT_ASPECT_RATIOS)) {
    const muapi = fakeMuapi();
    const service = new SocialGraphicService({ muapi: muapi.fn, retrieve: fakeRetrieve().fn });
    const result = await service.generate(
      request({ format: format as keyof typeof FORMAT_ASPECT_RATIOS }),
    );
    assert.equal(result.aspectRatio, ratio);
    assert.equal(muapi.calls[0].params.aspect_ratio, ratio);
  }
});

test("routes social_graphic through the free-tier override to nano-banana-2", async () => {
  const muapi = fakeMuapi();
  const service = new SocialGraphicService({ muapi: muapi.fn, retrieve: fakeRetrieve().fn });

  const result = await service.generate(request());

  // Router returns nano-banana-2 for social_graphic/standard → override keeps it.
  assert.equal(result.model, "nano-banana-2");
  assert.equal(muapi.calls[0].model, "nano-banana-2");
});

test("injects retrieved brand context into the prompt", async () => {
  const muapi = fakeMuapi();
  const retrieve = fakeRetrieve([
    { content: "wood-fired margherita", kind: "product", similarity: 0.9 },
  ]);
  const service = new SocialGraphicService({ muapi: muapi.fn, retrieve: retrieve.fn });

  await service.generate(request());

  assert.equal(retrieve.calls.length, 1);
  assert.match(String(muapi.calls[0].params.prompt), /wood-fired margherita/);
});

test("propagates a Muapi failure", async () => {
  const failing: MuapiGenerate = async () => {
    throw new Error("muapi 500");
  };
  const service = new SocialGraphicService({ muapi: failing, retrieve: fakeRetrieve().fn });

  await assert.rejects(() => service.generate(request()), /muapi 500/);
});
