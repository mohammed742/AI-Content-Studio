/**
 * DEV-29 (STU-25): UGC talking-head / lip-sync generation — the third step of
 * the Phase 3 UGC Video Pipeline (Script → Voiceover → **Talking head** →
 * B-roll → Assembly → Reframe). Given a static presenter portrait (from the
 * Phase-2.5 presenter library) and the voiceover audio (DEV-28's
 * `UgcVoiceoverResult.audioUrl`), it generates a lip-synced talking-head video
 * via Muapi's `infinitetalk-image-to-video` model (routed through the Model
 * Router, DEV-18, as `ugc_lipsync`).
 *
 * The video URL feeds the assembly step (DEV-32), which stitches the talking
 * head together with the product B-roll.
 *
 * ⚠️ Model history: the plan (plan-phase-3.md) specified `creatify-lipsync`, but
 * on 2026-07-24 the live Muapi schema showed it (and the other $0.04 lip-sync
 * models — latent-sync/sync-lipsync/veed-lipsync) is an *Audio-to-Video* model
 * requiring a **`video_url`** — a pre-existing presenter *video* whose lips get
 * re-synced. It cannot animate a static portrait, which is all the presenter
 * library produces. Repointed to `infinitetalk-image-to-video` (`image_url` +
 * `audio_url`, ~$0.28 actual), the plan's real intent — completion-verified
 * end-to-end (portrait + gemini VO → real MP4). Human-approved. See
 * `.agents/memory/muapi-api-contract.md`.
 *
 * Model contract (verified live against `GET /api/v1/models/...`, 2026-07-24):
 *   POST body → `{ image_url, audio_url, resolution?, prompt? }`. `image_url`
 *   and `audio_url` are required; `resolution` is an enum (`480p`/`720p`, default
 *   `480p`); `prompt` is optional motion/scene guidance.
 *
 * Testability mirrors the sibling services (`ugc-voiceover.ts`,
 * `product-photo.ts`): the Muapi call and the router are injectable, so input
 * validation, param assembly, routing, and cost/result mapping unit-test with
 * fakes. The default Muapi call lazily loads the DEV-15 service (which logs each
 * call), so the module loads under the bare Node test runner.
 *
 * Scope: talking-head generation only. Presenter pre-selection, B-roll,
 * assembly, reframe, persistence, and UI are later Phase-3 slices (DEV-30…33).
 * The premium tier (`kling-v1-avatar-pro`) is intentionally not wired here — it
 * is also image+audio but takes different params (no `resolution`) and is
 * completion-unverified.
 */
import { modelRouter, ModelRouter, type Quality } from "./model-router.ts";
import type { MuapiGenerateParams, MuapiGenerateResult } from "@/lib/muapi";

/** Pipeline-log step label for the talking-head call. */
const LIPSYNC_STEP = "execute:ugc_lipsync";

/** Output resolutions `infinitetalk-image-to-video` accepts (schema enum). */
export const LIPSYNC_RESOLUTIONS = ["480p", "720p"] as const;
export type LipsyncResolution = (typeof LIPSYNC_RESOLUTIONS)[number];

/** 480p keeps the talking head cheap; the agent may bump to 720p per request. */
export const DEFAULT_RESOLUTION: LipsyncResolution = "480p";

const RESOLUTION_SET = new Set<string>(LIPSYNC_RESOLUTIONS);

export interface UgcLipsyncRequest {
  /** Static presenter portrait URL (Phase-2.5 presenter library). */
  presenterImageUrl: string;
  /** Voiceover audio URL (DEV-28 `UgcVoiceoverResult.audioUrl`). */
  audioUrl: string;
  /** Optional motion/scene guidance for the talking head. */
  prompt?: string;
  /** Output resolution (default {@link DEFAULT_RESOLUTION}). */
  resolution?: string;
  /** Route tier (default `standard`). Premium is not wired — see the file doc. */
  quality?: Quality;
}

