/**
 * DEV-21: Social media graphic generation — the Execute step of the Agent Loop
 * for text-to-image graphics (Instagram post / story / banner).
 *
 * Sibling of the product photo pipeline (DEV-19): retrieves brand context
 * (DEV-16 RAG), builds a brand-conditioned prompt (tone + brand colors +
 * audience), routes `social_graphic` via the Model Router (DEV-18), and
 * generates at the target format's aspect ratio via the MuapiService (DEV-15).
 *
 * Generation only — R2 upload + DB save is the Assemble slice (DEV-23).
 *
 * Testability mirrors the other services: the Muapi call and the retriever are
 * injectable, so prompt assembly, routing, and format handling unit-test with
 * fakes. Defaults lazily load the real services so the module loads under the
 * bare Node test runner.
 */
import { modelRouter, ModelRouter, type Quality } from "./model-router.ts";
import { resolveAvailableModel } from "./muapi-availability.ts";
import type { ContentType } from "./industry-templates.ts";
import type { MuapiGenerateParams, MuapiGenerateResult } from "@/lib/muapi";
import type { RetrievedChunk } from "@/lib/retrieval";

export type GraphicFormat = "post" | "story" | "banner";

/** Aspect ratio each format is generated at. */
export const FORMAT_ASPECT_RATIOS: Record<GraphicFormat, string> = {
  post: "1:1",
  story: "9:16",
  banner: "16:9",
};

export interface GraphicBusinessContext {
  businessName: string;
  businessType: string;
  brandTone: string;
  brandColors?: string[];
  targetCustomers?: string | null;
}

export interface SocialGraphicRequest {
  userId: string;
  business: GraphicBusinessContext;
  /** What the graphic is about (e.g. a Content Plan item's title/description). */
  topic: string;
  /** Optional editorial angle (CONTEXT.md → Content Type). */
  contentType?: ContentType;
  /** Target format (default `post`). */
  format?: GraphicFormat;
  quality?: Quality;
}

export interface SocialGraphicResult {
  imageUrl: string;
  cost: number;
  model: string;
  format: GraphicFormat;
  aspectRatio: string;
}

/** The Muapi generation call. Injectable. */
export type MuapiGenerate = (
  model: string,
  params: MuapiGenerateParams,
  options?: { step?: string },
) => Promise<MuapiGenerateResult>;

/** The RAG retriever. Injectable. */
export type GraphicRetriever = (
  userId: string,
  query: string,
  k: number,
) => Promise<RetrievedChunk[]>;

/** RAG query that surfaces the most relevant brand context for this graphic. */
export function buildGraphicQuery(
  topic: string,
  business: GraphicBusinessContext,
): string {
  return `Social media graphic about ${topic} for ${business.businessName}, a ${business.businessType}.`;
}

/** Brand-conditioned prompt for the graphic. */
export function buildGraphicPrompt(
  request: SocialGraphicRequest,
  context: string,
): string {
  const { business, topic, contentType } = request;
  const format = request.format ?? "post";
  const aspectRatio = FORMAT_ASPECT_RATIOS[format];
  const colors = business.brandColors?.length
    ? `, brand colors ${business.brandColors.join(", ")}`
    : "";
  const audience = business.targetCustomers?.trim()
    ? `, aimed at ${business.targetCustomers.trim()}`
    : "";
  const angle = contentType ? ` Content style: ${contentType}.` : "";
  const base =
    `A polished social media graphic for ${business.businessName}, a ${business.businessType}, about: ${topic}.` +
    `${angle} ${business.brandTone} brand tone${colors}${audience}. ` +
    `Clean composition, clear space for text, ${format} format (${aspectRatio}).`;
  return context ? `${base}\nBrand context:\n${context}` : base;
}

export interface SocialGraphicServiceConfig {
  muapi?: MuapiGenerate;
  retrieve?: GraphicRetriever;
  router?: ModelRouter;
  resolveModel?: (model: string) => string;
  /** RAG chunks to retrieve for context (default 6). */
  k?: number;
}

export class SocialGraphicService {
  private readonly muapi: MuapiGenerate;
  private readonly retrieve: GraphicRetriever;
  private readonly router: ModelRouter;
  private readonly resolveModel: (model: string) => string;
  private readonly k: number;

  constructor(config: SocialGraphicServiceConfig = {}) {
    this.muapi = config.muapi ?? defaultMuapi;
    this.retrieve = config.retrieve ?? defaultRetrieve;
    this.router = config.router ?? modelRouter;
    this.resolveModel = config.resolveModel ?? resolveAvailableModel;
    this.k = config.k ?? 6;
  }

  /** Generate a brand-conditioned social graphic. Throws on failure. */
  async generate(request: SocialGraphicRequest): Promise<SocialGraphicResult> {
    const quality = request.quality ?? "standard";
    const format = request.format ?? "post";
    const aspectRatio = FORMAT_ASPECT_RATIOS[format];

    const chunks = await this.retrieve(
      request.userId,
      buildGraphicQuery(request.topic, request.business),
      this.k,
    );
    const context = chunks.map((chunk) => `- ${chunk.content}`).join("\n");

    const model = this.resolveModel(
      this.router.getModel("social_graphic", quality),
    );
    const generated = await this.muapi(
      model,
      { prompt: buildGraphicPrompt(request, context), aspect_ratio: aspectRatio },
      { step: "execute:social_graphic" },
    );

    return {
      imageUrl: generated.imageUrl,
      cost: generated.cost,
      model,
      format,
      aspectRatio,
    };
  }
}

/** Default Muapi call — the DEV-15 service (which logs each call). */
const defaultMuapi: MuapiGenerate = async (model, params, options) => {
  const { muapiService } = await import("@/lib/muapi");
  return muapiService.generate(model, params, options);
};

/** Default retriever — the DEV-16 retrieval service. */
const defaultRetrieve: GraphicRetriever = async (userId, query, k) => {
  const { retrievalService } = await import("@/lib/retrieval");
  return retrievalService.retrieve(userId, query, { k });
};

export const socialGraphicService = new SocialGraphicService();
