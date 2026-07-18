/**
 * STU-C3 (DEV-62): Media Library service — the user's own uploaded business
 * photos (CONTEXT.md → "Media Library"). Gives the image-to-image pipelines
 * (product photo's optional "upload" step, before/after in STU-C4) real source
 * material instead of only text-to-image generation.
 *
 * This module owns the *testable* core: magic-byte type detection (the client's
 * MIME type is attacker-controlled — same lesson as DEV-11's logo upload),
 * size/type validation, R2 object-key building, and the upload→save ordering.
 * The Server Actions in (dashboard)/library/actions.ts wire auth + FormData to
 * it. All three side effects (R2 upload, DB save/list/remove) are injectable so
 * the flow unit-tests with fakes; defaults lazily load the real R2/Drizzle
 * services so the module loads under the bare Node test runner (see DEV-15).
 */
import type { InsertMediaLibraryItem, MediaLibraryItem } from "@/db/schema";

/** Max upload size for a business photo. Photos run larger than logos (5 MB). */
export const MAX_MEDIA_BYTES = 10 * 1024 * 1024; // 10 MB

/** MIME → file extension for the allowed business-photo types. */
const TYPE_EXTENSIONS: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
};

/**
 * Detect the real image type from magic bytes. The browser-supplied MIME type
 * is untrusted, so we sniff the header instead. Returns the canonical MIME
 * type, or `null` for anything that isn't an allowed business-photo format.
 */
export function detectImageType(
  buffer: Buffer,
): "image/png" | "image/jpeg" | "image/webp" | null {
  if (buffer.length >= 4 && buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47) {
    return "image/png";
  }
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return "image/jpeg";
  }
  // WEBP: "RIFF"....(4-byte size)...."WEBP"
  if (
    buffer.length >= 12 &&
    buffer.toString("ascii", 0, 4) === "RIFF" &&
    buffer.toString("ascii", 8, 12) === "WEBP"
  ) {
    return "image/webp";
  }
  return null;
}

export type MediaValidation =
  | { ok: true; contentType: string; extension: string }
  | { ok: false; error: string };

/** Validate a candidate upload by size, then by sniffed content. */
export function validateMediaUpload(buffer: Buffer): MediaValidation {
  if (buffer.length === 0) {
    return { ok: false, error: "Uploaded file is empty" };
  }
  if (buffer.length > MAX_MEDIA_BYTES) {
    return { ok: false, error: "Photo must be 10 MB or smaller" };
  }
  const contentType = detectImageType(buffer);
  if (!contentType) {
    return { ok: false, error: "Photo must be a PNG, JPG, or WEBP image" };
  }
  return { ok: true, contentType, extension: TYPE_EXTENSIONS[contentType] };
}

/** R2 object key for a library photo — scoped per user, time-stamped. */
export function mediaObjectKey(userId: string, extension: string, now: number): string {
  return `media-library/${userId}/${now}.${extension}`;
}

/** Upload to durable storage; returns the public URL. Injectable. */
export type MediaUploader = (
  key: string,
  buffer: Buffer,
  contentType: string,
) => Promise<string>;
/** Persist a library row; returns the saved item. Injectable. */
export type MediaSaver = (values: InsertMediaLibraryItem) => Promise<MediaLibraryItem>;
/** List a user's library, newest first. Injectable. */
export type MediaLister = (userId: string) => Promise<MediaLibraryItem[]>;
/** Fetch specific items owned by the user (ownership-scoped). Injectable. */
export type MediaOwnedGetter = (
  userId: string,
  ids: string[],
) => Promise<MediaLibraryItem[]>;
/** Ownership-scoped delete; returns whether a row was removed. Injectable. */
export type MediaRemover = (userId: string, id: string) => Promise<boolean>;

export interface UploadFromBufferRequest {
  userId: string;
  buffer: Buffer;
  label?: string | null;
}

export interface MediaLibraryServiceConfig {
  upload?: MediaUploader;
  save?: MediaSaver;
  list?: MediaLister;
  getOwned?: MediaOwnedGetter;
  remove?: MediaRemover;
  now?: () => number;
}

