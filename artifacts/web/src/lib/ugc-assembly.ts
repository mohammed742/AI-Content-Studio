/**
 * DEV-32 (STU-27): UGC video assembly — the fifth step of the Phase 3 UGC
 * Video Pipeline (Script → Voiceover → Lip-sync → B-roll → **Assembly** →
 * Reframe). Given the ordered UGC clips produced by the earlier steps, it
 * concatenates them into a single seamless master video via Muapi's
 * `video-combiner` model (routed through the Model Router, DEV-18, as the new
 * `video_assemble` asset type).
 *
 * Assembly is the primary path chosen by the plan (`plan-phase-3.md` step 6)
 * over the original server-side FFmpeg: `video-combiner` ($0.05) kills the
 * FFmpeg-on-Replit risk. Server-side FFmpeg remains the documented fallback if
 * transition quality is unacceptable (none built this slice — see PROGRESS.md).
 *
 * This service is a thin, generic assembly primitive: it stitches an **ordered
 * list of clip URLs** (≥2, ≤20). The plan's conceptual layout — talking head
 * (0-8s) → B-roll (8-12s) → talking-head CTA (12-15s) — is realised by the
 * caller ordering the clips it passes; deciding *which* clips (and whether the
 * talking head is one clip or two) belongs to the pipeline orchestrator in a
 * later slice, not to the assembly step.
 *
 * New asset type (not a `video_animate` reuse like B-roll): B-roll animates an
 * image into a video, which the existing `video_animate` route already covers;
 * assembly is a genuinely new video→video op, so it gets its own routing entry
 * — mirroring how the voiceover/lip-sync steps each added a type.
 *
 * Model contract (verified live against `GET /api/v1/models/video-combiner`,
 * 2026-07-25):
 *   POST body → `{ videos_list, aspect_ratio? }`. `videos_list` is a required
 *   ordered array of clip URLs (each 5-60s, max 20). `aspect_ratio` is an enum
 *   (`auto`/`16:9`/`9:16`/`1:1`/`4:3`/`3:4`/`21:9`/`9:21`, default `auto` — the
 *   first clip's ratio). Output is a single combined video URL.
 *
 * Testability mirrors the sibling services (`ugc-broll.ts`, `ugc-lipsync.ts`):
 * the Muapi call and the router are injectable, so input validation, param
 * assembly, routing, and cost/result mapping unit-test with fakes. The default
 * Muapi call lazily loads the DEV-15 service (which logs each call), so the
 * module loads under the bare Node test runner.
 *
 * Scope: assembly only. Reframe, persistence, and UI are later Phase-3 slices
 * (DEV-31/33).
 */
import { modelRouter, ModelRouter, type Quality } from "./model-router.ts";
import type { MuapiGenerateParams, MuapiGenerateResult } from "@/lib/muapi";

/** Pipeline-log step label for the assembly call. */
const ASSEMBLY_STEP = "execute:ugc_assembly";

/** Output aspect ratios `video-combiner` accepts (schema enum). */
export const ASSEMBLY_ASPECT_RATIOS = [
  "auto",
  "16:9",
  "9:16",
  "1:1",
  "4:3",
  "3:4",
  "21:9",
  "9:21",
] as const;
export type AssemblyAspectRatio = (typeof ASSEMBLY_ASPECT_RATIOS)[number];

/**
 * The model default. `auto` preserves the first clip's aspect ratio — the UGC
 * master starts from the 16:9 talking head / B-roll, and the DEV-31 reframe
 * step derives 9:16 + 1:1 from this master. The agent may override.
 */
export const DEFAULT_ASPECT_RATIO: AssemblyAspectRatio = "auto";

/** Minimum clips to combine (fewer than two is nothing to stitch). */
export const MIN_CLIPS = 2;
/** Model maximum (`videos_list.maxItems` in the live schema). */
export const MAX_CLIPS = 20;

const ASPECT_RATIO_SET = new Set<string>(ASSEMBLY_ASPECT_RATIOS);

