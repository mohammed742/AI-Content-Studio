/**
 * DEV-30 (STU-26): UGC product B-roll generation — the fourth step of the
 * Phase 3 UGC Video Pipeline (Script → Voiceover → Lip-sync → **B-roll** →
 * Assembly → Reframe). Given a product photo (a Media Library image, or a
 * DEV-19 product-photo result), it animates it into a short cinematic clip via
 * Muapi's `kling-v2.1-standard-i2v` model (routed through the Model Router,
 * DEV-18, as the `video_animate` asset type).
 *
 * The clip fills the middle of the assembled ad (DEV-32): talking head 0-8s →
 * **B-roll 8-12s** → talking-head CTA 12-15s.
 *
 * Asset-type reuse: unlike the voiceover/lip-sync steps (which introduced new
 * `voiceover`/`ugc_lipsync` asset types because no existing route fit), B-roll
 * animates an image into a video — which is exactly what the pre-existing
 * `video_animate` route already maps to (`kling-v2.1-standard-i2v` standard /
 * `kling-v2.1-pro-i2v` premium). Reusing it keeps the router's one-entry-per-type
 * design intact; the pipeline-log step stays `execute:ugc_broll` for readability.
 *
 * Model contract (verified live against `GET /api/v1/models/kling-v2.1-standard-i2v`,
 * 2026-07-24):
 *   POST body → `{ prompt, image_url, aspect_ratio?, duration? }`. `prompt`
 *   (motion description) and `image_url` are required; `aspect_ratio` is an enum
 *   (`16:9`/`9:16`/`1:1`, default `16:9`); `duration` is an int enum (`5` or
 *   `10` seconds, default `5`). Output is a single video URL.
 *
 * Testability mirrors the sibling services (`ugc-lipsync.ts`, `ugc-voiceover.ts`):
 * the Muapi call and the router are injectable, so input validation, param
 * assembly, routing, and cost/result mapping unit-test with fakes. The default
 * Muapi call lazily loads the DEV-15 service (which logs each call), so the
 * module loads under the bare Node test runner.
 *
 * Scope: B-roll generation only. Assembly, reframe, persistence, and UI are later
 * Phase-3 slices (DEV-32/31/33). Premium (`kling-v2.1-pro-i2v`) is reachable via
 * `quality: "premium"` — it shares this exact input schema — but only the
 * standard tier is completion-verified this slice.
 */
import { modelRouter, ModelRouter, type Quality } from "./model-router.ts";
import type { MuapiGenerateParams, MuapiGenerateResult } from "@/lib/muapi";

/** Pipeline-log step label for the B-roll call. */
const BROLL_STEP = "execute:ugc_broll";

/** Output aspect ratios `kling-v2.1-standard-i2v` accepts (schema enum). */
export const BROLL_ASPECT_RATIOS = ["16:9", "9:16", "1:1"] as const;
export type BrollAspectRatio = (typeof BROLL_ASPECT_RATIOS)[number];

/** Clip durations in seconds `kling-v2.1-standard-i2v` accepts (schema enum). */
export const BROLL_DURATIONS = [5, 10] as const;
export type BrollDuration = (typeof BROLL_DURATIONS)[number];

/**
 * The model default (also the DEV-29 talking-head orientation); the DEV-31
 * reframe step derives 9:16 + 1:1 from this master. The agent may override.
 */
export const DEFAULT_ASPECT_RATIO: BrollAspectRatio = "16:9";
/** Model minimum — the assembly B-roll slot is only ~4s (8-12s). */
export const DEFAULT_DURATION: BrollDuration = 5;

/**
 * Motion guidance used when the caller supplies no prompt. `kling` *requires* a
 * prompt, so a tasteful product-B-roll default keeps the service usable
 * standalone; the pipeline overrides it with a product-specific motion prompt.
 */
export const DEFAULT_MOTION_PROMPT =
  "Subtle cinematic product B-roll: a slow, smooth dolly-in with gentle parallax " +
  "and soft studio lighting, keeping the product crisp, centered, and true to its " +
  "real shape and colors. No text, no added objects.";

const ASPECT_RATIO_SET = new Set<string>(BROLL_ASPECT_RATIOS);
const DURATION_SET = new Set<number>(BROLL_DURATIONS);

