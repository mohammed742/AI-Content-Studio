/**
 * DEV-22: Text generation — the text side of the Agent Loop's Execute step.
 *
 * Captions, hashtags, and ad copy conditioned on retrieved brand context
 * (DEV-16 RAG), via GPT-4.1-mini structured output. Extends the DEV-13
 * tracer's hardcoded-profile caption proof into a real per-user service
 * (`src/lib/openai.ts` keeps serving the tracer route untouched).
 *
 * Testability mirrors the other Phase-2 services: the LLM calls and the
 * retriever are injectable, so prompt assembly, hashtag normalization, cost,
 * and logging unit-test with fakes. Defaults lazily load the AI SDK and the
 * retrieval service so the module loads under the bare Node test runner.
 */
import type { ContentType } from "./industry-templates.ts";
import type { RetrievedChunk } from "@/lib/retrieval";
import type { PipelineLogger } from "@/lib/muapi";
import { persistentPipelineLogger } from "./pipeline-log.ts";

const TEXT_MODEL = "gpt-4.1-mini";
// GPT-4.1-mini pricing: $0.40 / 1M input, $1.60 / 1M output tokens.
const INPUT_COST_PER_TOKEN = 0.4 / 1_000_000;
const OUTPUT_COST_PER_TOKEN = 1.6 / 1_000_000;
const MAX_HASHTAGS = 10;

export interface TextBusinessContext {
  businessName: string;
  businessType: string;
  brandTone: string;
  targetCustomers?: string | null;
}

export interface CaptionRequest {
  userId: string;
  business: TextBusinessContext;
  /** What the post's media shows / what the post is about. */
  topic: string;
  /** Target platform (e.g. instagram, tiktok) — shapes length/voice. */
  platform?: string;
  /** Optional editorial angle (CONTEXT.md → Content Type). */
  contentType?: ContentType;
}

export interface CaptionResult {
  caption: string;
  /** Normalized: no leading '#', no blanks/dupes, max 10. */
  hashtags: string[];
  cost: number;
}

export interface AdCopyRequest {
  userId: string;
  business: TextBusinessContext;
  /** The product/offer the ad promotes. */
  topic: string;
  platform?: string;
}

export interface AdCopyResult {
  headline: string;
  body: string;
  /** Call to action, e.g. "Order now". */
  cta: string;
  cost: number;
}

/** LLM seams: prompt in, structured output + USD cost out. Injectable. */
export type CaptionLLM = (
  prompt: string,
) => Promise<{ caption: string; hashtags: string[]; cost: number }>;
export type AdCopyLLM = (
  prompt: string,
) => Promise<{ headline: string; body: string; cta: string; cost: number }>;

/** The RAG retriever. Injectable. */
export type TextRetriever = (
  userId: string,
  query: string,
  k: number,
) => Promise<RetrievedChunk[]>;

/** Strip leading '#', drop blanks and duplicates, cap the count. */
export function normalizeHashtags(hashtags: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const raw of hashtags) {
    const tag = raw.trim().replace(/^#+/, "");
    const key = tag.toLowerCase();
    if (!tag || seen.has(key)) {
      continue;
    }
    seen.add(key);
    result.push(tag);
    if (result.length >= MAX_HASHTAGS) {
      break;
    }
  }
  return result;
}

function brandLines(business: TextBusinessContext, context: string): string {
  return [
    `Business: ${business.businessName}, a ${business.businessType}.`,
    `Brand tone: ${business.brandTone}.`,
    business.targetCustomers?.trim()
      ? `Target customers: ${business.targetCustomers.trim()}.`
      : "",
    context
      ? `Relevant brand context (prefer these specifics over generic copy):\n${context}`
      : "",
  ]
    .filter(Boolean)
    .join("\n");
}

/** Prompt for a social caption + hashtags. */
export function buildCaptionPrompt(
  request: CaptionRequest,
  context: string,
): string {
  const platform = request.platform ?? "instagram";
  const angle = request.contentType ? ` Content style: ${request.contentType}.` : "";
  return [
    `Write a ${platform} caption for a post about: ${request.topic}.${angle}`,
    brandLines(request.business, context),
    `Match the brand tone and audience. Keep it platform-appropriate for ${platform}. Also provide 5-${MAX_HASHTAGS} relevant hashtags without the leading '#'.`,
  ].join("\n");
}

/** Prompt for short ad copy (headline / body / CTA). */
export function buildAdCopyPrompt(
  request: AdCopyRequest,
  context: string,
): string {
  const platform = request.platform ?? "instagram";
  return [
    `Write short ${platform} ad copy promoting: ${request.topic}.`,
    brandLines(request.business, context),
    `Return a punchy headline (under 10 words), a 1-2 sentence body, and a short call-to-action. Match the brand tone.`,
  ].join("\n");
}

export interface TextGenerationConfig {
  captionLLM?: CaptionLLM;
  adCopyLLM?: AdCopyLLM;
  retrieve?: TextRetriever;
  logger?: PipelineLogger;
  /** RAG chunks to retrieve for context (default 6). */
  k?: number;
}

