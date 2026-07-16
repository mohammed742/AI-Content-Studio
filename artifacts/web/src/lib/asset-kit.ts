/**
 * DEV-23: Asset Kit assembly — the Assemble step of the Agent Loop
 * (Plan → Retrieve → Route → Execute → **Assemble** → Publish).
 *
 * Combines generated media + text into an Asset Kit (CONTEXT.md — "the atomic
 * output of the generation pipeline"): downloads the media from the
 * generation URL (third-party URLs aren't trusted to stay alive — DEV-8),
 * uploads it to R2, saves the kit to the `asset_kits` table, then auto-embeds
 * the kit's title + caption back into the Brand Knowledge Base as a
 * `generation`-kind embedding (CONTEXT.md → "Auto-Embedding" — the system
 * learns from every generation). The embed-back is non-fatal: a kit is never
 * lost because a background learning step failed.
 *
 * Testability mirrors the other Phase-2 services: all four side effects
 * (download / upload / save / embed) are injectable, so assembly order,
 * extension handling, and failure semantics unit-test with fakes. Defaults
 * lazily load the real R2/Drizzle/embedding services so the module loads
 * under the bare Node test runner.
 */
import type { AssetKit, InsertAssetKit } from "@/db/schema";
import type { ContentType } from "./industry-templates.ts";

export type MediaType = "image" | "video";

export interface AssembleRequest {
  userId: string;
  title: string;
  contentType: ContentType;
  platform: string;
  /** The generation output URL (e.g. from the photo/graphic pipeline). */
  sourceMediaUrl: string;
  mediaType: MediaType;
  caption: string;
  hashtags: string[];
  /** Aggregate cost of the generations that produced this kit (USD). */
  cost: number;
}

export interface DownloadedMedia {
  buffer: Buffer;
  contentType: string;
}

/** Download the generated media. Injectable. */
export type MediaDownloader = (url: string) => Promise<DownloadedMedia>;
/** Upload to durable storage; returns the public URL. Injectable. */
export type MediaUploader = (
  key: string,
  buffer: Buffer,
  contentType: string,
) => Promise<string>;
/** Persist the kit row; returns the saved kit. Injectable. */
export type KitSaver = (values: InsertAssetKit) => Promise<AssetKit>;
/** Embed kit text back into the Brand Knowledge Base (append). Injectable. */
export type GenerationEmbedder = (
  userId: string,
  content: string,
  sourceId: string,
) => Promise<void>;

/** Map a media content-type to a file extension for the R2 key. */
export function extensionFor(contentType: string, mediaType: MediaType): string {
  const known: Record<string, string> = {
    "image/png": "png",
    "image/jpeg": "jpg",
    "image/webp": "webp",
    "image/gif": "gif",
    "video/mp4": "mp4",
    "video/webm": "webm",
    "video/quicktime": "mov",
  };
  return known[contentType.split(";")[0].trim()] ?? (mediaType === "video" ? "mp4" : "png");
}

export interface AssetKitServiceConfig {
  download?: MediaDownloader;
  upload?: MediaUploader;
  save?: KitSaver;
  embed?: GenerationEmbedder;
  now?: () => number;
}

export class AssetKitService {
  private readonly download: MediaDownloader;
  private readonly upload: MediaUploader;
  private readonly save: KitSaver;
  private readonly embed: GenerationEmbedder;
  private readonly now: () => number;

  constructor(config: AssetKitServiceConfig = {}) {
    this.download = config.download ?? defaultDownload;
    this.upload = config.upload ?? defaultUpload;
    this.save = config.save ?? defaultSave;
    this.embed = config.embed ?? defaultEmbed;
    this.now = config.now ?? (() => Date.now());
  }

  /**
   * Assemble and persist an Asset Kit: download the media, upload it to R2,
   * save the row, then embed the kit's text back into the knowledge base
   * (non-fatal). Throws on download/upload/save failure.
   */
  async assemble(request: AssembleRequest): Promise<AssetKit> {
    const media = await this.download(request.sourceMediaUrl);
    const extension = extensionFor(media.contentType, request.mediaType);
    const key = `asset-kits/${request.userId}/${this.now()}.${extension}`;
    const mediaUrl = await this.upload(key, media.buffer, media.contentType);

    const kit = await this.save({
      userId: request.userId,
      title: request.title,
      contentType: request.contentType,
      platform: request.platform,
      mediaUrl,
      mediaType: request.mediaType,
      caption: request.caption,
      hashtags: request.hashtags,
      cost: request.cost,
      status: "ready",
    });

    // Auto-Embedding: the knowledge base learns from every generation. A
    // failure here is logged, never fatal — the kit is already persisted.
    try {
      await this.embed(kit.userId, `${kit.title}. ${kit.caption}`, kit.id);
    } catch (error) {
      console.error(
        "[asset-kit] generation embed-back failed:",
        error instanceof Error ? error.message : error,
      );
    }

    return kit;
  }
}

/** Default downloader — fetch the generation URL into a buffer. */
const defaultDownload: MediaDownloader = async (url) => {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(
      `Failed to download generated media (${response.status} ${response.statusText})`,
    );
  }
  return {
    buffer: Buffer.from(await response.arrayBuffer()),
    contentType: response.headers.get("content-type") ?? "application/octet-stream",
  };
};

/** Default uploader — the DEV-8 R2 service. */
const defaultUpload: MediaUploader = async (key, buffer, contentType) => {
  const { r2Service } = await import("@/lib/r2");
  return r2Service.upload(key, buffer, contentType);
};

/** Default saver — Drizzle insert into asset_kits. */
const defaultSave: KitSaver = async (values) => {
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

export const assetKitService = new AssetKitService();
