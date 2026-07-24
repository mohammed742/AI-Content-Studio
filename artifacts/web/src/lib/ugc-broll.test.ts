/**
 * DEV-30 (STU-26): Unit tests for the UGC product B-roll service.
 *
 * Node built-in runner + native TS type-stripping (see PROGRESS.md → DEV-15).
 * The Muapi call is injected as a fake, so input validation, param assembly
 * (verified against `kling-v2.1-standard-i2v`'s live input schema), routing, and
 * result/cost mapping verify without the network.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  UgcBrollService,
  buildBrollParams,
  resolveAspectRatio,
  resolveDuration,
  BROLL_ASPECT_RATIOS,
  BROLL_DURATIONS,
  DEFAULT_ASPECT_RATIO,
  DEFAULT_DURATION,
  DEFAULT_MOTION_PROMPT,
  type MuapiGenerate,
} from "./ugc-broll.ts";

const PRODUCT = "https://cdn/product.jpg";

function fakeMuapi(result: Partial<{ imageUrl: string; cost: number }> = {}) {
  const calls: Array<{ model: string; params: Record<string, unknown>; step?: string }> = [];
  const fn: MuapiGenerate = async (model, params, options) => {
    calls.push({ model, params: params as Record<string, unknown>, step: options?.step });
    return {
      outputs: [result.imageUrl ?? "https://cdn/broll.mp4"],
      imageUrl: result.imageUrl ?? "https://cdn/broll.mp4",
      cost: result.cost ?? 0.225,
      model,
      requestId: "r",
    };
  };
  return { fn, calls };
}

test("BROLL_ASPECT_RATIOS / BROLL_DURATIONS are unique and their defaults are members", () => {
  assert.equal(new Set(BROLL_ASPECT_RATIOS).size, BROLL_ASPECT_RATIOS.length);
  assert.ok((BROLL_ASPECT_RATIOS as readonly string[]).includes(DEFAULT_ASPECT_RATIO));
  assert.equal(new Set(BROLL_DURATIONS).size, BROLL_DURATIONS.length);
  assert.ok((BROLL_DURATIONS as readonly number[]).includes(DEFAULT_DURATION));
});

test("resolveAspectRatio defaults, accepts supported values, and rejects unknown ones", () => {
  assert.equal(resolveAspectRatio(), DEFAULT_ASPECT_RATIO);
  assert.equal(resolveAspectRatio("9:16"), "9:16");
  assert.equal(resolveAspectRatio("1:1"), "1:1");
  assert.throws(() => resolveAspectRatio("4:3"), /Unsupported B-roll aspect ratio/);
});

test("resolveDuration defaults, accepts supported values, and rejects unknown ones", () => {
  assert.equal(resolveDuration(), DEFAULT_DURATION);
  assert.equal(resolveDuration(10), 10);
  assert.throws(() => resolveDuration(7), /Unsupported B-roll duration/);
});

test("buildBrollParams maps to image_url + prompt + aspect_ratio + duration (defaults)", () => {
  const params = buildBrollParams({ productImageUrl: `  ${PRODUCT}  ` });
  assert.equal(params.image_url, PRODUCT);
  assert.equal(params.prompt, DEFAULT_MOTION_PROMPT);
  assert.equal(params.aspect_ratio, DEFAULT_ASPECT_RATIO);
  assert.equal(params.duration, DEFAULT_DURATION);
});

test("buildBrollParams honors a chosen prompt, aspect ratio, and duration", () => {
  const params = buildBrollParams({
    productImageUrl: PRODUCT,
    prompt: "  slow cinematic dolly-in on the sneaker  ",
    aspectRatio: "9:16",
    duration: 10,
  });
  assert.equal(params.prompt, "slow cinematic dolly-in on the sneaker");
  assert.equal(params.aspect_ratio, "9:16");
  assert.equal(params.duration, 10);
});

test("buildBrollParams falls back to the default prompt on a blank prompt", () => {
  const params = buildBrollParams({ productImageUrl: PRODUCT, prompt: "   " });
  assert.equal(params.prompt, DEFAULT_MOTION_PROMPT);
});

test("buildBrollParams rejects a missing/non-http product image, and bad aspect/duration", () => {
  assert.throws(() => buildBrollParams({ productImageUrl: "  " }), /product/i);
  assert.throws(() => buildBrollParams({ productImageUrl: "not-a-url" }), /product/i);
  assert.throws(() => buildBrollParams({ productImageUrl: "ftp://x" }), /product/i);
  assert.throws(
    () => buildBrollParams({ productImageUrl: PRODUCT, aspectRatio: "3:2" }),
    /Unsupported B-roll aspect ratio/,
  );
  assert.throws(
    () => buildBrollParams({ productImageUrl: PRODUCT, duration: 3 }),
    /Unsupported B-roll duration/,
  );
});

test("generateBroll routes to kling-v2.1-standard-i2v, sends the inputs, and maps the result", async () => {
  const muapi = fakeMuapi({ imageUrl: "https://cdn/clip.mp4", cost: 0.22 });
  const service = new UgcBrollService({ muapi: muapi.fn });

  const result = await service.generateBroll({ productImageUrl: PRODUCT });

  assert.equal(muapi.calls.length, 1);
  assert.equal(muapi.calls[0].model, "kling-v2.1-standard-i2v");
  assert.equal(muapi.calls[0].step, "execute:ugc_broll");
  assert.equal(muapi.calls[0].params.image_url, PRODUCT);
  assert.equal(muapi.calls[0].params.prompt, DEFAULT_MOTION_PROMPT);
  assert.equal(muapi.calls[0].params.aspect_ratio, DEFAULT_ASPECT_RATIO);
  assert.equal(muapi.calls[0].params.duration, DEFAULT_DURATION);
  assert.equal(result.videoUrl, "https://cdn/clip.mp4");
  assert.equal(result.cost, 0.22);
  assert.equal(result.model, "kling-v2.1-standard-i2v");
  assert.equal(result.aspectRatio, DEFAULT_ASPECT_RATIO);
  assert.equal(result.duration, DEFAULT_DURATION);
});

test("generateBroll honors a chosen aspect ratio and duration", async () => {
  const muapi = fakeMuapi();
  const service = new UgcBrollService({ muapi: muapi.fn });

  const result = await service.generateBroll({
    productImageUrl: PRODUCT,
    aspectRatio: "1:1",
    duration: 10,
  });

  assert.equal(result.aspectRatio, "1:1");
  assert.equal(result.duration, 10);
  assert.equal(muapi.calls[0].params.aspect_ratio, "1:1");
  assert.equal(muapi.calls[0].params.duration, 10);
});

test("generateBroll routes premium to kling-v2.1-pro-i2v", async () => {
  const muapi = fakeMuapi();
  const service = new UgcBrollService({ muapi: muapi.fn });

  const result = await service.generateBroll({ productImageUrl: PRODUCT, quality: "premium" });

  assert.equal(muapi.calls[0].model, "kling-v2.1-pro-i2v");
  assert.equal(result.model, "kling-v2.1-pro-i2v");
});

test("generateBroll rejects invalid inputs before calling Muapi", async () => {
  const muapi = fakeMuapi();
  const service = new UgcBrollService({ muapi: muapi.fn });

  await assert.rejects(
    () => service.generateBroll({ productImageUrl: "nope" }),
    /product/i,
  );
  assert.equal(muapi.calls.length, 0, "must not call Muapi on invalid inputs");
});

test("generateBroll propagates a Muapi failure", async () => {
  const failing: MuapiGenerate = async () => {
    throw new Error("muapi 500");
  };
  const service = new UgcBrollService({ muapi: failing });

  await assert.rejects(
    () => service.generateBroll({ productImageUrl: PRODUCT }),
    /muapi 500/,
  );
});
