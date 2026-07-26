/**
 * DEV-32 (STU-27): Unit tests for the UGC video assembly service.
 *
 * Node built-in runner + native TS type-stripping (see PROGRESS.md → DEV-15).
 * The Muapi call is injected as a fake, so input validation, param assembly
 * (verified against `video-combiner`'s live input schema), routing, and
 * result/cost mapping verify without the network.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  UgcAssemblyService,
  buildAssemblyParams,
  resolveAspectRatio,
  resolveClips,
  ASSEMBLY_ASPECT_RATIOS,
  DEFAULT_ASPECT_RATIO,
  MAX_CLIPS,
  type MuapiGenerate,
} from "./ugc-assembly.ts";

const CLIP_A = "https://cdn/talking-head.mp4";
const CLIP_B = "https://cdn/broll.mp4";
const CLIP_C = "https://cdn/cta.mp4";

function fakeMuapi(result: Partial<{ imageUrl: string; cost: number }> = {}) {
  const calls: Array<{ model: string; params: Record<string, unknown>; step?: string }> = [];
  const fn: MuapiGenerate = async (model, params, options) => {
    calls.push({ model, params: params as Record<string, unknown>, step: options?.step });
    return {
      outputs: [result.imageUrl ?? "https://cdn/master.mp4"],
      imageUrl: result.imageUrl ?? "https://cdn/master.mp4",
      cost: result.cost ?? 0.05,
      model,
      requestId: "r",
    };
  };
  return { fn, calls };
}

test("ASSEMBLY_ASPECT_RATIOS is unique and the default is a member", () => {
  assert.equal(new Set(ASSEMBLY_ASPECT_RATIOS).size, ASSEMBLY_ASPECT_RATIOS.length);
  assert.ok((ASSEMBLY_ASPECT_RATIOS as readonly string[]).includes(DEFAULT_ASPECT_RATIO));
  assert.equal(DEFAULT_ASPECT_RATIO, "auto");
});

test("resolveAspectRatio defaults, accepts supported values, and rejects unknown ones", () => {
  assert.equal(resolveAspectRatio(), DEFAULT_ASPECT_RATIO);
  assert.equal(resolveAspectRatio("16:9"), "16:9");
  assert.equal(resolveAspectRatio("9:16"), "9:16");
  assert.equal(resolveAspectRatio("21:9"), "21:9");
  assert.throws(() => resolveAspectRatio("5:4"), /Unsupported assembly aspect ratio/);
});

test("resolveClips accepts 2..MAX http(s) clips and trims them", () => {
  assert.deepEqual(resolveClips([`  ${CLIP_A}  `, CLIP_B]), [CLIP_A, CLIP_B]);
  assert.equal(resolveClips(Array(MAX_CLIPS).fill(CLIP_A)).length, MAX_CLIPS);
});

test("resolveClips rejects too few, too many, and non-http clips", () => {
  assert.throws(() => resolveClips([CLIP_A]), /at least 2 clips/);
  assert.throws(() => resolveClips([]), /at least 2 clips/);
  assert.throws(() => resolveClips(undefined), /at least 2 clips/);
  assert.throws(() => resolveClips(Array(MAX_CLIPS + 1).fill(CLIP_A)), /at most 20 clips/);
  assert.throws(() => resolveClips([CLIP_A, "  "]), /clip 2/i);
  assert.throws(() => resolveClips([CLIP_A, "not-a-url"]), /clip 2/i);
  assert.throws(() => resolveClips(["ftp://x", CLIP_B]), /clip 1/i);
});

test("buildAssemblyParams maps to videos_list (ordered) + aspect_ratio (default)", () => {
  const params = buildAssemblyParams({ clips: [CLIP_A, CLIP_B, CLIP_C] });
  assert.deepEqual(params.videos_list, [CLIP_A, CLIP_B, CLIP_C]);
  assert.equal(params.aspect_ratio, DEFAULT_ASPECT_RATIO);
});

test("buildAssemblyParams honors a chosen aspect ratio and preserves clip order", () => {
  const params = buildAssemblyParams({
    clips: [CLIP_C, CLIP_A, CLIP_B],
    aspectRatio: "16:9",
  });
  assert.deepEqual(params.videos_list, [CLIP_C, CLIP_A, CLIP_B]);
  assert.equal(params.aspect_ratio, "16:9");
});

test("buildAssemblyParams rejects too-few clips and a bad aspect ratio", () => {
  assert.throws(() => buildAssemblyParams({ clips: [CLIP_A] }), /at least 2 clips/);
  assert.throws(
    () => buildAssemblyParams({ clips: [CLIP_A, CLIP_B], aspectRatio: "2:1" }),
    /Unsupported assembly aspect ratio/,
  );
});

test("assembleVideo routes to video-combiner, sends the clips, and maps the result", async () => {
  const muapi = fakeMuapi({ imageUrl: "https://cdn/final.mp4", cost: 0.05 });
  const service = new UgcAssemblyService({ muapi: muapi.fn });

  const result = await service.assembleVideo({ clips: [CLIP_A, CLIP_B, CLIP_C] });

  assert.equal(muapi.calls.length, 1);
  assert.equal(muapi.calls[0].model, "video-combiner");
  assert.equal(muapi.calls[0].step, "execute:ugc_assembly");
  assert.deepEqual(muapi.calls[0].params.videos_list, [CLIP_A, CLIP_B, CLIP_C]);
  assert.equal(muapi.calls[0].params.aspect_ratio, DEFAULT_ASPECT_RATIO);
  assert.equal(result.videoUrl, "https://cdn/final.mp4");
  assert.equal(result.cost, 0.05);
  assert.equal(result.model, "video-combiner");
  assert.equal(result.aspectRatio, DEFAULT_ASPECT_RATIO);
  assert.equal(result.clipCount, 3);
});

test("assembleVideo honors a chosen aspect ratio", async () => {
  const muapi = fakeMuapi();
  const service = new UgcAssemblyService({ muapi: muapi.fn });

  const result = await service.assembleVideo({
    clips: [CLIP_A, CLIP_B],
    aspectRatio: "9:16",
  });

  assert.equal(result.aspectRatio, "9:16");
  assert.equal(result.clipCount, 2);
  assert.equal(muapi.calls[0].params.aspect_ratio, "9:16");
});

test("assembleVideo routes premium to video-combiner (single-tier fallback)", async () => {
  const muapi = fakeMuapi();
  const service = new UgcAssemblyService({ muapi: muapi.fn });

  const result = await service.assembleVideo({
    clips: [CLIP_A, CLIP_B],
    quality: "premium",
  });

  assert.equal(muapi.calls[0].model, "video-combiner");
  assert.equal(result.model, "video-combiner");
});

test("assembleVideo rejects invalid inputs before calling Muapi", async () => {
  const muapi = fakeMuapi();
  const service = new UgcAssemblyService({ muapi: muapi.fn });

  await assert.rejects(
    () => service.assembleVideo({ clips: [CLIP_A] }),
    /at least 2 clips/,
  );
  assert.equal(muapi.calls.length, 0, "must not call Muapi on invalid inputs");
});

test("assembleVideo propagates a Muapi failure", async () => {
  const failing: MuapiGenerate = async () => {
    throw new Error("muapi 500");
  };
  const service = new UgcAssemblyService({ muapi: failing });

  await assert.rejects(
    () => service.assembleVideo({ clips: [CLIP_A, CLIP_B] }),
    /muapi 500/,
  );
});
