/**
 * DEV-18: Model Router — the Route step of the Agent Loop
 * (Plan → Retrieve → **Route** → Execute → Assemble → Publish).
 *
 * Maps an asset type + quality tier to the optimal Muapi model, so the
 * generation pipelines (DEV-19/21) never hard-code model slugs and users
 * never see them (they see credits, not infrastructure — CONTEXT.md →
 * "Model Router", "Credits Display"). `route()` is pure and config-driven so
 * it can run on the generation hot path without any network I/O.
 *
 * STU-C1 hardening: the static table drifts from Muapi's live catalog (models
 * get repriced and retired). `resolveWithCatalog()` layers the live catalog on
 * top — overriding the stale cost with the live price and failing loud when a
 * routed model has vanished — while staying safe offline (silent fallback to
 * the static values). Each entry also carries an `inputType` so generation UIs
 * know whether to ask the user for text or an image.
 *
 * Availability: the account key is a paid key that completes the intended
 * models directly (verified 2026-07-23 — `flux-krea-dev`/`nano-banana-2` submit
 * + poll to real CDN images), so the pipelines route these slugs through
 * untouched — the old free-tier `resolveAvailableModel` shim has been removed.
 * Liveness/completion still drift per model (e.g. `ideogram-v3-t2i` accepts
 * jobs but dies with an internal error); run `pnpm canary:muapi` for the live
 * list and completion-probe before trusting a newly routed slug.
 */

import {
  inputTypeForCategory,
  muapiCatalog,
  type CatalogPort,
  type InputType,
} from "./muapi-catalog.ts";

export type { InputType } from "./muapi-catalog.ts";

export type AssetType =
  | "product_photo"
  | "social_graphic"
  | "text_graphic"
  | "video_animate"
  | "ugc_lipsync"
  | "voiceover"
  | "background_removal"
  | "reframe";

/** Quality tier: `standard` = fast/cheap, `premium` = higher quality. */
export type Quality = "standard" | "premium";

export interface ModelChoice {
  /** Muapi model slug. */
  model: string;
  /**
   * Fallback estimated cost in USD, used when the live catalog is unreachable.
   * Snapshotted from the catalog on 2026-07-17 (STU-C1) so offline mode is not
   * wildly wrong; the live price overrides it in `resolveWithCatalog()`.
   */
  estimatedCost: number;
  /** Default params for this model (merged under caller-supplied params). */
  params?: Record<string, unknown>;
}

interface RoutingEntry {
  /**
   * What the user must supply for this asset type, snapshotted from the
   * standard model's catalog category. `resolveWithCatalog()` refreshes it live.
   */
  inputType: InputType;
  standard: ModelChoice;
  premium?: ModelChoice;
}

/**
 * The routing table. `Record<AssetType, …>` forces an entry for every asset
 * type — a new type won't compile until it's routed. Costs are live-catalog
 * snapshots (2026-07-17); `resolveWithCatalog()` overrides them at runtime.
 */
