/**
 * DEV-19: Unit tests for the product photo generation pipeline.
 *
 * Node built-in runner + native TS type-stripping (see PROGRESS.md → DEV-15).
 * The Muapi call and the retriever are injected as fakes, so the step
 * sequence, model routing, prompt, cost aggregation, and optional-step
 * skipping verify without the network.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  ProductPhotoService,
  buildPhotoQuery,
  buildScenePrompt,
  type MuapiGenerate,
  type PhotoRetriever,
  type ProductPhotoRequest,
} from "./product-photo.ts";
import type { RetrievedChunk } from "./retrieval.ts";

function request(overrides: Partial<ProductPhotoRequest> = {}): ProductPhotoRequest {
  return {
    userId: "user-1",
    product: { name: "Margherita Pizza", description: "wood-fired" },
    business: {
      businessName: "Tony's",
      businessType: "restaurant",
      brandTone: "friendly",
      targetCustomers: "local families",
    },
    ...overrides,
  };
}

function fakeMuapi(costs: Record<string, number> = {}) {
  const calls: Array<{ model: string; params: Record<string, unknown>; step?: string }> = [];
  const fn: MuapiGenerate = async (model, params, options) => {
    const step = options?.step ?? "?";
    calls.push({ model, params: params as Record<string, unknown>, step });
    const cost = costs[step] ?? 0.05;
    return {
      outputs: [`https://img/${step}`],
      imageUrl: `https://img/${step}`,
      cost,
      model,
      requestId: "r",
    };
  };
  return { fn, calls };
}

function fakeRetrieve(chunks: RetrievedChunk[] = []): {
  fn: PhotoRetriever;
  calls: Array<{ userId: string; query: string; k: number }>;
} {
  const calls: Array<{ userId: string; query: string; k: number }> = [];
  const fn: PhotoRetriever = async (userId, query, k) => {
    calls.push({ userId, query, k });
    return chunks;
  };
  return { fn, calls };
}

test("buildPhotoQuery and buildScenePrompt include product + brand details", () => {
  const q = buildPhotoQuery(request().product, request().business);
  assert.match(q, /Margherita Pizza — wood-fired/);
  assert.match(q, /Tony's/);

  const prompt = buildScenePrompt(request().product, request().business, "- some context");
  assert.match(prompt, /Margherita Pizza/);
  assert.match(prompt, /friendly brand aesthetic/);
  assert.match(prompt, /local families/);
  assert.match(prompt, /Brand context:/);
});

test("minimal pipeline: retrieve → scene, routed model flows through untouched", async () => {
  const muapi = fakeMuapi();
  const retrieve = fakeRetrieve([
    { content: "Margherita Pizza — wood-fired", kind: "product", similarity: 0.9 },
  ]);
  const service = new ProductPhotoService({ muapi: muapi.fn, retrieve: retrieve.fn });

  // `ai-product-shot` is Image-to-Image, so a source photo is mandatory.
  const result = await service.generate(
    request({ sourceImageUrl: "https://upload/orig.png" }),
  );

  assert.equal(retrieve.calls.length, 1);
  // bg removal, then the scene.
  assert.equal(muapi.calls.length, 2);
  assert.equal(muapi.calls[1].step, "execute:product_photo");
  assert.equal(muapi.calls[1].model, "ai-product-shot"); // routed model, no shim
  // The model's required field is `scene_description`, NOT `prompt` — sending
  // `prompt` is what produced the live 422 that failed every product_showcase.
  assert.match(String(muapi.calls[1].params.scene_description), /Margherita Pizza/);
  assert.match(String(muapi.calls[1].params.scene_description), /Brand context:/);
  assert.equal(muapi.calls[1].params.prompt, undefined);
  assert.equal(result.model, "ai-product-shot");
  assert.equal(result.imageUrl, "https://img/execute:product_photo");
  assert.deepEqual(result.reframes, []);
  assert.equal(result.steps.length, 2);
});

test("generate fails loud without a source image (ai-product-shot is img2img)", async () => {
  const muapi = fakeMuapi();
  const service = new ProductPhotoService({
    muapi: muapi.fn,
    retrieve: fakeRetrieve().fn,
  });

  // Regression: this used to submit `{prompt}` with no `image_url` and come
  // back as an opaque Muapi 422. Fail before spending a call instead.
  await assert.rejects(
    () => service.generate(request()),
    /product image is required/i,
  );
  assert.equal(muapi.calls.length, 0);
});

test("full pipeline: bg removal feeds the scene, then reframes; costs aggregate", async () => {
  const muapi = fakeMuapi({
    "execute:bg_removal": 0.01,
    "execute:product_photo": 0.06,
    "execute:reframe": 0.05,
  });
  const service = new ProductPhotoService({ muapi: muapi.fn, retrieve: fakeRetrieve().fn });

  const result = await service.generate(
    request({ sourceImageUrl: "https://upload/orig.png", aspectRatios: ["9:16", "1:1"] }),
  );

  // Order: bg_removal, product_photo, reframe, reframe
  assert.deepEqual(
    muapi.calls.map((c) => c.step),
    ["execute:bg_removal", "execute:product_photo", "execute:reframe", "execute:reframe"],
  );
  // bg removal output is fed into the scene call as `image_url` (the field
  // `ai-product-shot` actually requires — `image` was silently ignored).
  assert.equal(muapi.calls[0].params.image, "https://upload/orig.png");
  assert.equal(muapi.calls[1].params.image_url, "https://img/execute:bg_removal");
  // reframes reference the scene image + carry the aspect ratio.
  assert.equal(muapi.calls[2].params.image, "https://img/execute:product_photo");
  assert.equal(muapi.calls[2].params.aspect_ratio, "9:16");
  assert.equal(result.reframes.length, 2);
  assert.deepEqual(result.reframes.map((r) => r.aspectRatio), ["9:16", "1:1"]);
  assert.equal(result.steps.length, 4);
  // 0.01 + 0.06 + 0.05 + 0.05
  assert.ok(Math.abs(result.cost - 0.17) < 1e-9);
});

test("always runs background removal on the supplied product photo", async () => {
  const muapi = fakeMuapi();
  const service = new ProductPhotoService({ muapi: muapi.fn, retrieve: fakeRetrieve().fn });

  await service.generate(request({ sourceImageUrl: "https://upload/orig.png" }));

  // The photo is now mandatory, so bg removal is no longer conditional.
  assert.ok(muapi.calls.some((c) => c.step === "execute:bg_removal"));
});

test("propagates a Muapi failure", async () => {
  const failing: MuapiGenerate = async () => {
    throw new Error("muapi 500");
  };
  const service = new ProductPhotoService({ muapi: failing, retrieve: fakeRetrieve().fn });

  await assert.rejects(
    () => service.generate(request({ sourceImageUrl: "https://upload/orig.png" })),
    /muapi 500/,
  );
});
