/**
 * DEV-32 (STU-27): Unit tests for the UGC video assembly service.
 *
 * Node built-in runner + native TS type-stripping (see PROGRESS.md → DEV-15).
 * The FFmpeg service, the R2 upload and the Muapi call are all injected as
 * fakes, so path selection, fallback, input validation, param assembly
 * (verified against `video-combiner`'s live input schema), routing, and
 * result/cost mapping verify without the network or a spawned process.
 *
 * **Re-run 2026-08-09**: FFmpeg is now the primary path and `video-combiner`
 * the fallback (was the other way round). Tests that exercise the combiner
 * therefore have to force a failure on the FFmpeg path first.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  UgcAssemblyService,
  buildAssemblyParams,
  resolveAspectRatio,
  resolveClips,
  resolveConcatTarget,
  ASSEMBLY_ASPECT_RATIOS,
  ASSEMBLY_STEP,
  ASPECT_DIMENSIONS,
  DEFAULT_ASPECT_RATIO,
  FFMPEG_ASSEMBLY_LABEL,
  MAX_CLIPS,
  type AssemblyFfmpeg,
  type MuapiGenerate,
  type UploadMaster,
} from "./ugc-assembly.ts";
import { DEFAULT_FPS, FfmpegUnavailableError } from "./ffmpeg.ts";
import type { PipelineLogEntry, PipelineLogger } from "./muapi.ts";

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

function fakeFfmpeg() {
  const calls: Array<{ clipUrls: string[]; target: { width: number; height: number; fps: number } }> = [];
  const ffmpeg: AssemblyFfmpeg = {
    async concatVideos(request) {
      calls.push({ clipUrls: request.clipUrls, target: request.target });
      return {
        buffer: Buffer.from("MASTER"),
        contentType: "video/mp4",
        clipCount: request.clipUrls.length,
      };
    },
  };
  return { ffmpeg, calls };
}

/** An FFmpeg seam that always fails — the only way to reach the fallback. */
function brokenFfmpeg(error: Error = new Error("ffmpeg exited 1")): AssemblyFfmpeg {
  return {
    async concatVideos() {
      throw error;
    },
  };
}

function fakeUpload() {
  const calls: Array<{ buffer: Buffer; contentType: string; userId?: string }> = [];
  const upload: UploadMaster = async (buffer, contentType, userId) => {
    calls.push({ buffer, contentType, userId });
    return "https://r2.example/ugc-assembly/master.mp4";
  };
  return { upload, calls };
}

function fakeLogger() {
  const calls: PipelineLogEntry[] = [];
  const logger: PipelineLogger = (entry) => {
    calls.push(entry);
  };
  return { logger, calls };
}

/** A service whose FFmpeg path succeeds. */
function ffmpegService() {
  const ffmpeg = fakeFfmpeg();
  const upload = fakeUpload();
  const muapi = fakeMuapi();
  const service = new UgcAssemblyService({
    ffmpeg: ffmpeg.ffmpeg,
    upload: upload.upload,
    muapi: muapi.fn,
  });
  return { service, ffmpeg, upload, muapi };
}

/** A service whose FFmpeg path fails, so the combiner fallback runs. */
function fallbackService(error?: Error) {
  const upload = fakeUpload();
  const muapi = fakeMuapi();
  const service = new UgcAssemblyService({
    ffmpeg: brokenFfmpeg(error),
    upload: upload.upload,
    muapi: muapi.fn,
  });
  return { service, upload, muapi };
}

// ------------------------------------------------------------ pure bits ----

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

test("every aspect ratio has concrete FFmpeg dimensions matching its ratio", () => {
  for (const ratio of ASSEMBLY_ASPECT_RATIOS) {
    const dimensions = ASPECT_DIMENSIONS[ratio];
    assert.ok(dimensions, `${ratio} needs pixel dimensions for the FFmpeg path`);
    assert.equal(dimensions.width % 2, 0, `${ratio} width must be even for yuv420p`);
    assert.equal(dimensions.height % 2, 0, `${ratio} height must be even for yuv420p`);

    if (ratio === "auto") continue;
    const [w, h] = ratio.split(":").map(Number);
    const expected = w / h;
    const actual = dimensions.width / dimensions.height;
    assert.ok(
      Math.abs(expected - actual) < 0.02,
      `${ratio} dimensions ${dimensions.width}x${dimensions.height} do not match the ratio`,
    );
  }
});

test("resolveConcatTarget maps auto to the 16:9 UGC master orientation", () => {
  assert.deepEqual(resolveConcatTarget("auto"), resolveConcatTarget("16:9"));
  assert.equal(resolveConcatTarget("auto").fps, DEFAULT_FPS);
});