export const ROUTING_TABLE: Record<AssetType, RoutingEntry> = {
  product_photo: {
    inputType: "image", // ai-product-shot is Image to Image (needs a product photo)
    standard: { model: "ai-product-shot", estimatedCost: 0.06 },
    premium: { model: "ai-product-photography", estimatedCost: 0.05 },
  },
  social_graphic: {
    inputType: "text", // Text to Image
    // STU-C1: `flux-schnell` is DEAD (POST 404, per the canary) though still
    // catalog-listed; repointed to `nano-banana-2` — the one model proven to
    // complete on this key (and the free-tier shim target anyway).
    standard: { model: "nano-banana-2", estimatedCost: 0.06 },
    // STU-C1: `seedream-v4` was retired from the catalog (fail-loud drift);
    // repointed to `flux-krea-dev` ($0.015, canary-live 2026-07-17) — a FLUX
    // variant tuned for photographic aesthetics, cheaper than nano-banana-pro.
    premium: { model: "flux-krea-dev", estimatedCost: 0.015 },
  },
  text_graphic: {
    inputType: "text", // Text to Image
    // STU-C2: text-heavy graphics (specials/schedules/quotes) the general
    // image models render illegibly, so premium uses a text-rendering
    // specialist (nano-banana-pro).
    // 2026-07-23: `ideogram-v3-t2i` (the former standard pick) is DEAD on the
    // paid key — it accepts jobs then fails 3/3 with "internal error" (submit +
    // poll probe). Repointed standard to `nano-banana-2`, which completes and is
    // what the removed free-tier shim was already rendering here.
    standard: { model: "nano-banana-2", estimatedCost: 0.06 },
    premium: { model: "nano-banana-pro", estimatedCost: 0.12 },
  },
  video_animate: {
    inputType: "image", // kling i2v is Image to Video
    standard: { model: "kling-v2.1-standard-i2v", estimatedCost: 0.225 },
    premium: { model: "kling-v2.1-pro-i2v", estimatedCost: 0.4 },
  },
  ugc_lipsync: {
    inputType: "image", // image + audio → talking-head video (needs a presenter portrait)
    // 2026-07-24 (DEV-29): the plan's `creatify-lipsync` ($0.04) is an
    // Audio-to-Video model that re-syncs an existing presenter *video*
    // (required params `video_url` + `audio_url`), so it cannot drive a static
    // presenter portrait — and the Phase-2.5 presenter library only produces
    // portraits. Repointed to `infinitetalk-image-to-video` ($0.20 catalog /
    // ~$0.28 actual for a ~7s clip), which takes `image_url` + `audio_url` (the
    // plan's real intent). Completion-verified end-to-end (portrait + gemini VO
    // → real MP4, 480p, 91.5s). Human-approved swap. The other $0.04 lip-sync
    // models (latent-sync/sync-lipsync/veed-lipsync) all likewise need
    // `video_url`. Per-video total stays ≈$0.66, under the <$1 goal.
    standard: { model: "infinitetalk-image-to-video", estimatedCost: 0.2 },
    // premium: `kling-v1-avatar-pro` is also image + audio (schema-verified), but
    // its params differ (`prompt`/`image_url`/`audio_url`, NO `resolution`) and it
    // is completion-UNVERIFIED — not wired this slice. See ugc-lipsync.ts.
    premium: { model: "kling-v1-avatar-pro", estimatedCost: 0.65 },
  },
  voiceover: {
    inputType: "text", // Text to Audio (Gemini TTS)
    // 2026-07-24: plan's `elevenlabs-text-to-dialogue-v3` FAILED generation 7/7
    // ("internal error") despite being catalog-live. Text-to-Audio re-audit →
    // `gemini-3-1-flash-tts` completes reliably to a real MP3 at ~$0.003 actual
    // (catalog est. $0.035), cheaper AND working. Human-approved swap. The dead
    // `mmaudio-v2-text-to-audio` ($0.01) is still 404. See ugc-voiceover.ts.
    standard: { model: "gemini-3-1-flash-tts", estimatedCost: 0.035 },
  },
  background_removal: {
    inputType: "image",
    // Single model — premium falls back to standard.
    standard: { model: "ai-background-remover", estimatedCost: 0.01 },
  },
  reframe: {
    inputType: "image",
    standard: { model: "ideogram-v3-reframe", estimatedCost: 0.15 },
    premium: { model: "luma-flash-reframe", estimatedCost: 0.35 },
  },
};

export interface ModelRoute {
  model: string;
  params: Record<string, unknown>;
  estimatedCost: number;
  /** What the user must supply for this asset type. */
  inputType: InputType;
}

export interface ResolvedRoute extends ModelRoute {
  /** True when the cost + inputType came from the live catalog, not the fallback. */
  live: boolean;
}

export class ModelRouter {
  private readonly table: Record<AssetType, RoutingEntry>;
  private readonly catalog: CatalogPort;

  constructor(
    table: Record<AssetType, RoutingEntry> = ROUTING_TABLE,
    catalog: CatalogPort = muapiCatalog,
  ) {
    this.table = table;
    this.catalog = catalog;
  }

  /**
   * Resolve `{ assetType, quality }` to a concrete Muapi model + params +
   * fallback cost + inputType. Pure and synchronous (no network) — safe on the
   * generation hot path. Defaults to `standard`, falls back to standard when
   * there is no premium model, and throws on an unrecognised asset type.
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
      inputType: entry.inputType,
      params: { ...(choice.params ?? {}), ...params },
    };
  }

  /**
   * Like {@link route}, but reconciled against the live Muapi catalog:
   *   - overrides the stale fallback cost with the live catalog price, and
   *   - refreshes `inputType` from the live category,
   * and **fails loud** when the catalog is reachable but the routed model is
   * absent (drift — the class of bug that shipped a dead `seedream-v4`). When
   * the catalog is unreachable it silently returns the static fallback, so a
   * catalog outage never blocks generation.
   */
  async resolveWithCatalog(
    assetType: AssetType,
    quality: Quality = "standard",
    params: Record<string, unknown> = {},
  ): Promise<ResolvedRoute> {
    const base = this.route(assetType, quality, params);
    const models = await this.catalog.tryLoad();
    if (models === null) {
      return { ...base, live: false }; // catalog unreachable → offline fallback
    }
    const model = models.get(base.model);
    if (!model) {
      throw new Error(
        `ModelRouter: routed model "${base.model}" (${assetType}/${quality}) ` +
          `is not in the live Muapi catalog — routing drift; fix the routing table.`,
      );
    }
    return {
      ...base,
      estimatedCost: model.cost,
      inputType: inputTypeForCategory(model.category),
      live: true,
    };
  }

  /** Convenience: just the model slug for an asset type + quality. */
  getModel(assetType: AssetType, quality: Quality = "standard"): string {
    return this.route(assetType, quality).model;
  }
}

export const modelRouter = new ModelRouter();
