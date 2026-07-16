/**
 * DEV-24: Generation Queue (CONTEXT.md) — processes an approved Content Plan:
 * for each Content Plan Item, runs the Agent Loop pipelines (image via the
 * product-photo or social-graphic service, caption via the text service,
 * persistence via Asset Kit assembly) and tracks per-item status
 * (pending → generating → completed/failed). Items run in parallel
 * (`Promise.allSettled`) — one failure never kills the rest (DESIGN §9.5).
 *
 * Routing by Content Type: `product_showcase` → product-photo pipeline (with
 * the best-matching product from the Business Profile); everything else —
 * including `ugc_ad` until the Phase-3 video pipeline exists — → the
 * social-graphic pipeline.
 *
 * Testability mirrors the other Phase-2 services: every collaborator (photo /
 * graphic / caption / assemble / item-status writer) is injectable, so
 * routing, parallelism, failure isolation, and status transitions unit-test
 * with fakes. Defaults lazily load the real services.
 */
import type {
  BusinessProfile,
  ContentPlanItemRecord,
} from "@/db/schema";
import type { ProductPhotoResult } from "./product-photo.ts";
import type { SocialGraphicResult } from "./social-graphic.ts";
import type { CaptionResult } from "./text-generation.ts";
import type { AssetKit } from "@/db/schema";
import type { ContentType } from "./industry-templates.ts";

/** The profile fields the queue needs (structural, DB-decoupled). */
export interface QueueBusinessProfile {
  businessName: string;
  businessType: BusinessProfile["businessType"];
  brandTone: string;
  brandColors?: string[];
  targetCustomers?: string | null;
  products: { name: string; description?: string | null }[];
}

export interface ProcessPlanRequest {
  planId: string;
  userId: string;
  profile: QueueBusinessProfile;
  items: ContentPlanItemRecord[];
}

export interface ProcessPlanResult {
  completed: number;
  failed: number;
  /** Aggregate COGS across all items (USD). */
  totalCost: number;
}

/** Injectable seams — the real pipelines behind them are DEV-19/21/22/23. */
export type PhotoPipeline = (args: {
  userId: string;
  product: { name: string; description?: string | null };
  business: QueueBusinessProfile;
}) => Promise<Pick<ProductPhotoResult, "imageUrl" | "cost">>;

export type GraphicPipeline = (args: {
  userId: string;
  business: QueueBusinessProfile;
  topic: string;
  contentType: ContentType;
  platform: string;
}) => Promise<Pick<SocialGraphicResult, "imageUrl" | "cost">>;

export type CaptionPipeline = (args: {
  userId: string;
  business: QueueBusinessProfile;
  topic: string;
  platform: string;
  contentType: ContentType;
}) => Promise<CaptionResult>;

export type KitAssembler = (args: {
  userId: string;
  title: string;
  contentType: ContentType;
  platform: string;
  sourceMediaUrl: string;
  caption: string;
  hashtags: string[];
  cost: number;
}) => Promise<Pick<AssetKit, "id" | "mediaUrl">>;

/** Persist a patch to one plan item (status/assetKitId/mediaUrl/error). */
export type ItemUpdater = (
  planId: string,
  itemId: string,
  patch: Partial<ContentPlanItemRecord>,
) => Promise<void>;

/**
 * Pick the product a `product_showcase` item is about: the one whose name
 * appears in the item's title/description, else the first product.
 */
export function matchProduct(
  item: Pick<ContentPlanItemRecord, "title" | "description">,
  products: QueueBusinessProfile["products"],
): QueueBusinessProfile["products"][number] | undefined {
  const haystack = `${item.title} ${item.description}`.toLowerCase();
  return (
    products.find((p) => haystack.includes(p.name.toLowerCase())) ?? products[0]
  );
}

export interface GenerationQueueConfig {
  photo?: PhotoPipeline;
  graphic?: GraphicPipeline;
  caption?: CaptionPipeline;
  assemble?: KitAssembler;
  updateItem?: ItemUpdater;
}

export class GenerationQueueService {
  private readonly photo: PhotoPipeline;
  private readonly graphic: GraphicPipeline;
  private readonly caption: CaptionPipeline;
  private readonly assemble: KitAssembler;
  private readonly updateItem: ItemUpdater;

  constructor(config: GenerationQueueConfig = {}) {
    this.photo = config.photo ?? defaultPhoto;
    this.graphic = config.graphic ?? defaultGraphic;
    this.caption = config.caption ?? defaultCaption;
    this.assemble = config.assemble ?? defaultAssemble;
    this.updateItem = config.updateItem ?? defaultUpdateItem;
  }