test("resolveConcatTarget maps a portrait ratio to portrait pixels", () => {
  const target = resolveConcatTarget("9:16");
  assert.ok(target.height > target.width);
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

// -------------------------------------------------- FFmpeg (primary) ----

test("assembleVideo uses FFmpeg first and never calls Muapi when it succeeds", async () => {
  const { service, ffmpeg, upload, muapi } = ffmpegService();

  const result = await service.assembleVideo({ clips: [CLIP_A, CLIP_B, CLIP_C] });

  assert.equal(ffmpeg.calls.length, 1, "FFmpeg is the primary path");
  assert.equal(muapi.calls.length, 0, "video-combiner must not be touched on success");
  assert.deepEqual(ffmpeg.calls[0].clipUrls, [CLIP_A, CLIP_B, CLIP_C], "order preserved");
  assert.equal(upload.calls.length, 1, "the encoded master must be uploaded");
  assert.equal(upload.calls[0].contentType, "video/mp4");
  assert.equal(result.videoUrl, "https://r2.example/ugc-assembly/master.mp4");
  assert.equal(result.path, "ffmpeg");
  assert.equal(result.model, FFMPEG_ASSEMBLY_LABEL);
  assert.equal(result.clipCount, 3);
  assert.equal(result.aspectRatio, DEFAULT_ASPECT_RATIO);
});

test("the FFmpeg path costs nothing — it calls no paid model", async () => {
  const { service } = ffmpegService();
  const result = await service.assembleVideo({ clips: [CLIP_A, CLIP_B] });
  assert.equal(result.cost, 0);
  assert.equal(result.fallbackReason, undefined);
});

test("assembleVideo hands FFmpeg concrete pixels for the chosen aspect ratio", async () => {
  const { service, ffmpeg } = ffmpegService();

  await service.assembleVideo({ clips: [CLIP_A, CLIP_B], aspectRatio: "9:16" });

  const { target } = ffmpeg.calls[0];
  assert.deepEqual(
    { width: target.width, height: target.height },
    ASPECT_DIMENSIONS["9:16"],
  );
  assert.equal(target.fps, DEFAULT_FPS);
});

test("assembleVideo passes the userId through to the upload key", async () => {
  const { service, upload } = ffmpegService();
  await service.assembleVideo({ clips: [CLIP_A, CLIP_B], userId: "user_123" });
  assert.equal(upload.calls[0].userId, "user_123");
});

// ------------------------------------------- video-combiner (fallback) ----

test("assembleVideo falls back to video-combiner when FFmpeg fails", async () => {
  const { service, muapi } = fallbackService(new Error("ffmpeg exited 1: bad data"));

  const result = await service.assembleVideo({ clips: [CLIP_A, CLIP_B, CLIP_C] });

  assert.equal(muapi.calls.length, 1);
  assert.equal(muapi.calls[0].model, "video-combiner");
  assert.equal(muapi.calls[0].step, "execute:ugc_assembly");
  assert.deepEqual(muapi.calls[0].params.videos_list, [CLIP_A, CLIP_B, CLIP_C]);
  assert.equal(result.path, "video-combiner");
  assert.equal(result.model, "video-combiner");
  assert.equal(result.cost, 0.05);
  assert.equal(result.videoUrl, "https://cdn/master.mp4");
  assert.match(result.fallbackReason ?? "", /bad data/);
});

test("assembleVideo falls back when FFmpeg is unavailable in this environment", async () => {
  const { service, muapi } = fallbackService(new FfmpegUnavailableError());

  const result = await service.assembleVideo({ clips: [CLIP_A, CLIP_B] });

  assert.equal(result.path, "video-combiner");
  assert.equal(muapi.calls.length, 1);
  assert.match(result.fallbackReason ?? "", /unavailable/i);
});

test("assembleVideo falls back when the master upload fails", async () => {
  const muapi = fakeMuapi();
  const service = new UgcAssemblyService({
    ffmpeg: fakeFfmpeg().ffmpeg,
    upload: async () => {
      throw new Error("R2 refused the object");
    },
    muapi: muapi.fn,
  });

  const result = await service.assembleVideo({ clips: [CLIP_A, CLIP_B] });

  assert.equal(result.path, "video-combiner", "an unusable master is still a failed path");
  assert.match(result.fallbackReason ?? "", /R2 refused/);
});

test("the fallback honors a chosen aspect ratio and routes premium to the same model", async () => {
  const { service, muapi } = fallbackService();

  const result = await service.assembleVideo({
    clips: [CLIP_A, CLIP_B],
    aspectRatio: "9:16",
    quality: "premium",
  });

  assert.equal(result.aspectRatio, "9:16");
  assert.equal(muapi.calls[0].params.aspect_ratio, "9:16");
  assert.equal(muapi.calls[0].model, "video-combiner");
  assert.equal(result.clipCount, 2);
});

test("assembleVideo propagates a Muapi failure when both paths fail", async () => {
  const failing: MuapiGenerate = async () => {
    throw new Error("muapi 503 at capacity");
  };
  const service = new UgcAssemblyService({
    ffmpeg: brokenFfmpeg(),
    upload: fakeUpload().upload,
    muapi: failing,
  });

  await assert.rejects(
    () => service.assembleVideo({ clips: [CLIP_A, CLIP_B] }),
    /muapi 503 at capacity/,
  );
});

// ---------------------------------------------------------- validation ----

test("assembleVideo rejects invalid inputs before trying either path", async () => {
  const { service, ffmpeg, muapi } = ffmpegService();

  await assert.rejects(
    () => service.assembleVideo({ clips: [CLIP_A] }),
    /at least 2 clips/,
  );
  assert.equal(ffmpeg.calls.length, 0, "must not spawn FFmpeg on invalid inputs");
  assert.equal(muapi.calls.length, 0, "must not call Muapi on invalid inputs");
});

test("a bad aspect ratio is a caller error, not a reason to fall back", async () => {
  const { service, muapi } = ffmpegService();

  await assert.rejects(
    () => service.assembleVideo({ clips: [CLIP_A, CLIP_B], aspectRatio: "2:1" }),
    /Unsupported assembly aspect ratio/,
  );
  assert.equal(muapi.calls.length, 0);
});

// ------------------------------------------------------- path logging ----
// QA run #2 (2026-08-11) found the FFmpeg path left no trace anywhere: a
// successful run called no model, so nothing wrote a pipeline_logs row, and the
// caller drops `path`/`fallbackReason`. "Did the primary path hold?" was
// therefore unanswerable — and a silently-degraded primary (e.g. a misconfigured
// R2 failing every upload) would bill the $0.05 fallback forever, invisibly.

test("a successful FFmpeg assembly writes its own pipeline log entry", async () => {
  const entries = fakeLogger();
  const service = new UgcAssemblyService({
    ffmpeg: fakeFfmpeg().ffmpeg,
    upload: fakeUpload().upload,
    muapi: fakeMuapi().fn,
    logger: entries.logger,
  });

  await service.assembleVideo({ clips: [CLIP_A, CLIP_B] });

  assert.equal(entries.calls.length, 1, "the FFmpeg path must log exactly once");
  const [entry] = entries.calls;
  assert.equal(entry.step, ASSEMBLY_STEP);
  // `model` is the path discriminator — this is what makes the row readable as
  // "FFmpeg ran" versus Muapi's own `video-combiner` row.
  assert.equal(entry.model, FFMPEG_ASSEMBLY_LABEL);
  assert.equal(entry.success, true);
  assert.equal(entry.cost, 0);
  assert.equal(entry.error, undefined);
});

test("the logged duration measures the real encode, not zero", async () => {
  const entries = fakeLogger();
  const slowFfmpeg: AssemblyFfmpeg = {
    async concatVideos(request) {
      await new Promise((resolve) => setTimeout(resolve, 20));
      return {
        buffer: Buffer.from("MASTER"),
        contentType: "video/mp4",
        clipCount: request.clipUrls.length,
      };
    },
  };
  const service = new UgcAssemblyService({
    ffmpeg: slowFfmpeg,
    upload: fakeUpload().upload,
    muapi: fakeMuapi().fn,
    logger: entries.logger,
  });

  await service.assembleVideo({ clips: [CLIP_A, CLIP_B] });

  // This number is the whole point on Replit: it is the only measurement of the
  // CPU-bound encode the autoscale risk is about.
  assert.ok(
    entries.calls[0].durationMs >= 10,
    `expected a measured duration, got ${entries.calls[0].durationMs}ms`,
  );
});

test("a failed FFmpeg attempt is logged with its reason before the fallback runs", async () => {
  const entries = fakeLogger();
  const muapi = fakeMuapi();
  const service = new UgcAssemblyService({
    ffmpeg: brokenFfmpeg(new Error("ffmpeg exited 1: no such filter")),
    upload: fakeUpload().upload,
    muapi: muapi.fn,
    logger: entries.logger,
  });

  const result = await service.assembleVideo({ clips: [CLIP_A, CLIP_B] });

  assert.equal(entries.calls.length, 1, "the failed attempt must still be recorded");
  const [entry] = entries.calls;
  assert.equal(entry.model, FFMPEG_ASSEMBLY_LABEL);
  assert.equal(entry.success, false);
  assert.equal(entry.cost, 0, "a failed encode bills nothing");
  assert.match(entry.error ?? "", /no such filter/);
  // The fallback still logs its own row via Muapi's `step` option, so the pair
  // reads as "ffmpeg failed → video-combiner succeeded".
  assert.equal(muapi.calls[0].step, ASSEMBLY_STEP);
  assert.equal(result.path, "video-combiner");
});

test("a throwing logger never breaks an assembly", async () => {
  const service = new UgcAssemblyService({
    ffmpeg: fakeFfmpeg().ffmpeg,
    upload: fakeUpload().upload,
    muapi: fakeMuapi().fn,
    logger: () => {
      throw new Error("pipeline_logs is down");
    },
  });

  const result = await service.assembleVideo({ clips: [CLIP_A, CLIP_B] });

  assert.equal(result.path, "ffmpeg", "logging is bookkeeping, never load-bearing");
});

test("a caller error logs nothing — neither path ran", async () => {
  const entries = fakeLogger();
  const service = new UgcAssemblyService({
    ffmpeg: fakeFfmpeg().ffmpeg,
    upload: fakeUpload().upload,
    muapi: fakeMuapi().fn,
    logger: entries.logger,
  });

  await assert.rejects(() => service.assembleVideo({ clips: [CLIP_A] }));

  assert.equal(entries.calls.length, 0, "an invalid request is not an FFmpeg failure");
});
