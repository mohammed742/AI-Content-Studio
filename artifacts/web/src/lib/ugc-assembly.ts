/**
 * DEV-32 (STU-27): UGC video assembly — the fifth step of the Phase 3 UGC
 * Video Pipeline (Script → Voiceover → Lip-sync → B-roll → **Assembly** →
 * Reframe). Given the ordered UGC clips produced by the earlier steps, it
 * concatenates them into a single seamless master video via Muapi's
 * `video-combiner` model (routed through the Model Router, DEV-18, as the new
 * `video_assemble` asset type).
 *
 * ## Path order (reversed 2026-08-09, DEV-32 re-run)
 *
 * **Server-side FFmpeg (`ffmpeg.ts`) is the primary path; `video-combiner` is
 * the fallback.** The 2026-07-10 plan correction had it the other way round —
 * `video-combiner` ($0.05) was made primary to dodge the FFmpeg-on-Replit risk,
 * and the FFmpeg side was never built at all. The human reverted that ordering,
 * which also restores what DEV-32's Linear title said from the start.
 *
 * What this buys: assembly becomes free (no paid model call), it stops
 * depending on a model whose completion was never verified (`video-combiner`
 * returned 503 "at capacity" for ~20h during the original build), and clip
 * normalisation is under our control. What it costs: a CPU-bound encode now
 * runs inside the request on Replit autoscale — see the risk note in
 * `plan-phase-3.md`.
 *
 * The fallback fires on **any** FFmpeg failure — missing binary, non-zero exit,
 * clip download failure, timeout, or a failed upload of the encoded master —
 * because a master we cannot hand to the reframe step is a failed path whatever
 * the cause. Caller errors (too few clips, an unsupported aspect ratio) are
 * validated up front and throw instead: they would fail identically on both
 * paths, so spending $0.05 to rediscover that is pure waste.
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
import { DEFAULT_FPS, type ConcatResult, type ConcatTarget } from "./ffmpeg.ts";
import { persistentPipelineLogger } from "./pipeline-log.ts";
import type {
  MuapiGenerateParams,
  MuapiGenerateResult,
  PipelineLogEntry,
  PipelineLogger,
} from "@/lib/muapi";

/** Pipeline-log step label for the assembly call. */
export const ASSEMBLY_STEP = "execute:ugc_assembly";

/** Which path produced the master. Recorded on the result for QA + logs. */
export type AssemblyPath = "ffmpeg" | "video-combiner";

/**
 * Stand-in for a model name on the FFmpeg path. Assembly there calls no model
 * at all, but `UgcAssemblyResult.model` feeds pipeline logging, which wants a
 * non-empty label.
 */
export const FFMPEG_ASSEMBLY_LABEL = "ffmpeg";

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

/**
 * Concrete output geometry per aspect ratio, for the FFmpeg path.
 *
 * `video-combiner` accepts the ratio as an enum and works the pixels out
 * itself; FFmpeg needs real numbers, so the mapping has to live somewhere and
 * this is the module that owns the ratio vocabulary. Every dimension is even —
 * `yuv420p` subsamples chroma 2×2 and rejects odd dimensions.
 *
 * ⚠️ **`auto` is the one place the two paths genuinely differ.** For
 * `video-combiner`, `auto` means "inherit the first clip's ratio". FFmpeg has
 * no such concept without probing, so `auto` resolves to 16:9 — the documented
 * UGC master orientation (both the talking head and the B-roll default to
 * 16:9, and the DEV-31 reframe derives 9:16 + 1:1 from it). A caller who needs
 * something else must say so explicitly.
 */
export const ASPECT_DIMENSIONS: Record<
  AssemblyAspectRatio,
  { width: number; height: number }
> = {
  auto: { width: 1280, height: 720 },
  "16:9": { width: 1280, height: 720 },
  "9:16": { width: 720, height: 1280 },
  "1:1": { width: 1080, height: 1080 },
  "4:3": { width: 960, height: 720 },
  "3:4": { width: 720, height: 960 },
  "21:9": { width: 1680, height: 720 },
  "9:21": { width: 720, height: 1680 },
};