  /**
   * Process every pending/failed item of an approved plan in parallel.
   * Never throws for individual item failures — each failed item is marked
   * `failed` with its error, and the summary reports the split.
   */
  async processPlan(request: ProcessPlanRequest): Promise<ProcessPlanResult> {
    const toRun = request.items.filter(
      (item) => item.status === "pending" || item.status === "failed",
    );

    const results = await Promise.allSettled(
      toRun.map((item) => this.processItem(request, item)),
    );

    let completed = 0;
    let failed = 0;
    let totalCost = 0;
    for (const result of results) {
      if (result.status === "fulfilled") {
        completed += 1;
        totalCost += result.value.cost;
      } else {
        failed += 1;
      }
    }
    return { completed, failed, totalCost };
  }

  /** Run one item end to end; marks its status along the way. */
  private async processItem(
    request: ProcessPlanRequest,
    item: ContentPlanItemRecord,
  ): Promise<{ cost: number }> {
    const { planId, userId, profile } = request;
    await this.updateItem(planId, item.id, { status: "generating", error: null });

    try {
      // 1. Image — route by content type (video is Phase 3; ugc_ad → graphic).
      const image =
        item.type === "product_showcase"
          ? await (async () => {
              const product = matchProduct(item, profile.products);
              if (!product) {
                // No products on the profile — fall back to a graphic.
                return this.graphic({
                  userId,
                  business: profile,
                  topic: `${item.title}. ${item.description}`,
                  contentType: item.type,
                  platform: item.platform,
                });
              }
              return this.photo({ userId, product, business: profile });
            })()
          : await this.graphic({
              userId,
              business: profile,
              topic: `${item.title}. ${item.description}`,
              contentType: item.type,
              platform: item.platform,
            });

      // 2. Caption + hashtags.
      const caption = await this.caption({
        userId,
        business: profile,
        topic: `${item.title}. ${item.description}`,
        platform: item.platform,
        contentType: item.type,
      });

      // 3. Assemble into a persistent Asset Kit.
      const itemCost = image.cost + caption.cost;
      const kit = await this.assemble({
        userId,
        title: item.title,
        contentType: item.type,
        platform: item.platform,
        sourceMediaUrl: image.imageUrl,
        caption: caption.caption,
        hashtags: caption.hashtags,
        cost: itemCost,
      });

      await this.updateItem(planId, item.id, {
        status: "completed",
        assetKitId: kit.id,
        mediaUrl: kit.mediaUrl,
      });
      return { cost: itemCost };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await this.updateItem(planId, item.id, { status: "failed", error: message });
      throw error;
    }
  }
}

/** Default pipelines — the real DEV-19/21/22/23 services, lazily loaded. */
const defaultPhoto: PhotoPipeline = async ({ userId, product, business }) => {
  const { productPhotoService } = await import("@/lib/product-photo");
  return productPhotoService.generate({ userId, product, business });
};

const defaultGraphic: GraphicPipeline = async ({
  userId,
  business,
  topic,
  contentType,
  platform,
}) => {
  const { socialGraphicService } = await import("@/lib/social-graphic");
  const format = platform === "youtube" ? "banner" : "post";
  return socialGraphicService.generate({
    userId,
    business,
    topic,
    contentType,
    format,
  });
};

const defaultCaption: CaptionPipeline = async ({
  userId,
  business,
  topic,
  platform,
  contentType,
}) => {
  const { textGenerationService } = await import("@/lib/text-generation");
  return textGenerationService.generateCaption({
    userId,
    business,
    topic,
    platform,
    contentType,
  });
};

const defaultAssemble: KitAssembler = async (args) => {
  const { assetKitService } = await import("@/lib/asset-kit");
  return assetKitService.assemble({ ...args, mediaType: "image" });
};

const defaultUpdateItem: ItemUpdater = async (planId, itemId, patch) => {
  const [{ db }, { contentPlans }, { eq, sql }] = await Promise.all([
    import("@/db"),
    import("@/db/schema"),
    import("drizzle-orm"),
  ]);
  const patchJson = JSON.stringify(patch);
  // Atomic per-item update: merge the patch into ONLY the matching element,
  // inside a single UPDATE. Items generate in parallel, so a read-in-JS then
  // write-whole-array would race — concurrent writers clobber each other's
  // updates (a completed item snaps back to "pending"). Doing the merge in one
  // SQL statement lets Postgres row-locking serialize the writes, and each
  // write re-reads the current array (READ COMMITTED). `WITH ORDINALITY` +
  // `ORDER BY` preserves item order.
  await db
    .update(contentPlans)
    .set({
      items: sql`(
        SELECT COALESCE(
          jsonb_agg(
            CASE WHEN elem->>'id' = ${itemId}
              THEN elem || ${patchJson}::jsonb
              ELSE elem
            END
            ORDER BY ord
          ),
          '[]'::jsonb
        )
        FROM jsonb_array_elements(${contentPlans.items}) WITH ORDINALITY AS t(elem, ord)
      )`,
    })
    .where(eq(contentPlans.id, planId));
};

export const generationQueueService = new GenerationQueueService();