export interface UgcAssemblyRequest {
  /**
   * Ordered clip URLs to stitch (e.g. talking head → B-roll → CTA). Must hold
   * {@link MIN_CLIPS}–{@link MAX_CLIPS} non-empty http(s) URLs.
   */
  clips: string[];
  /** Output aspect ratio (default {@link DEFAULT_ASPECT_RATIO}). */
  aspectRatio?: string;
  /** Route tier (default `standard`). `video_assemble` has no premium tier. */
  quality?: Quality;
}

export interface UgcAssemblyResult {
  /** URL of the combined master video (feeds the DEV-31 reframe step). */
  videoUrl: string;
  /** The aspect ratio actually used. */
  aspectRatio: AssemblyAspectRatio;
  /** The number of clips combined. */
  clipCount: number;
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
export function resolveAspectRatio(aspectRatio?: string): AssemblyAspectRatio {
  if (aspectRatio === undefined) {
    return DEFAULT_ASPECT_RATIO;
  }
  if (!ASPECT_RATIO_SET.has(aspectRatio)) {
    throw new Error(`Unsupported assembly aspect ratio: ${aspectRatio}`);
  }
  return aspectRatio as AssemblyAspectRatio;
}

/** Require a non-empty http(s) URL; fail loud with a labelled message. */
function requireHttpUrl(value: string | undefined, label: string): string {
  const trimmed = (value ?? "").trim();
  if (!trimmed) {
    throw new Error(`Assembly ${label} URL is empty`);
  }
  if (!/^https?:\/\//i.test(trimmed)) {
    throw new Error(`Assembly ${label} URL must be http(s): ${trimmed}`);
  }
  return trimmed;
}

/**
 * Validate + normalise the ordered clip list: {@link MIN_CLIPS}–{@link MAX_CLIPS}
 * entries, each a non-empty http(s) URL (trimmed). Throws on an out-of-range
 * count or any non-http clip.
 */
export function resolveClips(clips: string[] | undefined): string[] {
  const list = clips ?? [];
  if (list.length < MIN_CLIPS) {
    throw new Error(
      `Assembly needs at least ${MIN_CLIPS} clips to combine (got ${list.length})`,
    );
  }
  if (list.length > MAX_CLIPS) {
    throw new Error(
      `Assembly accepts at most ${MAX_CLIPS} clips (got ${list.length})`,
    );
  }
  return list.map((clip, index) => requireHttpUrl(clip, `clip ${index + 1}`));
}

/**
 * Build the Muapi request body for a video assembly: the ordered clip list and
 * the output aspect ratio. Throws on an out-of-range clip count, a non-http
 * clip, or an unsupported aspect ratio.
 */
export function buildAssemblyParams(request: {
  clips: string[];
  aspectRatio?: string;
}): MuapiGenerateParams {
  return {
    videos_list: resolveClips(request.clips),
    aspect_ratio: resolveAspectRatio(request.aspectRatio),
  };
}

export interface UgcAssemblyConfig {
  muapi?: MuapiGenerate;
  router?: ModelRouter;
}

export class UgcAssemblyService {
  private readonly muapi: MuapiGenerate;
  private readonly router: ModelRouter;

  constructor(config: UgcAssemblyConfig = {}) {
    this.muapi = config.muapi ?? defaultMuapi;
    this.router = config.router ?? modelRouter;
  }

  /**
   * Stitch an ordered list of UGC clips into one master video. Throws on
   * invalid inputs (before any Muapi call) or a Muapi failure (the caller
   * decides whether that's fatal / retryable). The Muapi service logs the call.
   */
  async assembleVideo(request: UgcAssemblyRequest): Promise<UgcAssemblyResult> {
    const aspectRatio = resolveAspectRatio(request.aspectRatio);
    const params = buildAssemblyParams({
      clips: request.clips,
      aspectRatio,
    });
    const model = this.router.getModel("video_assemble", request.quality ?? "standard");

    const generated = await this.muapi(model, params, { step: ASSEMBLY_STEP });

    return {
      videoUrl: generated.imageUrl, // outputs[0] — the combined master video URL
      aspectRatio,
      clipCount: (params.videos_list as string[]).length,
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

export const ugcAssemblyService = new UgcAssemblyService();
