/**
 * STU-C5 (DEV-67): Carousel assembly — a multi-image Asset Kit.
 *
 * A Carousel (CONTEXT.md → "Carousel") is N already-generated frames stitched
 * into ONE Asset Kit that shares a single caption/hashtag set — the how-to
 * guides, process breakdowns, style guides, and lookbooks onboarding promises.
 * The frames themselves come from the existing generation pipelines (product
 * photo / social graphic / text-graphic); this service is the Assemble step for
 * the multi-image case, mirroring `AssetKitService` (single image) and
 * `CompositeService` (two images → one).
 *
 * Frame order is load-bearing (the AC): frames are downloaded and uploaded to
 * R2 left-to-right, and the saved kit's ordered `media` array is the source of
 * truth for order in both the gallery and the kit payload. The cover
 * (`mediaUrl`/`mediaType`) mirrors frame 0 so every existing single-image
 * consumer — gallery thumbnails especially — keeps working untouched.
 *
 * All side effects (download / upload / save / embed) are injectable so
 * ordering and failure semantics unit-test with fakes; defaults lazily load the
 * real fetch/R2/Drizzle/embedding services so the module loads under the bare
 * Node test runner.
 */
import type { AssetKit, AssetKitMedia, InsertAssetKit } from "@/db/schema";
import type { ContentType } from "./industry-templates.ts";
import { extensionFor } from "./asset-kit.ts";

// Carousel frame-count bounds. Max 10 mirrors Instagram's carousel limit —
// to be verified against Muapi's publish endpoint in Phase 4 before promising
// scheduled carousel publishing (plan-phase-2-5.md step 5.4).
export const CAROUSEL_MIN_FRAMES = 2;
export const CAROUSEL_MAX_FRAMES = 10;

export interface CarouselFrameInput {
  /** The generation output URL for this frame (e.g. from the graphic pipeline). */
  sourceMediaUrl: string;
}

export interface DownloadedFrame {
  buffer: Buffer;
  contentType: string;
}

/** Download one generated frame. Injectable. */
export type FrameDownloader = (url: string) => Promise<DownloadedFrame>;
/** Upload a frame to durable storage; returns the public URL. Injectable. */
export type CarouselUploader = (
  key: string,
  buffer: Buffer,
  contentType: string,
) => Promise<string>;
/** Persist the kit row; returns the saved kit. Injectable. */
export type CarouselKitSaver = (values: InsertAssetKit) => Promise<AssetKit>;
/** Embed the kit's text back into the Brand Knowledge Base (append). Injectable. */
export type GenerationEmbedder = (
  userId: string,
  content: string,
  sourceId: string,
) => Promise<void>;

export interface AssembleCarouselRequest {
  userId: string;
  title: string;
  contentType: ContentType;
  platform: string;
  /** One caption shared across the whole carousel. */
  caption: string;
  hashtags?: string[];
  /** Aggregate cost of the generations that produced the frames (USD). */
  cost: number;
  /** Ordered frames — position in this array is the carousel order. */
  frames: CarouselFrameInput[];
}

/** R2 object key for one carousel frame — index-ordered and zero-padded. */
export function buildCarouselMediaKey(
  userId: string,
  timestamp: number,
  index: number,
  extension: string,
): string {
  return `asset-kits/${userId}/${timestamp}-carousel-${String(index).padStart(2, "0")}.${extension}`;
}

export interface CarouselServiceConfig {
  download?: FrameDownloader;
  upload?: CarouselUploader;
  save?: CarouselKitSaver;
  embed?: GenerationEmbedder;
  now?: () => number;
}

export class CarouselService {
  private readonly download: FrameDownloader;
  private readonly upload: CarouselUploader;
  private readonly save: CarouselKitSaver;
  private readonly embed: GenerationEmbedder;
  private readonly now: () => number;

  constructor(config: CarouselServiceConfig = {}) {
    this.download = config.download ?? defaultDownload;
    this.upload = config.upload ?? defaultUpload;
    this.save = config.save ?? defaultSave;
    this.embed = config.embed ?? defaultEmbed;
    this.now = config.now ?? (() => Date.now());
  }

