/**
 * DEV-29 (STU-25): Unit tests for the UGC talking-head / lip-sync service.
 *
 * Node built-in runner + native TS type-stripping (see PROGRESS.md → DEV-15).
 * The Muapi call is injected as a fake, so input validation, param assembly
 * (verified against `infinitetalk-image-to-video`'s live input schema), routing,
 * and result/cost mapping verify without the network.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  UgcLipsyncService,
  buildLipsyncParams,
  resolveResolution,
  LIPSYNC_RESOLUTIONS,
  DEFAULT_RESOLUTION,
  type MuapiGenerate,
} from "./ugc-lipsync.ts";

const PORTRAIT = "https://cdn/presenter.jpg";
const AUDIO = "https://cdn/voice.mp3";

function fakeMuapi(result: Partial<{ imageUrl: string; cost: number }> = {}) {
  const calls: Array<{ model: string; params: Record<string, unknown>; step?: string }> = [];
  const fn: MuapiGenerate = async (model, params, options) => {
    calls.push({ model, params: params as Record<string, unknown>, step: options?.step });
    return {
      outputs: [result.imageUrl ?? "https://cdn/talkinghead.mp4"],
      imageUrl: result.imageUrl ?? "https://cdn/talkinghead.mp4",
      cost: result.cost ?? 0.28,
      model,
      requestId: "r",
    };
  };
  return { fn, calls };
}

test("LIPSYNC_RESOLUTIONS are unique and the default is one of them", () => {
  assert.equal(new Set(LIPSYNC_RESOLUTIONS).size, LIPSYNC_RESOLUTIONS.length);
  assert.ok((LIPSYNC_RESOLUTIONS as readonly string[]).includes(DEFAULT_RESOLUTION));
});

test("resolveResolution defaults, accepts supported values, and rejects unknown ones", () => {
  assert.equal(resolveResolution(), DEFAULT_RESOLUTION);
  assert.equal(resolveResolution("720p"), "720p");
  assert.throws(() => resolveResolution("4k"), /Unsupported lip-sync resolution/);
});

test("buildLipsyncParams maps to image_url + audio_url + resolution (default 480p)", () => {
  const params = buildLipsyncParams({ presenterImageUrl: `  ${PORTRAIT}  `, audioUrl: `  ${AUDIO}  ` });
  assert.equal(params.image_url, PORTRAIT);
  assert.equal(params.audio_url, AUDIO);
  assert.equal(params.resolution, DEFAULT_RESOLUTION);
  assert.ok(!("prompt" in params), "prompt omitted unless set");
});

test("buildLipsyncParams honors a chosen resolution and optional prompt", () => {
  const params = buildLipsyncParams({
    presenterImageUrl: PORTRAIT,
    audioUrl: AUDIO,
    resolution: "720p",
    prompt: "warm, friendly delivery to camera",
  });
  assert.equal(params.resolution, "720p");
  assert.equal(params.prompt, "warm, friendly delivery to camera");
});

test("buildLipsyncParams rejects a missing/non-http portrait or audio, and a bad resolution", () => {
  assert.throws(() => buildLipsyncParams({ presenterImageUrl: "  ", audioUrl: AUDIO }), /portrait/i);
  assert.throws(() => buildLipsyncParams({ presenterImageUrl: "not-a-url", audioUrl: AUDIO }), /portrait/i);
  assert.throws(() => buildLipsyncParams({ presenterImageUrl: PORTRAIT, audioUrl: "" }), /audio/i);
  assert.throws(() => buildLipsyncParams({ presenterImageUrl: PORTRAIT, audioUrl: "ftp://x" }), /audio/i);
  assert.throws(
    () => buildLipsyncParams({ presenterImageUrl: PORTRAIT, audioUrl: AUDIO, resolution: "8k" }),
    /Unsupported lip-sync resolution/,
  );
});

test("generateTalkingHead routes to infinitetalk, sends the inputs, and maps the result", async () => {
  const muapi = fakeMuapi({ imageUrl: "https://cdn/th.mp4", cost: 0.27 });
  const service = new UgcLipsyncService({ muapi: muapi.fn });

  const result = await service.generateTalkingHead({
    presenterImageUrl: PORTRAIT,
    audioUrl: AUDIO,
  });

  assert.equal(muapi.calls.length, 1);
  assert.equal(muapi.calls[0].model, "infinitetalk-image-to-video");
  assert.equal(muapi.calls[0].step, "execute:ugc_lipsync");
  assert.equal(muapi.calls[0].params.image_url, PORTRAIT);
  assert.equal(muapi.calls[0].params.audio_url, AUDIO);
  assert.equal(muapi.calls[0].params.resolution, DEFAULT_RESOLUTION);
  assert.equal(result.videoUrl, "https://cdn/th.mp4");
  assert.equal(result.cost, 0.27);
  assert.equal(result.model, "infinitetalk-image-to-video");
  assert.equal(result.resolution, DEFAULT_RESOLUTION);
});

test("generateTalkingHead honors a chosen resolution", async () => {
  const muapi = fakeMuapi();
  const service = new UgcLipsyncService({ muapi: muapi.fn });

  const result = await service.generateTalkingHead({
    presenterImageUrl: PORTRAIT,
    audioUrl: AUDIO,
    resolution: "720p",
  });

  assert.equal(result.resolution, "720p");
  assert.equal(muapi.calls[0].params.resolution, "720p");
});

test("generateTalkingHead rejects invalid inputs before calling Muapi", async () => {
  const muapi = fakeMuapi();
  const service = new UgcLipsyncService({ muapi: muapi.fn });

  await assert.rejects(
    () => service.generateTalkingHead({ presenterImageUrl: "nope", audioUrl: AUDIO }),
    /portrait/i,
  );
  assert.equal(muapi.calls.length, 0, "must not call Muapi on invalid inputs");
});

test("generateTalkingHead propagates a Muapi failure", async () => {
  const failing: MuapiGenerate = async () => {
    throw new Error("muapi 500");
  };
  const service = new UgcLipsyncService({ muapi: failing });

  await assert.rejects(
    () => service.generateTalkingHead({ presenterImageUrl: PORTRAIT, audioUrl: AUDIO }),
    /muapi 500/,
  );
});
