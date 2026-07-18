/**
 * STU-C2: Unit tests for the text-graphic generation pipeline.
 *
 * Node built-in runner + native TS type-stripping (see PROGRESS.md → DEV-15).
 * The Muapi call and the retriever are injected as fakes, so prompt assembly
 * (exact display text quoted + layout guidance), routing (incl. the free-tier
 * override), and format→aspect-ratio handling verify without the network.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  TextGraphicService,
  buildTextGraphicPrompt,
  buildTextGraphicQuery,
  type TextGraphicRequest,
} from "./text-graphic.ts";
import { FORMAT_ASPECT_RATIOS, type MuapiGenerate, type GraphicRetriever } from "./social-graphic.ts";
import type { RetrievedChunk } from "./retrieval.ts";

function request(overrides: Partial<TextGraphicRequest> = {}): TextGraphicRequest {
  return {
    userId: "user-1",
    business: {
      businessName: "Blue Bottle",
      businessType: "restaurant",
      brandTone: "friendly",
      brandColors: ["#1d4ed8", "#f59e0b"],
      targetCustomers: "morning commuters",
    },
    topic: "daily specials",
    displayText: "2-for-1 lattes till Friday",
    contentType: "promo",
    ...overrides,
  };
}

function fakeMuapi(cost = 0.02) {
  const calls: Array<{ model: string; params: Record<string, unknown>; step?: string }> = [];
  const fn: MuapiGenerate = async (model, params, options) => {
    calls.push({ model, params: params as Record<string, unknown>, step: options?.step });
    return {
      outputs: ["https://img/text-graphic"],
      imageUrl: "https://img/text-graphic",
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

test("buildTextGraphicQuery and buildTextGraphicPrompt quote the exact text with layout guidance", () => {
  assert.match(buildTextGraphicQuery("daily specials", request().business), /Blue Bottle/);

  const prompt = buildTextGraphicPrompt(request(), "- house espresso blend");
  // The exact display text must appear verbatim, in quotes, for legible rendering.
  assert.match(prompt, /"2-for-1 lattes till Friday"/);
  // Layout + legibility guidance.
  assert.match(prompt, /legible/i);
  assert.match(prompt, /spelled correctly/i);
  // Brand conditioning carried over from the graphic pattern.
  assert.match(prompt, /friendly brand tone/);
  assert.match(prompt, /#1d4ed8, #f59e0b/);
  assert.match(prompt, /morning commuters/);
  assert.match(prompt, /Content style: promo/);
  assert.match(prompt, /Brand context:/);
});

test("default format is a 1:1 post; generation carries the aspect ratio and step", async () => {
  const muapi = fakeMuapi();
  const service = new TextGraphicService({ muapi: muapi.fn, retrieve: fakeRetrieve().fn });

  const result = await service.generate(request());

  assert.equal(result.format, "post");
  assert.equal(result.aspectRatio, "1:1");
  assert.equal(result.displayText, "2-for-1 lattes till Friday");
  assert.equal(muapi.calls[0].params.aspect_ratio, "1:1");
  assert.equal(muapi.calls[0].step, "execute:text_graphic");
});

test("story and banner map to their aspect ratios", async () => {
  for (const [format, ratio] of Object.entries(FORMAT_ASPECT_RATIOS)) {
    const muapi = fakeMuapi();
    const service = new TextGraphicService({ muapi: muapi.fn, retrieve: fakeRetrieve().fn });
    const result = await service.generate(
      request({ format: format as keyof typeof FORMAT_ASPECT_RATIOS }),
    );
    assert.equal(result.aspectRatio, ratio);
    assert.equal(muapi.calls[0].params.aspect_ratio, ratio);
  }
});

test("routes text_graphic through the free-tier override to nano-banana-2", async () => {
  const muapi = fakeMuapi();
  const service = new TextGraphicService({ muapi: muapi.fn, retrieve: fakeRetrieve().fn });

  const result = await service.generate(request());

  // Router returns ideogram-v3-t2i for text_graphic/standard → free-tier shim
  // collapses it to nano-banana-2 until the key is upgraded.
  assert.equal(result.model, "nano-banana-2");
  assert.equal(muapi.calls[0].model, "nano-banana-2");
});

test("premium tier resolves the text specialist before the shim", async () => {
  const muapi = fakeMuapi();
  // Identity resolveModel (no shim) proves the intended premium model is routed.
  const service = new TextGraphicService({
    muapi: muapi.fn,
    retrieve: fakeRetrieve().fn,
    resolveModel: (m) => m,
  });

  const result = await service.generate(request({ quality: "premium" }));

  assert.equal(result.model, "nano-banana-pro");
});

test("injects retrieved brand context into the prompt", async () => {
  const muapi = fakeMuapi();
  const retrieve = fakeRetrieve([
    { content: "single-origin espresso", kind: "product", similarity: 0.9 },
  ]);
  const service = new TextGraphicService({ muapi: muapi.fn, retrieve: retrieve.fn });

  await service.generate(request());

  assert.equal(retrieve.calls.length, 1);
  assert.match(String(muapi.calls[0].params.prompt), /single-origin espresso/);
});

test("propagates a Muapi failure", async () => {
  const failing: MuapiGenerate = async () => {
    throw new Error("muapi 500");
  };
  const service = new TextGraphicService({ muapi: failing, retrieve: fakeRetrieve().fn });

  await assert.rejects(() => service.generate(request()), /muapi 500/);
});
