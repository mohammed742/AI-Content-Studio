/**
 * DEV-31 (STU-28): Unit tests for the UGC multi-format reframe service.
 *
 * Node built-in runner + native TS type-stripping (see PROGRESS.md → DEV-15).
 * The Muapi call is injected as a fake, so input validation, param assembly
 * (verified against `autocrop`'s live input schema), routing, the per-format
 * fan-out, and result/cost mapping verify without the network.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  UgcReframeService,
  buildReframeParams,
  resolveAspectRatio,
  resolveSegment,
  REFRAME_ASPECT_RATIOS,
  DEFAULT_ASPECT_RATIO,
  DEFAULT_START_TIME,
  DEFAULT_END_TIME,
  UGC_TARGET_FORMATS,
  type MuapiGenerate,
} from "./ugc-reframe.ts";

const MASTER = "https://cdn/master.mp4";

function fakeMuapi(result: Partial<{ imageUrl: string; cost: number }> = {}) {
  const calls: Array<{ model: string; params: Record<string, unknown>; step?: string }> = [];
  const fn: MuapiGenerate = async (model, params, options) => {
    calls.push({ model, params: params as Record<string, unknown>, step: options?.step });
    return {
      outputs: [result.imageUrl ?? "https://cdn/reframed.mp4"],
      imageUrl: result.imageUrl ?? "https://cdn/reframed.mp4",
      cost: result.cost ?? 0.05,
      model,
      requestId: "r",
    };
  };
  return { fn, calls };
}

test("REFRAME_ASPECT_RATIOS is unique and the default is a member", () => {
  assert.equal(new Set(REFRAME_ASPECT_RATIOS).size, REFRAME_ASPECT_RATIOS.length);
  assert.ok((REFRAME_ASPECT_RATIOS as readonly string[]).includes(DEFAULT_ASPECT_RATIO));
  assert.equal(DEFAULT_ASPECT_RATIO, "9:16");
});

test("UGC_TARGET_FORMATS are the plan's three formats and all supported", () => {
  assert.deepEqual(UGC_TARGET_FORMATS, ["9:16", "1:1", "16:9"]);
  for (const f of UGC_TARGET_FORMATS) {
    assert.ok((REFRAME_ASPECT_RATIOS as readonly string[]).includes(f), `${f} unsupported`);
  }
});

test("resolveAspectRatio defaults, accepts supported values, and rejects unknown ones", () => {
  assert.equal(resolveAspectRatio(), DEFAULT_ASPECT_RATIO);
  assert.equal(resolveAspectRatio("16:9"), "16:9");
  assert.equal(resolveAspectRatio("1:1"), "1:1");
  assert.equal(resolveAspectRatio("4:5"), "4:5");
  assert.throws(() => resolveAspectRatio("21:9"), /Unsupported reframe aspect ratio/);
  assert.throws(() => resolveAspectRatio("auto"), /Unsupported reframe aspect ratio/);
});

test("resolveSegment defaults, accepts a valid window, and validates bounds", () => {
  assert.deepEqual(resolveSegment(), { start_time: DEFAULT_START_TIME, end_time: DEFAULT_END_TIME });
  assert.deepEqual(resolveSegment(2, 17), { start_time: 2, end_time: 17 });
  assert.deepEqual(resolveSegment(0, 1), { start_time: 0, end_time: 1 });
});

test("resolveSegment rejects non-integer, negative, inverted, and out-of-range windows", () => {
  assert.throws(() => resolveSegment(-1, 10), /start_time/i);
  assert.throws(() => resolveSegment(1.5, 10), /start_time/i);
  assert.throws(() => resolveSegment(0, 0), /end_time must be greater/i);
  assert.throws(() => resolveSegment(10, 5), /end_time must be greater/i);
  assert.throws(() => resolveSegment(0, 3.2), /end_time/i);
  assert.throws(() => resolveSegment(0, 90000), /end_time/i);
});

test("buildReframeParams maps to the autocrop schema with defaults", () => {
  const params = buildReframeParams({ videoUrl: `  ${MASTER}  ` });
  assert.equal(params.video_url, MASTER);
  assert.equal(params.aspect_ratio, DEFAULT_ASPECT_RATIO);
  assert.equal(params.start_time, DEFAULT_START_TIME);
  assert.equal(params.end_time, DEFAULT_END_TIME);
});

test("buildReframeParams honors chosen aspect ratio + segment", () => {
  const params = buildReframeParams({
    videoUrl: MASTER,
    aspectRatio: "1:1",
    startTime: 0,
    endTime: 15,
  });
  assert.equal(params.aspect_ratio, "1:1");
  assert.equal(params.start_time, 0);
  assert.equal(params.end_time, 15);
});

test("buildReframeParams rejects a missing/non-http video and a bad aspect ratio", () => {
  assert.throws(() => buildReframeParams({ videoUrl: "  " }), /video URL is empty/i);
  assert.throws(() => buildReframeParams({ videoUrl: "ftp://x/v.mp4" }), /must be http/i);
  assert.throws(
    () => buildReframeParams({ videoUrl: MASTER, aspectRatio: "2:1" }),
    /Unsupported reframe aspect ratio/,
  );
});

test("reframeVideo routes to autocrop, sends the params, and maps the result", async () => {
  const muapi = fakeMuapi({ imageUrl: "https://cdn/vertical.mp4", cost: 0.05 });
  const service = new UgcReframeService({ muapi: muapi.fn });

  const result = await service.reframeVideo({ videoUrl: MASTER, aspectRatio: "9:16", endTime: 15 });

  assert.equal(muapi.calls.length, 1);
  assert.equal(muapi.calls[0].model, "autocrop");
  assert.equal(muapi.calls[0].step, "execute:ugc_reframe");
  assert.equal(muapi.calls[0].params.video_url, MASTER);
  assert.equal(muapi.calls[0].params.aspect_ratio, "9:16");
  assert.equal(muapi.calls[0].params.start_time, 0);
  assert.equal(muapi.calls[0].params.end_time, 15);
  assert.equal(result.videoUrl, "https://cdn/vertical.mp4");
  assert.equal(result.aspectRatio, "9:16");
  assert.equal(result.cost, 0.05);
  assert.equal(result.model, "autocrop");
});

test("reframeVideo routes premium to autocrop (single-tier fallback)", async () => {
  const muapi = fakeMuapi();
  const service = new UgcReframeService({ muapi: muapi.fn });

  const result = await service.reframeVideo({ videoUrl: MASTER, quality: "premium" });

  assert.equal(muapi.calls[0].model, "autocrop");
  assert.equal(result.model, "autocrop");
  assert.equal(result.aspectRatio, DEFAULT_ASPECT_RATIO);
});

test("reframeVideo rejects invalid inputs before calling Muapi", async () => {
  const muapi = fakeMuapi();
  const service = new UgcReframeService({ muapi: muapi.fn });

  await assert.rejects(() => service.reframeVideo({ videoUrl: "" }), /video URL is empty/i);
  assert.equal(muapi.calls.length, 0, "must not call Muapi on invalid inputs");
});

test("reframeVideo propagates a Muapi failure", async () => {
  const failing: MuapiGenerate = async () => {
    throw new Error("muapi 500");
  };
  const service = new UgcReframeService({ muapi: failing });

  await assert.rejects(() => service.reframeVideo({ videoUrl: MASTER }), /muapi 500/);
});

test("reframeToFormats fans out to the default UGC formats and sums the cost", async () => {
  const muapi = fakeMuapi({ cost: 0.05 });
  const service = new UgcReframeService({ muapi: muapi.fn });

  const result = await service.reframeToFormats({ videoUrl: MASTER, endTime: 15 });

  assert.equal(muapi.calls.length, UGC_TARGET_FORMATS.length);
  assert.deepEqual(
    result.variants.map((v) => v.aspectRatio),
    UGC_TARGET_FORMATS,
  );
  // every call carries the same source video + segment, one per format
  for (const call of muapi.calls) {
    assert.equal(call.params.video_url, MASTER);
    assert.equal(call.params.end_time, 15);
  }
  assert.deepEqual(
    muapi.calls.map((c) => c.params.aspect_ratio),
    UGC_TARGET_FORMATS,
  );
  assert.equal(result.totalCost, 0.05 * UGC_TARGET_FORMATS.length);
});

test("reframeToFormats honors an explicit format list", async () => {
  const muapi = fakeMuapi();
  const service = new UgcReframeService({ muapi: muapi.fn });

  const result = await service.reframeToFormats({ videoUrl: MASTER, formats: ["9:16", "1:1"] });

  assert.equal(muapi.calls.length, 2);
  assert.deepEqual(
    result.variants.map((v) => v.aspectRatio),
    ["9:16", "1:1"],
  );
});

test("reframeToFormats rejects an empty format list and a bad format before any Muapi call", async () => {
  const muapi = fakeMuapi();
  const service = new UgcReframeService({ muapi: muapi.fn });

  await assert.rejects(() => service.reframeToFormats({ videoUrl: MASTER, formats: [] }), /at least one/i);
  await assert.rejects(
    () => service.reframeToFormats({ videoUrl: MASTER, formats: ["9:16", "2:1"] }),
    /Unsupported reframe aspect ratio/,
  );
  assert.equal(muapi.calls.length, 0, "must not call Muapi on invalid formats");
});