export interface UgcLipsyncResult {
  /** URL of the generated talking-head video (feeds the assembly step). */
  videoUrl: string;
  /** The resolution actually used. */
  resolution: LipsyncResolution;
  /** Muapi cost in USD (COGS, hidden from the user). */
  cost: number;
  model: string;
}

/** The Muapi generation call. Injectable (shared shape with the siblings). */
export type MuapiGenerate = (
  model: string,
  params: MuapiGenerateParams,
  options?: { step?: string },
) => Promise<MuapiGenerateResult>;

/** Resolve+validate the resolution: default when absent, fail-loud on unknown. */
export function resolveResolution(resolution?: string): LipsyncResolution {
  if (resolution === undefined) {
    return DEFAULT_RESOLUTION;
  }
  if (!RESOLUTION_SET.has(resolution)) {
    throw new Error(`Unsupported lip-sync resolution: ${resolution}`);
  }
  return resolution as LipsyncResolution;
}

/** Require a non-empty http(s) URL; fail loud with a labelled message. */
function requireHttpUrl(value: string | undefined, label: string): string {
  const trimmed = (value ?? "").trim();
  if (!trimmed) {
    throw new Error(`Lip-sync ${label} URL is empty`);
  }
  if (!/^https?:\/\//i.test(trimmed)) {
    throw new Error(`Lip-sync ${label} URL must be http(s): ${trimmed}`);
  }
  return trimmed;
}

/**
 * Build the Muapi request body for a talking-head generation: the presenter
 * portrait, the voiceover audio, and the resolution, with an optional prompt.
 * Throws on a missing/non-http portrait or audio URL, or an unsupported
 * resolution.
 */
export function buildLipsyncParams(request: {
  presenterImageUrl: string;
  audioUrl: string;
  prompt?: string;
  resolution?: string;
}): MuapiGenerateParams {
  const params: MuapiGenerateParams = {
    image_url: requireHttpUrl(request.presenterImageUrl, "portrait"),
    audio_url: requireHttpUrl(request.audioUrl, "audio"),
    resolution: resolveResolution(request.resolution),
  };
  const prompt = request.prompt?.trim();
  if (prompt) {
    params.prompt = prompt;
  }
  return params;
}

export interface UgcLipsyncConfig {
  muapi?: MuapiGenerate;
  router?: ModelRouter;
}

export class UgcLipsyncService {
  private readonly muapi: MuapiGenerate;
  private readonly router: ModelRouter;

  constructor(config: UgcLipsyncConfig = {}) {
    this.muapi = config.muapi ?? defaultMuapi;
    this.router = config.router ?? modelRouter;
  }

  /**
   * Generate a talking-head video from the presenter portrait + voiceover
   * audio. Throws on invalid inputs (before any Muapi call) or a Muapi failure
   * (the caller decides whether that's fatal / retryable). The Muapi service
   * logs the call.
   */
  async generateTalkingHead(
    request: UgcLipsyncRequest,
  ): Promise<UgcLipsyncResult> {
    const resolution = resolveResolution(request.resolution);
    const params = buildLipsyncParams({
      presenterImageUrl: request.presenterImageUrl,
      audioUrl: request.audioUrl,
      prompt: request.prompt,
      resolution,
    });
    const model = this.router.getModel("ugc_lipsync", request.quality ?? "standard");

    const generated = await this.muapi(model, params, { step: LIPSYNC_STEP });

    return {
      videoUrl: generated.imageUrl, // outputs[0] — the talking-head video URL
      resolution,
      cost: generated.cost,
      model,
    };
  }
}

/** Default Muapi call — the DEV-15 service (which logs each call). */
const defaultMuapi: MuapiGenerate = async (model, params, options) => {
  const { muapiService } = await import("@/lib/muapi");
  return muapiService.generate(model, params, options);
};

export const ugcLipsyncService = new UgcLipsyncService();