  /**
   * Assemble N generated frames into one carousel Asset Kit: validate the
   * frame count, download every frame in order, upload each to R2, then save a
   * single kit whose ordered `media` array preserves the frame order. Throws
   * (before any upload or save) on an out-of-range frame count or a frame
   * download failure. The knowledge-base embed-back is non-fatal.
   */
  async assemble(request: AssembleCarouselRequest): Promise<AssetKit> {
    const { frames } = request;
    if (frames.length < CAROUSEL_MIN_FRAMES) {
      throw new Error(`A carousel needs at least ${CAROUSEL_MIN_FRAMES} frames`);
    }
    if (frames.length > CAROUSEL_MAX_FRAMES) {
      throw new Error(`A carousel can hold at most ${CAROUSEL_MAX_FRAMES} frames`);
    }

    // Download every frame up front so a mid-way failure can't leave orphaned
    // uploads — nothing is written until all frames are in hand (mirrors the
    // composite pipeline's "fetch both, then act" ordering).
    const downloaded = await sequential(frames, (frame) => this.download(frame.sourceMediaUrl));

    const timestamp = this.now();
    const media: AssetKitMedia[] = [];
    for (let index = 0; index < downloaded.length; index += 1) {
      const { buffer, contentType } = downloaded[index];
      const extension = extensionFor(contentType, "image");
      const key = buildCarouselMediaKey(request.userId, timestamp, index, extension);
      const url = await this.upload(key, buffer, contentType);
      media.push({ url, mediaType: "image" });
    }

    const cover = media[0];
    const kit = await this.save({
      userId: request.userId,
      title: request.title,
      contentType: request.contentType,
      platform: request.platform,
      // Cover mirrors frame 0 so single-image consumers (gallery thumbnails)
      // need no special-casing.
      mediaUrl: cover.url,
      mediaType: cover.mediaType,
      media,
      caption: request.caption,
      hashtags: request.hashtags ?? [],
      cost: request.cost,
      status: "ready",
    });

    // Auto-Embedding: the knowledge base learns from every generation. A
    // failure here is logged, never fatal — the kit is already persisted.
    try {
      await this.embed(kit.userId, `${kit.title}. ${kit.caption}`, kit.id);
    } catch (error) {
      console.error(
        "[carousel] generation embed-back failed:",
        error instanceof Error ? error.message : error,
      );
    }

    return kit;
  }
}

/** Await an async mapper over items strictly in order (left to right). */
async function sequential<T, R>(items: T[], fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = [];
  for (const item of items) {
    out.push(await fn(item));
  }
  return out;
}

/** Default downloader — fetch the generation URL into a buffer. */
const defaultDownload: FrameDownloader = async (url) => {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(
      `Failed to download carousel frame (${response.status} ${response.statusText})`,
    );
  }
  return {
    buffer: Buffer.from(await response.arrayBuffer()),
    contentType: response.headers.get("content-type") ?? "application/octet-stream",
  };
};

/** Default uploader — the DEV-8 R2 service. */
const defaultUpload: CarouselUploader = async (key, buffer, contentType) => {
  const { r2Service } = await import("@/lib/r2");
  return r2Service.upload(key, buffer, contentType);
};

/** Default saver — Drizzle insert into asset_kits. */
const defaultSave: CarouselKitSaver = async (values) => {
  const [{ db }, { assetKits }] = await Promise.all([
    import("@/db"),
    import("@/db/schema"),
  ]);
  const [kit] = await db.insert(assetKits).values(values).returning();
  return kit;
};

/** Default embedder — append one `generation`-kind row (DEV-17 embedder). */
const defaultEmbed: GenerationEmbedder = async (userId, content, sourceId) => {
  const [{ openAIEmbedder }, { db }, { brandEmbeddings }] = await Promise.all([
    import("@/lib/embeddings"),
    import("@/db"),
    import("@/db/schema"),
  ]);
  const { embeddings } = await openAIEmbedder([content]);
  await db.insert(brandEmbeddings).values({
    userId,
    kind: "generation",
    content,
    embedding: embeddings[0],
    sourceId,
  });
};

export const carouselService = new CarouselService();