export class TextGenerationService {
  private readonly captionLLM: CaptionLLM;
  private readonly adCopyLLM: AdCopyLLM;
  private readonly retrieve: TextRetriever;
  private readonly logger?: PipelineLogger;
  private readonly k: number;

  constructor(config: TextGenerationConfig = {}) {
    this.captionLLM = config.captionLLM ?? defaultCaptionLLM;
    this.adCopyLLM = config.adCopyLLM ?? defaultAdCopyLLM;
    this.retrieve = config.retrieve ?? defaultRetrieve;
    this.logger = config.logger;
    this.k = config.k ?? 6;
  }

  /** Generate a brand-conditioned caption + hashtags. Throws on failure. */
  async generateCaption(request: CaptionRequest): Promise<CaptionResult> {
    return this.run("execute:caption", async () => {
      const context = await this.contextFor(
        request.userId,
        `Caption for a post about ${request.topic} by ${request.business.businessName}.`,
      );
      const { caption, hashtags, cost } = await this.captionLLM(
        buildCaptionPrompt(request, context),
      );
      return {
        result: { caption, hashtags: normalizeHashtags(hashtags), cost },
        cost,
      };
    });
  }

  /** Generate brand-conditioned ad copy. Throws on failure. */
  async generateAdCopy(request: AdCopyRequest): Promise<AdCopyResult> {
    return this.run("execute:ad_copy", async () => {
      const context = await this.contextFor(
        request.userId,
        `Ad copy promoting ${request.topic} by ${request.business.businessName}.`,
      );
      const { headline, body, cta, cost } = await this.adCopyLLM(
        buildAdCopyPrompt(request, context),
      );
      return { result: { headline, body, cta, cost }, cost };
    });
  }

  private async contextFor(userId: string, query: string): Promise<string> {
    const chunks = await this.retrieve(userId, query, this.k);
    return chunks.map((chunk) => `- ${chunk.content}`).join("\n");
  }

  /** Shared timing + pipeline-log wrapper around one text operation. */
  private async run<T>(
    step: string,
    op: () => Promise<{ result: T; cost: number }>,
  ): Promise<T> {
    const startedAt = Date.now();
    try {
      const { result, cost } = await op();
      this.log({
        step,
        model: TEXT_MODEL,
        durationMs: Date.now() - startedAt,
        success: true,
        cost,
      });
      return result;
    } catch (error) {
      this.log({
        step,
        model: TEXT_MODEL,
        durationMs: Date.now() - startedAt,
        success: false,
        cost: 0,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  private log(entry: Parameters<PipelineLogger>[0]): void {
    if (!this.logger) {
      return;
    }
    try {
      this.logger(entry);
    } catch (loggerError) {
      console.error("[text-generation] pipeline logger threw:", loggerError);
    }
  }
}

function usageCost(usage: {
  inputTokens?: number;
  outputTokens?: number;
}): number {
  return (
    (usage.inputTokens ?? 0) * INPUT_COST_PER_TOKEN +
    (usage.outputTokens ?? 0) * OUTPUT_COST_PER_TOKEN
  );
}

/** Default caption LLM — GPT-4.1-mini structured output via the AI SDK. */
const defaultCaptionLLM: CaptionLLM = async (prompt) => {
  const [{ generateObject }, { openai }, { z }, { env }] = await Promise.all([
    import("ai"),
    import("@ai-sdk/openai"),
    import("zod"),
    import("@/env"),
  ]);
  void env.OPENAI_API_KEY;

  const { object, usage } = await generateObject({
    model: openai(TEXT_MODEL),
    schema: z.object({
      caption: z.string().describe("The social media caption."),
      hashtags: z
        .array(z.string())
        .describe(`5-${MAX_HASHTAGS} relevant hashtags, no leading '#'.`),
    }),
    prompt,
  });
  return { ...object, cost: usageCost(usage) };
};

/** Default ad-copy LLM — GPT-4.1-mini structured output via the AI SDK. */
const defaultAdCopyLLM: AdCopyLLM = async (prompt) => {
  const [{ generateObject }, { openai }, { z }, { env }] = await Promise.all([
    import("ai"),
    import("@ai-sdk/openai"),
    import("zod"),
    import("@/env"),
  ]);
  void env.OPENAI_API_KEY;

  const { object, usage } = await generateObject({
    model: openai(TEXT_MODEL),
    schema: z.object({
      headline: z.string().describe("Punchy headline, under 10 words."),
      body: z.string().describe("1-2 sentence ad body."),
      cta: z.string().describe("Short call-to-action."),
    }),
    prompt,
  });
  return { ...object, cost: usageCost(usage) };
};

/** Default retriever — the DEV-16 retrieval service. */
const defaultRetrieve: TextRetriever = async (userId, query, k) => {
  const { retrievalService } = await import("@/lib/retrieval");
  return retrievalService.retrieve(userId, query, { k });
};

export const textGenerationService = new TextGenerationService({
  logger: persistentPipelineLogger,
});