export class MediaLibraryService {
  private readonly upload: MediaUploader;
  private readonly save: MediaSaver;
  private readonly lister: MediaLister;
  private readonly ownedGetter: MediaOwnedGetter;
  private readonly remover: MediaRemover;
  private readonly now: () => number;

  constructor(config: MediaLibraryServiceConfig = {}) {
    this.upload = config.upload ?? defaultUpload;
    this.save = config.save ?? defaultSave;
    this.lister = config.list ?? defaultList;
    this.ownedGetter = config.getOwned ?? defaultGetOwned;
    this.remover = config.remove ?? defaultRemove;
    this.now = config.now ?? (() => Date.now());
  }

  /**
   * Validate a raw upload, store it in R2, and record the library row. Throws
   * with a user-safe message if validation fails — before touching R2.
   */
  async uploadFromBuffer(request: UploadFromBufferRequest): Promise<MediaLibraryItem> {
    const validation = validateMediaUpload(request.buffer);
    if (!validation.ok) {
      throw new Error(validation.error);
    }

    const key = mediaObjectKey(request.userId, validation.extension, this.now());
    const mediaUrl = await this.upload(key, request.buffer, validation.contentType);

    return this.save({
      userId: request.userId,
      r2Key: key,
      mediaUrl,
      contentType: validation.contentType,
      label: request.label ?? null,
      source: "upload",
    });
  }

  /** A user's library, newest first — the source for pipeline image pickers. */
  list(userId: string): Promise<MediaLibraryItem[]> {
    return this.lister(userId);
  }

  /**
   * Fetch specific library items the user owns — used by image-to-image
   * pipelines (e.g. before/after in STU-C4) to resolve selected photo ids to
   * their URLs. Ownership-scoped: ids belonging to another user are dropped,
   * so a caller can only ever composite its own photos.
   */
  getOwned(userId: string, ids: string[]): Promise<MediaLibraryItem[]> {
    if (ids.length === 0) {
      return Promise.resolve([]);
    }
    return this.ownedGetter(userId, ids);
  }

  /** Delete one of the user's own items. Returns false if nothing was removed. */
  remove(userId: string, id: string): Promise<boolean> {
    return this.remover(userId, id);
  }
}

/** Default uploader — the DEV-8 R2 service. */
const defaultUpload: MediaUploader = async (key, buffer, contentType) => {
  const { r2Service } = await import("@/lib/r2");
  return r2Service.upload(key, buffer, contentType);
};

/** Default saver — Drizzle insert into media_library. */
const defaultSave: MediaSaver = async (values) => {
  const [{ db }, { mediaLibrary }] = await Promise.all([
    import("@/db"),
    import("@/db/schema"),
  ]);
  const [item] = await db.insert(mediaLibrary).values(values).returning();
  return item;
};

/** Default lister — the user's rows, newest first. */
const defaultList: MediaLister = async (userId) => {
  const [{ db }, { mediaLibrary }, { desc, eq }] = await Promise.all([
    import("@/db"),
    import("@/db/schema"),
    import("drizzle-orm"),
  ]);
  return db
    .select()
    .from(mediaLibrary)
    .where(eq(mediaLibrary.userId, userId))
    .orderBy(desc(mediaLibrary.createdAt));
};

/** Default owned-getter — the user's rows among the requested ids. */
const defaultGetOwned: MediaOwnedGetter = async (userId, ids) => {
  const [{ db }, { mediaLibrary }, { and, eq, inArray }] = await Promise.all([
    import("@/db"),
    import("@/db/schema"),
    import("drizzle-orm"),
  ]);
  return db
    .select()
    .from(mediaLibrary)
    .where(and(eq(mediaLibrary.userId, userId), inArray(mediaLibrary.id, ids)));
};

/** Default remover — ownership-scoped delete (userId + id must both match). */
const defaultRemove: MediaRemover = async (userId, id) => {
  const [{ db }, { mediaLibrary }, { and, eq }] = await Promise.all([
    import("@/db"),
    import("@/db/schema"),
    import("drizzle-orm"),
  ]);
  const deleted = await db
    .delete(mediaLibrary)
    .where(and(eq(mediaLibrary.id, id), eq(mediaLibrary.userId, userId)))
    .returning({ id: mediaLibrary.id });
  return deleted.length > 0;
};

export const mediaLibraryService = new MediaLibraryService();
