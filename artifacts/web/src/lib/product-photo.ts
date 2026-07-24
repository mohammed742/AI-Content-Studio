/**
 * DEV-19: Product photo generation pipeline — the Execute step of the Agent
 * Loop (Plan → Retrieve → Route → **Execute** → Assemble → Publish).
 *
 * Chains the foundations into a real product-photo flow:
 *   RAG retrieve → (optional) background removal → scene generation → (optional) reframe
 * using the Model Router (DEV-18) to pick models and the MuapiService (DEV-15)
 * to run them, conditioned on the Brand Knowledge Base (DEV-16).
 *
 * This slice generates only — R2 upload + DB save is the Assemble slice
 * (DEV-23). It returns image URLs + cost.
 *
 * Testability mirrors the other services: the Muapi call and the retriever are
 * injectable, so the step sequence, routing, prompt, cost aggregation, and
 * optional-step skipping unit-test with fakes. Defaults lazily load the real
 * services so the module loads under the bare Node test runner.
 */
import { modelRouter, ModelRouter, type Quality } from "./model-router.ts";
import type { MuapiGenerateParams, MuapiGenerateResult } from "@/lib/muapi";
import type { RetrievedChunk } from "@/lib/retrieval";

export interface ProductForPhoto {
  name: string;
  description?: string | null;
}

export interface PhotoBusinessContext {
  businessName: string;
  businessType: string;
  brandTone: string;
  targetCustomers?: string | null;
}

export interface ProductPhotoRequest {
  userId: string;
  product: ProductForPhoto;
  business: PhotoBusinessContext;
  quality?: Quality;
  /** Uploaded product image → background removal before scene generation. */
  sourceImageUrl?: string;
  /** Aspect ratios to reframe the final photo into (default none). */
  aspectRatios?: string[];
}

export interface PipelineStep {
  step: string;
  model: string;
  cost: number;
}

export interface ReframeOutput {
  aspectRatio: string;
  imageUrl: string;
}

export interface ProductPhotoResult {
  /** The primary generated product photo. */
  imageUrl: string;
  reframes: ReframeOutput[];
  /** Total cost across every Muapi call in the pipeline (USD). */
  cost: number;
  /** Model used for the scene generation. */
  model: string;
  steps: PipelineStep[];
}

/** The Muapi generation call. Injectable. */
export type MuapiGenerate = (
  model: string,
  params: MuapiGenerateParams,
  options?: { step?: string },
) => Promise<MuapiGenerateResult>;

/** The RAG retriever. Injectable. */
export type PhotoRetriever = (
  userId: string,
  query: string,
  k: number,
) => Promise<RetrievedChunk[]>;

/** RAG query that surfaces the most relevant brand context for this product. */
export function buildPhotoQuery(
  product: ProductForPhoto,
  business: PhotoBusinessContext,
): string {
  const desc = product.description?.trim();
  return `${product.name}${desc ? ` — ${desc}` : ""}. Product photography for ${business.businessName}, a ${business.businessType}.`;
}

/** Brand-conditioned prompt for the product/lifestyle scene. */
export function buildScenePrompt(
  product: ProductForPhoto,
  business: PhotoBusinessContext,
  context: string,
): string {
  const desc = product.description?.trim();
  const audience = business.targetCustomers?.trim();
  const base =
    `A professional, high-quality product photograph of ${product.name}` +
    `${desc ? ` — ${desc}` : ""}, for ${business.businessName}, a ${business.businessType}. ` +
    `${business.brandTone} brand aesthetic${audience ? `, appealing to ${audience}` : ""}. ` +
    `Natural lighting, sharp focus, appealing composition, lifestyle scene.`;
  return context ? `${base}\nBrand context:\n${context}` : base;
}

export interface ProductPhotoServiceConfig {
  muapi?: MuapiGenerate;
  retrieve?: PhotoRetriever;
  router?: ModelRouter;
  /** RAG chunks to retrieve for context (default 6). */
  k?: number;
}

export class ProductPhotoService {
  private readonly muapi: MuapiGenerate;
  private readonly retrieve: PhotoRetriever;
  private readonly router: ModelRouter;
  private readonly k: number;

  constructor(config: ProductPhotoServiceConfig = {}) {
    this.muapi = config.muapi ?? defaultMuapi;
    this.retrieve = config.retrieve ?? defaultRetrieve;
    this.router = config.router ?? modelRouter;
    this.k = config.k ?? 6;
  }

  /**
   * Run the product-photo pipeline. Background removal runs only when a source
   * image is supplied; reframe runs only for requested aspect ratios. Throws
   * on any Muapi/retrieval failure.
   */
  async generate(request: ProductPhotoRequest): Promise<ProductPhotoResult> {
    const quality = request.quality ?? "standard";
    const steps: PipelineStep[] = [];
    let cost = 0;

    const chunks = await this.retrieve(
      request.userId,
      buildPhotoQuery(request.product, request.business),
      this.k,
    );
    const context = chunks.map((chunk) => `- ${chunk.content}`).join("\n");

    // Optional: background removal on an uploaded product image.
    let sourceImageUrl = request.sourceImageUrl;
    if (sourceImageUrl) {
      const model = this.router.getModel("background_removal", quality);
      const removed = await this.muapi(
        model,
        { image: sourceImageUrl },
        { step: "execute:bg_removal" },
      );
      cost += removed.cost;
      steps.push({ step: "execute:bg_removal", model, cost: removed.cost });
      sourceImageUrl = removed.imageUrl;
    }

    // Scene generation.
    const sceneModel = this.router.getModel("product_photo", quality);
    const params: MuapiGenerateParams = {
      prompt: buildScenePrompt(request.product, request.business, context),
    };
    if (sourceImageUrl) {
      params.image = sourceImageUrl;
    }
    const scene = await this.muapi(sceneModel, params, {
      step: "execute:product_photo",
    });
    cost += scene.cost;
    steps.push({ step: "execute:product_photo", model: sceneModel, cost: scene.cost });

    // Optional: reframe into requested aspect ratios.
    const reframes: ReframeOutput[] = [];
    for (const aspectRatio of request.aspectRatios ?? []) {
      const model = this.router.getModel("reframe", quality);
      const reframed = await this.muapi(
        model,
        { image: scene.imageUrl, aspect_ratio: aspectRatio },
        { step: "execute:reframe" },
      );
      cost += reframed.cost;
      steps.push({ step: "execute:reframe", model, cost: reframed.cost });
      reframes.push({ aspectRatio, imageUrl: reframed.imageUrl });
    }

    return { imageUrl: scene.imageUrl, reframes, cost, model: sceneModel, steps };
  }
}

/** Default Muapi call — the DEV-15 service (which logs each call). */
const defaultMuapi: MuapiGenerate = async (model, params, options) => {
  const { muapiService } = await import("@/lib/muapi");
  return muapiService.generate(model, params, options);
};

/** Default retriever — the DEV-16 retrieval service. */
const defaultRetrieve: PhotoRetriever = async (userId, query, k) => {
  const { retrievalService } = await import("@/lib/retrieval");
  return retrievalService.retrieve(userId, query, { k });
};

export const productPhotoService = new ProductPhotoService();
