/**
 * STU-C4 (DEV-66): Before/After Composite pipeline (CONTEXT.md → "Before/After
 * Composite"). Stitches two of the user's own Media Library photos into one
 * side-by-side "before / after" image with burned-in labels, then saves it as
 * an Asset Kit — the transformation posts salons and gyms live on (before &
 * after, style/member transformations).
 *
 * The composite is a $0, no-model-call operation: `sharp` decodes both photos,
 * resizes them to a common height, lays them side by side on a white canvas,
 * and burns in the label bands as SVG overlays (librsvg, bundled with sharp).
 * An optional enhancement pass (`nano-banana-edit`, image-to-image) is left as
 * an injectable seam but off by default — the current key doesn't serve it and
 * the composite stands alone without it (STU-C4 issue note).
 *
 * Testability mirrors the DEV-19/21/23 pipelines: the layout math
 * (`compositeLayout`) and label-SVG builder (`buildLabelSvg`) are pure, and
 * every side effect (image compositing, source fetch, R2 upload, kit save) is
 * an injectable seam so orchestration + ordering unit-test with fakes. Defaults
 * lazily load sharp/R2/Drizzle so the module loads under the bare Node runner.
 */
import type { AssetKit, InsertAssetKit } from "@/db/schema";

/** Default labels for the two panels. */
export const DEFAULT_BEFORE_LABEL = "BEFORE";
export const DEFAULT_AFTER_LABEL = "AFTER";
/** Cap the common height so a pair of huge uploads can't produce a giant PNG. */
export const DEFAULT_MAX_HEIGHT = 1080;
/** White divider (px) between the two panels. */
export const DEFAULT_DIVIDER = 8;

export interface ImageDimensions {
  width: number;
  height: number;
}

export interface CompositeLayout {
  /** Common height both panels are scaled to. */
  height: number;
  /** Total canvas width (before + divider + after). */
  width: number;
  /** Divider width between the panels. */
  divider: number;
  before: { left: number; width: number };
  after: { left: number; width: number };
}

/**
 * Plan the side-by-side layout: scale both photos to a common height (the
 * smaller of the two, capped at `maxHeight` — never upscale past a source),
 * then place them left-to-right with a divider gap. Pure — no image decoding.
 */
export function compositeLayout(
  before: ImageDimensions,
  after: ImageDimensions,
  options: { maxHeight?: number; divider?: number } = {},
): CompositeLayout {
  const maxHeight = options.maxHeight ?? DEFAULT_MAX_HEIGHT;
  const divider = options.divider ?? DEFAULT_DIVIDER;
  const height = Math.min(before.height, after.height, maxHeight);
  const beforeWidth = Math.max(1, Math.round((before.width * height) / before.height));
  const afterWidth = Math.max(1, Math.round((after.width * height) / after.height));
  return {
    height,
    divider,
    width: beforeWidth + divider + afterWidth,
    before: { left: 0, width: beforeWidth },
    after: { left: beforeWidth + divider, width: afterWidth },
  };
}

const XML_ESCAPES: Record<string, string> = {
  "<": "&lt;",
  ">": "&gt;",
  "&": "&amp;",
  "'": "&apos;",
  '"': "&quot;",
};