/** Map an assembly aspect ratio to the concrete target `ffmpeg.ts` needs. */
export function resolveConcatTarget(aspectRatio: AssemblyAspectRatio): ConcatTarget {
  const { width, height } = ASPECT_DIMENSIONS[aspectRatio];
  return { width, height, fps: DEFAULT_FPS };
}

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
  /**
   * Owner of the render, used to scope the R2 key of the FFmpeg-encoded master.
   * Optional: the fallback path returns a Muapi CDN URL and stores nothing.
   */
  userId?: string;
}

export interface UgcAssemblyResult {
  /** URL of the combined master video (feeds the DEV-31 reframe step). */
  videoUrl: string;
  /** The aspect ratio actually used. */
  aspectRatio: AssemblyAspectRatio;
  /** The number of clips combined. */
  clipCount: number;
  /** Muapi cost in USD (COGS, hidden from the user). Always 0 on the FFmpeg path. */
  cost: number;
  model: string;
  /** Which path produced this master. */
  path: AssemblyPath;
  /** Why FFmpeg was abandoned — set only when {@link path} is the fallback. */
  fallbackReason?: string;
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

/** The slice of `FfmpegService` assembly depends on (keeps the seam narrow). */
export interface AssemblyFfmpeg {
  concatVideos(request: {
    clipUrls: string[];
    target: ConcatTarget;
  }): Promise<ConcatResult>;
}

/** Persist the FFmpeg-encoded master and return a publicly fetchable URL. */
export type UploadMaster = (
  buffer: Buffer,
  contentType: string,
  userId?: string,
) => Promise<string>;

export interface UgcAssemblyConfig {
  ffmpeg?: AssemblyFfmpeg;
  upload?: UploadMaster;
  muapi?: MuapiGenerate;
  router?: ModelRouter;
  /** Pipeline logger for the FFmpeg leg. See {@link UgcAssemblyService.log}. */
  logger?: PipelineLogger;
}

export class UgcAssemblyService {
  private readonly ffmpeg: AssemblyFfmpeg;
  private readonly upload: UploadMaster;
  private readonly muapi: MuapiGenerate;
  private readonly router: ModelRouter;
  private readonly logger: PipelineLogger;

  constructor(config: UgcAssemblyConfig = {}) {
    this.ffmpeg = config.ffmpeg ?? defaultFfmpeg;
    this.upload = config.upload ?? defaultUpload;
    this.muapi = config.muapi ?? defaultMuapi;
    this.router = config.router ?? modelRouter;
    this.logger = config.logger ?? persistentPipelineLogger;
  }

  /**
   * Stitch an ordered list of UGC clips into one master video: FFmpeg first,
   * `video-combiner` if that fails for any reason.
   *
   * Throws on invalid inputs (before either path runs) and on a fallback
   * failure — if both paths are gone the caller must know, so the UGC Job can
   * park at `failed` and offer a retry from this step.
   */
  async assembleVideo(request: UgcAssemblyRequest): Promise<UgcAssemblyResult> {
    // Validate once, up front. A caller error fails identically on both paths,
    // so it must never be mistaken for "FFmpeg broke" and cost a paid call.
    const aspectRatio = resolveAspectRatio(request.aspectRatio);
    const clips = resolveClips(request.clips);

    const startedAt = Date.now();
    try {
      const concat = await this.ffmpeg.concatVideos({
        clipUrls: clips,
        target: resolveConcatTarget(aspectRatio),
      });
      // The upload is inside the try on purpose: the reframe step fetches this
      // master over HTTP, so bytes we could not publish are as useless as bytes
      // we could not encode.
      const videoUrl = await this.upload(
        concat.buffer,
        concat.contentType,
        request.userId,
      );

      this.log({
        step: ASSEMBLY_STEP,
        model: FFMPEG_ASSEMBLY_LABEL,
        durationMs: Date.now() - startedAt,
        success: true,
        cost: 0,
      });

      return {
        videoUrl,
        aspectRatio,
        clipCount: concat.clipCount,
        cost: 0, // no model call — the encode is our own CPU
        model: FFMPEG_ASSEMBLY_LABEL,
        path: "ffmpeg",
      };
    } catch (error) {
      const fallbackReason = error instanceof Error ? error.message : String(error);
      this.log({
        step: ASSEMBLY_STEP,
        model: FFMPEG_ASSEMBLY_LABEL,
        durationMs: Date.now() - startedAt,
        success: false,
        cost: 0, // a failed encode bills nothing; the fallback logs its own $0.05
        error: fallbackReason,
      });
      const result = await this.assembleWithCombiner(clips, aspectRatio, request.quality);
      return { ...result, fallbackReason };
    }
  }

