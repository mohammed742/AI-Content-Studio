/**
 * DEV-28 (STU-24): Unit tests for the UGC voiceover generation service.
 *
 * Node built-in runner + native TS type-stripping (see PROGRESS.md → DEV-15).
 * The Muapi call is injected as a fake, so voice/enum resolution, param assembly
 * (verified against `gemini-3-1-flash-tts`'s live input schema), routing, and
 * result/cost mapping verify without the network.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  UgcVoiceoverService,
  buildVoiceoverParams,
  resolveVoiceName,
  VOICEOVER_VOICES,
  DEFAULT_VOICE_NAME,
  DEFAULT_STYLE,
  DEFAULT_ACCENT,
  DEFAULT_PACE,
  MAX_DIALOGUE_CHARS,
  type MuapiGenerate,
} from "./ugc-voiceover.ts";

function fakeMuapi(result: Partial<{ imageUrl: string; cost: number }> = {}) {
  const calls: Array<{ model: string; params: Record<string, unknown>; step?: string }> = [];
  const fn: MuapiGenerate = async (model, params, options) => {
    calls.push({ model, params: params as Record<string, unknown>, step: options?.step });
    return {
      outputs: [result.imageUrl ?? "https://cdn/audio.mp3"],
      imageUrl: result.imageUrl ?? "https://cdn/audio.mp3",
      cost: result.cost ?? 0.003,
      model,
      requestId: "r",
    };
  };
  return { fn, calls };
}

test("VOICEOVER_VOICES have unique names and the default is one of them", () => {
  assert.equal(new Set(VOICEOVER_VOICES).size, VOICEOVER_VOICES.length);
  assert.ok((VOICEOVER_VOICES as readonly string[]).includes(DEFAULT_VOICE_NAME));
});

test("resolveVoiceName defaults, accepts supported names, and rejects unknown ones", () => {
  assert.equal(resolveVoiceName(), DEFAULT_VOICE_NAME);
  assert.equal(resolveVoiceName("Zephyr"), "Zephyr");
  assert.throws(() => resolveVoiceName("Rachel"), /Unsupported voiceover voice_name/);
});

test("buildVoiceoverParams builds a single-speaker request with defaults", () => {
  const params = buildVoiceoverParams("  Hello there  ");
  assert.deepEqual(params.speakers, [
    {
      speaker_id: "Speaker 1",
      voice_name: DEFAULT_VOICE_NAME,
      accent: DEFAULT_ACCENT,
      style: DEFAULT_STYLE,
      pace: DEFAULT_PACE,
    },
  ]);
  assert.deepEqual(params.dialogue_turns, [{ speaker_id: "Speaker 1", text: "Hello there" }]);
  assert.ok(!("temperature" in params), "temperature omitted unless set");
});

test("buildVoiceoverParams honors chosen voice/style/accent/pace + temperature", () => {
  const params = buildVoiceoverParams("Hi", {
    voiceName: "Aoede",
    style: "Promo/Hype",
    accent: "British (RP)",
    pace: "Rapid Fire",
    temperature: 0.8,
  });
  const speaker = (params.speakers as Array<Record<string, unknown>>)[0];
  assert.equal(speaker.voice_name, "Aoede");
  assert.equal(speaker.style, "Promo/Hype");
  assert.equal(speaker.accent, "British (RP)");
  assert.equal(speaker.pace, "Rapid Fire");
  assert.equal(params.temperature, 0.8);
});

test("buildVoiceoverParams rejects empty/over-long text and unsupported enums", () => {
  assert.throws(() => buildVoiceoverParams("   "), /empty/);
  assert.throws(
    () => buildVoiceoverParams("x".repeat(MAX_DIALOGUE_CHARS + 1)),
    /limit is 10000/,
  );
  assert.throws(() => buildVoiceoverParams("Hi", { style: "Shouting" }), /Unsupported voiceover style/);
  assert.throws(() => buildVoiceoverParams("Hi", { accent: "Martian" }), /Unsupported voiceover accent/);
  assert.throws(() => buildVoiceoverParams("Hi", { pace: "Sluggish" }), /Unsupported voiceover pace/);
});

test("generateVoiceover routes to gemini tts, sends the dialogue, and maps the result", async () => {
  const muapi = fakeMuapi({ imageUrl: "https://cdn/voice.mp3", cost: 0.0034 });
  const service = new UgcVoiceoverService({ muapi: muapi.fn });

  const result = await service.generateVoiceover({
    text: "This balm changed my mornings. Grab yours today.",
  });

  assert.equal(muapi.calls.length, 1);
  assert.equal(muapi.calls[0].model, "gemini-3-1-flash-tts");
  assert.equal(muapi.calls[0].step, "execute:ugc_voiceover");
  assert.deepEqual(muapi.calls[0].params.dialogue_turns, [
    { speaker_id: "Speaker 1", text: "This balm changed my mornings. Grab yours today." },
  ]);
  assert.equal(result.audioUrl, "https://cdn/voice.mp3");
  assert.equal(result.voiceName, DEFAULT_VOICE_NAME);
  assert.equal(result.cost, 0.0034);
  assert.equal(result.model, "gemini-3-1-flash-tts");
});

test("generateVoiceover honors a chosen voice", async () => {
  const muapi = fakeMuapi();
  const service = new UgcVoiceoverService({ muapi: muapi.fn });

  const result = await service.generateVoiceover({ text: "Hi there", voiceName: "Leda" });

  assert.equal(result.voiceName, "Leda");
  const speaker = (muapi.calls[0].params.speakers as Array<Record<string, unknown>>)[0];
  assert.equal(speaker.voice_name, "Leda");
});

test("generateVoiceover rejects an unsupported voice before calling Muapi", async () => {
  const muapi = fakeMuapi();
  const service = new UgcVoiceoverService({ muapi: muapi.fn });

  await assert.rejects(
    () => service.generateVoiceover({ text: "Hi", voiceName: "bogus" }),
    /Unsupported voiceover voice_name/,
  );
  assert.equal(muapi.calls.length, 0, "must not call Muapi on an invalid voice");
});

test("generateVoiceover propagates a Muapi failure", async () => {
  const failing: MuapiGenerate = async () => {
    throw new Error("muapi 500");
  };
  const service = new UgcVoiceoverService({ muapi: failing });

  await assert.rejects(
    () => service.generateVoiceover({ text: "Hi there" }),
    /muapi 500/,
  );
});