function escapeXml(value: string): string {
  return value.replace(/[<>&'"]/g, (char) => XML_ESCAPES[char]);
}

/**
 * Build the SVG for one label band: a semi-transparent zinc bar (DESIGN.md
 * palette) with centered white text. The label is XML-escaped so arbitrary
 * user text can never break out of the markup. `sharp` rasterizes this via
 * librsvg when composited.
 */
export function buildLabelSvg(text: string, width: number, height: number): string {
  const fontSize = Math.max(14, Math.round(height * 0.5));
  const centerX = Math.round(width / 2);
  const baseline = Math.round(height * 0.72);
  return (
    `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">` +
    `<rect width="${width}" height="${height}" fill="rgba(9,9,11,0.62)"/>` +
    `<text x="${centerX}" y="${baseline}" font-family="sans-serif" font-size="${fontSize}" ` +
    `font-weight="700" letter-spacing="1" fill="#ffffff" text-anchor="middle">` +
    `${escapeXml(text)}</text></svg>`
  );
}

export interface CompositeInput {
  before: Buffer;
  after: Buffer;
  beforeLabel: string;
  afterLabel: string;
  maxHeight?: number;
  divider?: number;
}

export interface CompositeOutput {
  buffer: Buffer;
  /** Always image/png. */
  contentType: string;
  width: number;
  height: number;
}

/** Decode + resize + stitch two photos into one labelled PNG. Injectable. */
export type Compositor = (input: CompositeInput) => Promise<CompositeOutput>;
/** Fetch a source photo into a buffer. Injectable. */
export type ImageFetcher = (url: string) => Promise<Buffer>;
/** Upload the composite to durable storage; returns the public URL. Injectable. */
export type CompositeUploader = (
  key: string,
  buffer: Buffer,
  contentType: string,
) => Promise<string>;
/** Persist the asset kit row; returns the saved kit. Injectable. */
export type CompositeKitSaver = (values: InsertAssetKit) => Promise<AssetKit>;

export interface CompositeRequest {
  userId: string;
  /** Public URL of the "before" Media Library photo. */
  beforeUrl: string;
  /** Public URL of the "after" Media Library photo. */
  afterUrl: string;
  beforeLabel?: string;
  afterLabel?: string;
  title: string;
  /** Asset Kit content type; defaults to `testimonial` (a results/transformation post). */
  contentType?: AssetKit["contentType"];
  platform: string;
  caption: string;
  hashtags?: string[];
}

export interface CompositeServiceConfig {
  compositor?: Compositor;
  fetchImage?: ImageFetcher;
  upload?: CompositeUploader;
  save?: CompositeKitSaver;
  now?: () => number;
}

export class CompositeService {
  private readonly compositor: Compositor;
  private readonly fetchImage: ImageFetcher;
  private readonly upload: CompositeUploader;
  private readonly save: CompositeKitSaver;
  private readonly now: () => number;

  constructor(config: CompositeServiceConfig = {}) {
    this.compositor = config.compositor ?? defaultCompositor;
    this.fetchImage = config.fetchImage ?? defaultFetchImage;
    this.upload = config.upload ?? defaultUpload;
    this.save = config.save ?? defaultSave;
    this.now = config.now ?? (() => Date.now());
  }

  /**
   * Fetch both source photos, composite them into one labelled before/after
   * image, upload it to R2, and save the Asset Kit. Throws (before any upload
   * or save) if either source fetch or the compositing step fails.
   */
  async generate(request: CompositeRequest): Promise<AssetKit> {
    const beforeLabel = request.beforeLabel ?? DEFAULT_BEFORE_LABEL;
    const afterLabel = request.afterLabel ?? DEFAULT_AFTER_LABEL;

    const [before, after] = await Promise.all([
      this.fetchImage(request.beforeUrl),
      this.fetchImage(request.afterUrl),
    ]);

    const composite = await this.compositor({ before, after, beforeLabel, afterLabel });

    const key = `asset-kits/${request.userId}/${this.now()}-before-after.png`;
    const mediaUrl = await this.upload(key, composite.buffer, composite.contentType);

    return this.save({
      userId: request.userId,
      title: request.title,
      contentType: request.contentType ?? "testimonial",
      platform: request.platform,
      mediaUrl,
      mediaType: "image",
      caption: request.caption,
      hashtags: request.hashtags ?? [],
      cost: 0,
      status: "ready",
    });
  }
}

/**
 * Default compositor — `sharp`. Resizes both photos to the planned width/height
 * (aspect-correct, so `fit: "fill"` introduces no visible distortion), lays
 * them on a white canvas, and burns the label bands over the bottom of each
 * panel. Runs only on the Node.js runtime (sharp is a native module).
 */
export const defaultCompositor: Compositor = async (input) => {
  const sharp = (await import("sharp")).default;

  const [beforeMeta, afterMeta] = await Promise.all([
    sharp(input.before).metadata(),
    sharp(input.after).metadata(),
  ]);
  if (!beforeMeta.width || !beforeMeta.height || !afterMeta.width || !afterMeta.height) {
    throw new Error("Could not read the dimensions of one of the photos");
  }

  const layout = compositeLayout(
    { width: beforeMeta.width, height: beforeMeta.height },
    { width: afterMeta.width, height: afterMeta.height },
    { maxHeight: input.maxHeight, divider: input.divider },
  );

  const [beforeResized, afterResized] = await Promise.all([
    sharp(input.before)
      .resize({ width: layout.before.width, height: layout.height, fit: "fill" })
      .toBuffer(),
    sharp(input.after)
      .resize({ width: layout.after.width, height: layout.height, fit: "fill" })
      .toBuffer(),
  ]);

  const bandHeight = Math.max(36, Math.round(layout.height * 0.12));
  const overlays: Array<{ input: Buffer; top: number; left: number }> = [
    { input: beforeResized, top: 0, left: layout.before.left },
    { input: afterResized, top: 0, left: layout.after.left },
  ];
  if (input.beforeLabel) {
    overlays.push({
      input: Buffer.from(buildLabelSvg(input.beforeLabel, layout.before.width, bandHeight)),
      top: layout.height - bandHeight,
      left: layout.before.left,
    });
  }
  if (input.afterLabel) {
    overlays.push({
      input: Buffer.from(buildLabelSvg(input.afterLabel, layout.after.width, bandHeight)),
      top: layout.height - bandHeight,
      left: layout.after.left,
    });
  }

  const buffer = await sharp({
    create: {
      width: layout.width,
      height: layout.height,
      channels: 4,
      background: { r: 255, g: 255, b: 255, alpha: 1 },
    },
  })
    .composite(overlays)
    .png()
    .toBuffer();

  return { buffer, contentType: "image/png", width: layout.width, height: layout.height };
};

/** Default source fetcher — download the R2 photo into a buffer. */
const defaultFetchImage: ImageFetcher = async (url) => {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch source photo (${response.status} ${response.statusText})`);
  }
  return Buffer.from(await response.arrayBuffer());
};

/** Default uploader — the DEV-8 R2 service. */
const defaultUpload: CompositeUploader = async (key, buffer, contentType) => {
  const { r2Service } = await import("@/lib/r2");
  return r2Service.upload(key, buffer, contentType);
};

/** Default saver — Drizzle insert into asset_kits. */
const defaultSave: CompositeKitSaver = async (values) => {
  const [{ db }, { assetKits }] = await Promise.all([
    import("@/db"),
    import("@/db/schema"),
  ]);
  const [kit] = await db.insert(assetKits).values(values).returning();
  return kit;
};

export const compositeService = new CompositeService();
