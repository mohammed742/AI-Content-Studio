/**
 * STU-C2: Text-graphic generation — the Execute step of the Agent Loop for
 * text-heavy graphics (daily specials, sales & promos, class schedules, market
 * updates, booking promos, testimonials/quotes, tips, motivation posts). These
 * are the single biggest bucket of onboarding content themes and the general
 * image models render their copy illegibly — hence a dedicated asset type
 * routed to text-rendering specialists (`ideogram-v3-t2i` / `nano-banana-pro`).
 *
 * Close sibling of the social-graphic pipeline (DEV-21): it retrieves brand
 * context (DEV-16 RAG), routes `text_graphic` via the Model Router (STU-C2
 * entry), and generates at the target format's aspect ratio via the
 * MuapiService (DEV-15). It reuses that pipeline's shared graphic types
 * (business context, format→aspect-ratio, injectable seams) so aspect ratios
 * stay single-sourced. The one meaningful difference is the prompt: it quotes
 * the caller's **exact** display text and adds legibility/layout guidance, so
 * the offer/schedule/quote renders correctly spelled and readable.
 *
 * Generation only — R2 upload + DB save is the Assemble slice (DEV-23), wired
 * by the Generation Queue. Defaults lazily load the real services so the module
 * loads under the bare Node test runner.
 */
import { modelRouter, ModelRouter, type Quality } from "./model-router.ts";
import { resolveAvailableModel } from "./muapi-availability.ts";
import type { ContentType } from "./industry-templates.ts";
import {
  FORMAT_ASPECT_RATIOS,
  type GraphicBusinessContext,
  type GraphicFormat,
  type GraphicRetriever,
  type MuapiGenerate,
} from "./social-graphic.ts";

export interface TextGraphicRequest {
  userId: string;
  business: GraphicBusinessContext;
  /** What the graphic is about (e.g. "daily specials", "class schedule"). */
  topic: string;
  /**
   * The exact words to render on the graphic — the offer, schedule, or quote.
   * Reproduced verbatim (in quotes) in the prompt so the model spells and lays
   * it out correctly. Keep it short (<12 words) for reliable legibility.
   */
  displayText: string;
  /** Optional editorial angle (CONTEXT.md → Content Type). */
  contentType?: ContentType;
  /** Target format (default `post`). */
  format?: GraphicFormat;
  quality?: Quality;
}

export interface TextGraphicResult {
  imageUrl: string;
  cost: number;
  model: string;
  format: GraphicFormat;
  aspectRatio: string;
  /** Echoed back so the caller/caption can reference the rendered copy. */
  displayText: string;
}

/** RAG query that surfaces the most relevant brand context for this graphic. */
export function buildTextGraphicQuery(
  topic: string,
  business: GraphicBusinessContext,
): string {
  return `Text-based social graphic about ${topic} for ${business.businessName}, a ${business.businessType}.`;
}

/**
 * Brand-conditioned prompt for a text-graphic. Unlike the general graphic
 * prompt, it quotes the exact display text and leads with legibility/spelling
 * guidance so the copy renders correctly — the whole point of this asset type.
 */
export function buildTextGraphicPrompt(
  request: TextGraphicRequest,
  context: string,
): string {
  const { business, topic, displayText, contentType } = request;
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
    `A clean, professional social media graphic for ${business.businessName}, a ${business.businessType}, about: ${topic}.` +
    `${angle} Render this exact text as the focal point, spelled correctly and clearly legible: "${displayText}". ` +
    `Bold, readable typography with strong contrast against the background; balanced, uncluttered layout. ` +
    `${business.brandTone} brand tone${colors}${audience}. ${format} format (${aspectRatio}).`;
  return context ? `${base}\nBrand context:\n${context}` : base;
}

export interface TextGraphicServiceConfig {
  muapi?: MuapiGenerate;
  retrieve?: GraphicRetriever;
  router?: ModelRouter;
  resolveModel?: (model: string) => string;
  /** RAG chunks to retrieve for context (default 6). */
  k?: number;
}

export class TextGraphicService {
  private readonly muapi: MuapiGenerate;
  private readonly retrieve: GraphicRetriever;
  private readonly router: ModelRouter;
  private readonly resolveModel: (model: string) => string;
  private readonly k: number;

  constructor(config: TextGraphicServiceConfig = {}) {
    this.muapi = config.muapi ?? defaultMuapi;
    this.retrieve = config.retrieve ?? defaultRetrieve;
    this.router = config.router ?? modelRouter;
    this.resolveModel = config.resolveModel ?? resolveAvailableModel;
    this.k = config.k ?? 6;
  }

  /** Generate a brand-conditioned text-graphic. Throws on failure. */
  async generate(request: TextGraphicRequest): Promise<TextGraphicResult> {
    const quality = request.quality ?? "standard";
    const format = request.format ?? "post";
    const aspectRatio = FORMAT_ASPECT_RATIOS[format];

    const chunks = await this.retrieve(
      request.userId,
      buildTextGraphicQuery(request.topic, request.business),
      this.k,
    );
    const context = chunks.map((chunk) => `- ${chunk.content}`).join("\n");

    const model = this.resolveModel(
      this.router.getModel("text_graphic", quality),
    );
    const generated = await this.muapi(
      model,
      { prompt: buildTextGraphicPrompt(request, context), aspect_ratio: aspectRatio },
      { step: "execute:text_graphic" },
    );

    return {
      imageUrl: generated.imageUrl,
      cost: generated.cost,
      model,
      format,
      aspectRatio,
      displayText: request.displayText,
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

export const textGraphicService = new TextGraphicService();
