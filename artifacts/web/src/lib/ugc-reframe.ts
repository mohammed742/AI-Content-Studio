/**
 * DEV-31 (STU-28): UGC multi-format reframe — the sixth and final generation
 * step of the Phase 3 UGC Video Pipeline (Script → Voiceover → Lip-sync →
 * B-roll → Assembly → **Reframe**). Given the assembled master video (the
 * DEV-32 `video-combiner` output), it crops+reframes it into the aspect ratios
 * the social platforms want — 9:16 (TikTok / Reels / Shorts), 1:1 (feed), 16:9
 * (landscape) — via Muapi's `autocrop` model (AI subject tracking), routed
 * through the Model Router (DEV-18) as the new `video_reframe` asset type.
 *
 * New asset type (not a reuse of the existing image `reframe` route): the
 * `reframe` type routes to `ideogram-v3-reframe`, an *image* reframe the DEV-19
 * product-photo pipeline uses (`image_url` in, image out). `autocrop` is a
 * genuinely new video→video op (`video_url` in, video out), so it earns its own
 * routing entry — mirroring how DEV-32 assembly added `video_assemble` rather
 * than overloading a picture route.
 *
 * Model correction: the Phase-3 plan (2026-07-10, human-approved) replaced the
 * original `luma-flash-reframe` ($0.35/reframe) with `autocrop` ($0.05) to hold
 * the <$1/video budget. `luma-flash-reframe` is also a *video* reframe (needs
 * `video_url`) but is 7× the price and has a different schema (no segment
 * window), so it stays the documented manual premium fallback if `autocrop`
 * subject tracking is unacceptable — not wired this slice.
 *
 * Model contract (verified live against `GET /api/v1/models/autocrop`,
 * 2026-07-26):
 *   POST body → `{ video_url, start_time, end_time, aspect_ratio? }`.
 *   `video_url` is the required source clip; `start_time`/`end_time` are the
 *   required int-second segment window (defaults 0 / 60, range 0–86400,
 *   `end > start`); `aspect_ratio` is an enum (`9:16`/`16:9`/`1:1`/`4:5`/`4:3`/
 *   `3:4`, default `9:16`). Output is a single cropped video URL.
 *
 * Testability mirrors the sibling services (`ugc-assembly.ts`, `ugc-broll.ts`):
 * the Muapi call and the router are injectable, so input validation, param
 * assembly, routing, the per-format fan-out, and cost/result mapping unit-test
 * with fakes. The default Muapi call lazily loads the DEV-15 service (which logs
 * each call), so the module loads under the bare Node test runner.
 *
 * Scope: the reframe primitive only. Persistence (uploading the variants to R2
 * and building the multi-format Asset Kit, plan step 8), Server Actions, and UI
 * are the DEV-33 review-UI slice.
 */
import { modelRouter, ModelRouter, type Quality } from "./model-router.ts";
import type { MuapiGenerateParams, MuapiGenerateResult } from "@/lib/muapi";

/** Pipeline-log step label for the reframe call. */
const REFRAME_STEP = "execute:ugc_reframe";

/** Output aspect ratios `autocrop` accepts (schema enum). */
export const REFRAME_ASPECT_RATIOS = [
  "9:16",
  "16:9",
  "1:1",
  "4:5",
  "4:3",
  "3:4",
] as const;
export type ReframeAspectRatio = (typeof REFRAME_ASPECT_RATIOS)[number];

/** The model default — 9:16, the primary vertical UGC format. The agent may override. */
export const DEFAULT_ASPECT_RATIO: ReframeAspectRatio = "9:16";

/**
 * The formats the plan derives for every UGC ad (step 7): 9:16 (TikTok / Reels
 * / Shorts) + 1:1 (feed) + 16:9 (landscape). The default set for
 * {@link UgcReframeService.reframeToFormats}; the pipeline orchestrator may pass
 * a subset (e.g. drop the master's native ratio to save a reframe).
 */
export const UGC_TARGET_FORMATS: ReframeAspectRatio[] = ["9:16", "1:1", "16:9"];

