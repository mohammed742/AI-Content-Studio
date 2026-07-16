/**
 * DEV-18: Model Router — the Route step of the Agent Loop
 * (Plan → Retrieve → **Route** → Execute → Assemble → Publish).
 *
 * Maps an asset type + quality tier to the optimal Muapi model, so the
 * generation pipelines (DEV-19/21) never hard-code model slugs and users
 * never see them (they see credits, not infrastructure — CONTEXT.md →
 * "Model Router", "Credits Display"). Pure and config-driven: the routing
 * table is transcribed from ARCHITECTURE.md §Route, with no external I/O.
 *
 * Availability caveat: DEV-8 found only `nano-banana-2` works on this
 * account's free/sandbox tier (`flux-dev`/`ai-product-photography` 404'd).
 * This table encodes the *intended* models; the generation slices own real
 * per-account model availability.
 */

export type AssetType =
  | "product_photo"
  | "social_graphic"
  | "video_animate"
  | "ugc_lipsync"
  | "background_removal"
  | "reframe";

/** Quality tier: `standard` = fast/cheap, `premium` = higher quality. */
export type Quality = "standard" | "premium";

export interface ModelChoice {
  /** Muapi model slug. */
  model: string;
  /** Estimated cost in USD (ARCHITECTURE.md §Route). */
  estimatedCost: number;
  /** Default params for this model (merged under caller-supplied params). */
  params?: Record<string, unknown>;
}

interface RoutingEntry {
  standard: ModelChoice;
  premium?: ModelChoice;
}

/**
 * The routing table (ARCHITECTURE.md §Route). `Record<AssetType, …>` forces an
 * entry for every asset type — a new type won't compile until it's routed.
 */
export const ROUTING_TABLE: Record<AssetType, RoutingEntry> = {
  product_photo: {
    standard: { model: "ai-product-shot", estimatedCost: 0.06 },
    premium: { model: "ai-product-photography", estimatedCost: 0.05 },
  },
  social_graphic: {
    standard: { model: "flux-schnell", estimatedCost: 0.03 },
    premium: { model: "seedream-v4", estimatedCost: 0.05 },
  },
  video_animate: {
    standard: { model: "kling-v2.1-standard-i2v", estimatedCost: 0.3 },
    premium: { model: "kling-v2.1-pro-i2v", estimatedCost: 0.4 },
  },
  ugc_lipsync: {
    standard: { model: "creatify-lipsync", estimatedCost: 0.3 },
    premium: { model: "kling-v1-avatar-pro", estimatedCost: 0.3 },
  },
  background_removal: {
    // Single model — premium falls back to standard.
    standard: { model: "ai-background-remover", estimatedCost: 0.01 },
  },
  reframe: {
    standard: { model: "ideogram-v3-reframe", estimatedCost: 0.05 },
    premium: { model: "luma-flash-reframe", estimatedCost: 0.1 },
  },
};

export interface ModelRoute {
  model: string;
  params: Record<string, unknown>;
  estimatedCost: number;
}

export class ModelRouter {
  private readonly table: Record<AssetType, RoutingEntry>;

  constructor(table: Record<AssetType, RoutingEntry> = ROUTING_TABLE) {
    this.table = table;
  }

  /**
   * Resolve `{ assetType, quality }` to a concrete Muapi model + params +
   * estimated cost. Defaults to the `standard` tier, and falls back to
   * standard when the asset type has no premium model. Throws on an
   * unrecognised asset type (e.g. an untrusted value from JSON).
   */
  route(
    assetType: AssetType,
    quality: Quality = "standard",
    params: Record<string, unknown> = {},
  ): ModelRoute {
    const entry = this.table[assetType];
    if (!entry) {
      throw new Error(`ModelRouter: unknown asset type "${assetType}"`);
    }
    const choice =
      quality === "premium" ? (entry.premium ?? entry.standard) : entry.standard;
    return {
      model: choice.model,
      estimatedCost: choice.estimatedCost,
      params: { ...(choice.params ?? {}), ...params },
    };
  }

  /** Convenience: just the model slug for an asset type + quality. */
  getModel(assetType: AssetType, quality: Quality = "standard"): string {
    return this.route(assetType, quality).model;
  }
}

export const modelRouter = new ModelRouter();