export interface UgcBrollRequest {
  /** Product photo URL (Media Library image or a DEV-19 product-photo result). */
  productImageUrl: string;
  /** Motion/scene guidance (default {@link DEFAULT_MOTION_PROMPT}). */
  prompt?: string;
  /** Output aspect ratio (default {@link DEFAULT_ASPECT_RATIO}). */
  aspectRatio?: string;
  /** Clip duration in seconds (default {@link DEFAULT_DURATION}). */
  duration?: number;
  /** Route tier (default `standard`). `premium` → `kling-v2.1-pro-i2v`. */
  quality?: Quality;
}

export interface UgcBrollResult {
  /** URL of the generated B-roll clip (feeds the assembly step). */
  videoUrl: string;
  /** The aspect ratio actually used. */
  aspectRatio: BrollAspectRatio;
  /** The duration (seconds) actually used. */
  duration: BrollDuration;
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

/** Resolve+validate the aspect ratio: default when absent, fail-loud on unknown. */
export function resolveAspectRatio(aspectRatio?: string): BrollAspectRatio {
  if (aspectRatio === undefined) {
    return DEFAULT_ASPECT_RATIO;
  }
  if (!ASPECT_RATIO_SET.has(aspectRatio)) {
    throw new Error(`Unsupported B-roll aspect ratio: ${aspectRatio}`);
  }
  return aspectRatio as BrollAspectRatio;
}

/** Resolve+validate the duration: default when absent, fail-loud on unknown. */
export function resolveDuration(duration?: number): BrollDuration {
  if (duration === undefined) {
    return DEFAULT_DURATION;
  }
  if (!DURATION_SET.has(duration)) {
    throw new Error(
      `Unsupported B-roll duration: ${duration}s (allowed: ${BROLL_DURATIONS.join(", ")})`,
    );
  }
  return duration as BrollDuration;
}

/** Require a non-empty http(s) URL; fail loud with a labelled message. */
function requireHttpUrl(value: string | undefined, label: string): string {
  const trimmed = (value ?? "").trim();
  if (!trimmed) {
    throw new Error(`B-roll ${label} URL is empty`);
  }
  if (!/^https?:\/\//i.test(trimmed)) {
    throw new Error(`B-roll ${label} URL must be http(s): ${trimmed}`);
  }
  return trimmed;
}

/**
 * Build the Muapi request body for a B-roll generation: the product photo, the
 * motion prompt, and the aspect ratio + duration. A blank/absent prompt falls
 * back to {@link DEFAULT_MOTION_PROMPT}. Throws on a missing/non-http product
 * image, or an unsupported aspect ratio / duration.
 */
export function buildBrollParams(request: {
  productImageUrl: string;
  prompt?: string;
  aspectRatio?: string;
  duration?: number;
}): MuapiGenerateParams {
  const prompt = request.prompt?.trim() || DEFAULT_MOTION_PROMPT;
  return {
    prompt,
    image_url: requireHttpUrl(request.productImageUrl, "product"),
    aspect_ratio: resolveAspectRatio(request.aspectRatio),
    duration: resolveDuration(request.duration),
  };
}

export interface UgcBrollConfig {
  muapi?: MuapiGenerate;
  router?: ModelRouter;
}

export class UgcBrollService {
  private readonly muapi: MuapiGenerate;
  private readonly router: ModelRouter;

  constructor(config: UgcBrollConfig = {}) {
    this.muapi = config.muapi ?? defaultMuapi;
    this.router = config.router ?? modelRouter;
  }

  /**
   * Animate a product photo into a B-roll clip. Throws on invalid inputs
   * (before any Muapi call) or a Muapi failure (the caller decides whether
   * that's fatal / retryable). The Muapi service logs the call.
   */
  async generateBroll(request: UgcBrollRequest): Promise<UgcBrollResult> {
    const aspectRatio = resolveAspectRatio(request.aspectRatio);
    const duration = resolveDuration(request.duration);
    const params = buildBrollParams({
      productImageUrl: request.productImageUrl,
      prompt: request.prompt,
      aspectRatio,
      duration,
    });
    const model = this.router.getModel("video_animate", request.quality ?? "standard");

    const generated = await this.muapi(model, params, { step: BROLL_STEP });

    return {
      videoUrl: generated.imageUrl, // outputs[0] — the B-roll clip URL
      aspectRatio,
      duration,
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

export const ugcBrollService = new UgcBrollService();