/** Segment-window defaults + bound from the live schema (int seconds). */
export const DEFAULT_START_TIME = 0;
export const DEFAULT_END_TIME = 60;
export const MAX_TIME_SECONDS = 86400;

const ASPECT_RATIO_SET = new Set<string>(REFRAME_ASPECT_RATIOS);

export interface ReframeSegment {
  start_time: number;
  end_time: number;
}

export interface UgcReframeRequest {
  /** Source video URL to reframe (the DEV-32 assembled master, or any http(s) clip). */
  videoUrl: string;
  /** Target aspect ratio (default {@link DEFAULT_ASPECT_RATIO}). */
  aspectRatio?: string;
  /** Segment start in whole seconds (default {@link DEFAULT_START_TIME}). */
  startTime?: number;
  /** Segment end in whole seconds (default {@link DEFAULT_END_TIME}); must exceed start. */
  endTime?: number;
  /** Route tier (default `standard`). `video_reframe` has no premium tier. */
  quality?: Quality;
}

export interface UgcReframeResult {
  /** URL of the reframed video variant. */
  videoUrl: string;
  /** The aspect ratio actually produced. */
  aspectRatio: ReframeAspectRatio;
  /** Muapi cost in USD (COGS, hidden from the user). */
  cost: number;
  model: string;
}

export interface UgcReframeToFormatsRequest {
  /** Source video URL to reframe into every requested format. */
  videoUrl: string;
  /** Target aspect ratios (default {@link UGC_TARGET_FORMATS}). */
  formats?: string[];
  /** Segment start in whole seconds (default {@link DEFAULT_START_TIME}). */
  startTime?: number;
  /** Segment end in whole seconds (default {@link DEFAULT_END_TIME}); must exceed start. */
  endTime?: number;
  /** Route tier (default `standard`). */
  quality?: Quality;
}

export interface UgcReframeVariantsResult {
  /** One reframed variant per requested format, in request order. */
  variants: UgcReframeResult[];
  /** Summed Muapi cost across the variants (COGS, hidden from the user). */
  totalCost: number;
}

/** The Muapi generation call. Injectable (shared shape with the siblings). */
export type MuapiGenerate = (
  model: string,
  params: MuapiGenerateParams,
  options?: { step?: string },
) => Promise<MuapiGenerateResult>;

/** Resolve+validate the aspect ratio: default when absent, fail-loud on unknown. */
export function resolveAspectRatio(aspectRatio?: string): ReframeAspectRatio {
  if (aspectRatio === undefined) {
    return DEFAULT_ASPECT_RATIO;
  }
  if (!ASPECT_RATIO_SET.has(aspectRatio)) {
    throw new Error(`Unsupported reframe aspect ratio: ${aspectRatio}`);
  }
  return aspectRatio as ReframeAspectRatio;
}

/** A whole-second time within the schema range [0, MAX], fail-loud otherwise. */
function requireSecond(value: number, label: string): number {
  if (!Number.isInteger(value) || value < 0 || value > MAX_TIME_SECONDS) {
    throw new Error(
      `Reframe ${label} must be a whole second in 0..${MAX_TIME_SECONDS} (got ${value})`,
    );
  }
  return value;
}

/**
 * Resolve+validate the crop segment window: whole-second `start`/`end` in
 * [0, {@link MAX_TIME_SECONDS}] with `end > start`. Defaults to the schema's
 * 0 / 60. Throws on non-integer, out-of-range, or inverted windows.
 */
export function resolveSegment(startTime?: number, endTime?: number): ReframeSegment {
  const start = requireSecond(startTime ?? DEFAULT_START_TIME, "start_time");
  const end = requireSecond(endTime ?? DEFAULT_END_TIME, "end_time");
  if (end <= start) {
    throw new Error(`Reframe end_time must be greater than start_time (got ${start}..${end})`);
  }
  return { start_time: start, end_time: end };
}