  /**
   * Record the FFmpeg leg as a `pipeline_logs` row.
   *
   * Every other Agent Loop step is logged for free by `muapiService.generate`,
   * which takes the step label and writes the row itself. The FFmpeg path calls
   * no model, so without this it wrote **nothing** — and since the caller
   * (`ugc-pipeline.ts`) keeps only `videoUrl`/`cost`, dropping `path` and
   * `fallbackReason`, "did the primary path hold?" had no answer anywhere. That
   * matters: a systematically broken primary (a missing binary, a misconfigured
   * R2 failing every upload) would bill the $0.05 fallback on every render and
   * look completely normal.
   *
   * Only the FFmpeg leg is logged here — the fallback still emits its own row
   * through Muapi under the same step, so a fallback reads as the pair
   * "`ffmpeg` failed → `video-combiner` succeeded" and the step's success rate
   * becomes a real measure of how often the primary holds. `model` carries the
   * path; cost stays accurate because the FFmpeg row is always 0.
   *
   * `durationMs` is the other reason this exists: it is the only measurement of
   * the CPU-bound encode that the Replit-autoscale risk is about.
   */
  private log(entry: PipelineLogEntry): void {
    try {
      this.logger(entry);
    } catch (loggerError) {
      // Bookkeeping must never break a render (mirrors `MuapiService.log`).
      console.error("[ugc-assembly] pipeline logger threw:", loggerError);
    }
  }

  /** The original DEV-32 path, now the fallback. Unchanged in behaviour. */
  private async assembleWithCombiner(
    clips: string[],
    aspectRatio: AssemblyAspectRatio,
    quality?: Quality,
  ): Promise<UgcAssemblyResult> {
    const params = buildAssemblyParams({ clips, aspectRatio });
    const model = this.router.getModel("video_assemble", quality ?? "standard");

    const generated = await this.muapi(model, params, { step: ASSEMBLY_STEP });

    return {
      videoUrl: generated.imageUrl, // outputs[0] — the combined master video URL
      aspectRatio,
      clipCount: (params.videos_list as string[]).length,
      cost: generated.cost,
      model,
      path: "video-combiner",
    };
  }
}

/** Default Muapi call — the DEV-15 service (which logs each call). */
const defaultMuapi: MuapiGenerate = async (model, params, options) => {
  const { muapiService } = await import("@/lib/muapi");
  return muapiService.generate(model, params, options);
};

/** Default FFmpeg seam — lazily imported so this module loads without a binary. */
const defaultFfmpeg: AssemblyFfmpeg = {
  async concatVideos(request) {
    const { ffmpegService } = await import("./ffmpeg.ts");
    return ffmpegService.concatVideos(request);
  },
};

/**
 * Default master upload — R2, following the `asset-kits/{userId}/…` key
 * convention (`asset-kit.ts`, `carousel.ts`). The master is an *intermediate*
 * (the reframe step consumes it and DEV-33 saves the reframed variants as the
 * real kit), so it lands under its own prefix rather than pretending to be one.
 */
const defaultUpload: UploadMaster = async (buffer, contentType, userId) => {
  const { r2Service } = await import("@/lib/r2");
  const { randomUUID } = await import("node:crypto");
  const key = `ugc-assembly/${userId ?? "shared"}/${Date.now()}-${randomUUID()}.mp4`;
  return r2Service.upload(key, buffer, contentType);
};

export const ugcAssemblyService = new UgcAssemblyService();