/** Require a non-empty http(s) URL; fail loud with a labelled message. */
function requireHttpUrl(value: string | undefined, label: string): string {
  const trimmed = (value ?? "").trim();
  if (!trimmed) {
    throw new Error(`Reframe ${label} URL is empty`);
  }
  if (!/^https?:\/\//i.test(trimmed)) {
    throw new Error(`Reframe ${label} URL must be http(s): ${trimmed}`);
  }
  return trimmed;
}

/**
 * Build the Muapi request body for a single reframe: the source video, the
 * segment window, and the target aspect ratio. Throws on a missing/non-http
 * video, an out-of-range/inverted segment, or an unsupported aspect ratio.
 */
export function buildReframeParams(request: {
  videoUrl: string;
  aspectRatio?: string;
  startTime?: number;
  endTime?: number;
}): MuapiGenerateParams {
  const segment = resolveSegment(request.startTime, request.endTime);
  return {
    video_url: requireHttpUrl(request.videoUrl, "video"),
    aspect_ratio: resolveAspectRatio(request.aspectRatio),
    start_time: segment.start_time,
    end_time: segment.end_time,
  };
}

export interface UgcReframeConfig {
  muapi?: MuapiGenerate;
  router?: ModelRouter;
}

export class UgcReframeService {
  private readonly muapi: MuapiGenerate;
  private readonly router: ModelRouter;

  constructor(config: UgcReframeConfig = {}) {
    this.muapi = config.muapi ?? defaultMuapi;
    this.router = config.router ?? modelRouter;
  }

  /**
   * Reframe one source video into one target aspect ratio. Throws on invalid
   * inputs (before any Muapi call) or a Muapi failure (the caller decides
   * whether that's fatal / retryable). The Muapi service logs the call.
   */
  async reframeVideo(request: UgcReframeRequest): Promise<UgcReframeResult> {
    const aspectRatio = resolveAspectRatio(request.aspectRatio);
    const params = buildReframeParams({
      videoUrl: request.videoUrl,
      aspectRatio,
      startTime: request.startTime,
      endTime: request.endTime,
    });
    const model = this.router.getModel("video_reframe", request.quality ?? "standard");

    const generated = await this.muapi(model, params, { step: REFRAME_STEP });

    return {
      videoUrl: generated.imageUrl, // outputs[0] — the reframed video URL
      aspectRatio,
      cost: generated.cost,
      model,
    };
  }

  /**
   * Reframe one source video into several aspect ratios (default the plan's
   * {@link UGC_TARGET_FORMATS}). Fails loud on any bad format/segment *before*
   * firing (so an invalid request never spends), then reframes the formats in
   * parallel and returns the variants in request order + the summed cost.
   * Per-step retry of a single failed format is the pipeline orchestrator's
   * job (DEV-33) — a failure here rejects.
   */
  async reframeToFormats(
    request: UgcReframeToFormatsRequest,
  ): Promise<UgcReframeVariantsResult> {
    const formats = request.formats ?? UGC_TARGET_FORMATS;
    if (formats.length === 0) {
      throw new Error("Reframe needs at least one target format");
    }
    // Validate everything up front so a bad format/segment/URL never spends.
    const aspectRatios = formats.map((f) => resolveAspectRatio(f));
    const segment = resolveSegment(request.startTime, request.endTime);
    const videoUrl = requireHttpUrl(request.videoUrl, "video");

    const variants = await Promise.all(
      aspectRatios.map((aspectRatio) =>
        this.reframeVideo({
          videoUrl,
          aspectRatio,
          startTime: segment.start_time,
          endTime: segment.end_time,
          quality: request.quality,
        }),
      ),
    );

    return {
      variants,
      totalCost: variants.reduce((sum, v) => sum + v.cost, 0),
    };
  }
}

/** Default Muapi call — the DEV-15 service (which logs each call). */
const defaultMuapi: MuapiGenerate = async (model, params, options) => {
  const { muapiService } = await import("@/lib/muapi");
  return muapiService.generate(model, params, options);
};

export const ugcReframeService = new UgcReframeService();
