/**
 * DEV-27 (STU-23): UGC script generation — the first step of the Phase 3
 * UGC Video Pipeline (**Script** → Voiceover → Lip-sync → B-roll → Assembly →
 * Reframe). Given a product and the business's brand context, it writes a
 * ~15-second conversational, first-person product-review script in the style
 * of authentic user-generated content.
 *
 * The script is returned as three timeline segments — `hook`, `body`, `cta` —
 * matching the plan's assembly layout (talking head 0-8s → B-roll 8-12s →
 * talking-head CTA 12-15s). `spokenText` is the ordered concatenation the
 * voiceover slice (DEV-28) will feed to text-to-speech; `wordCount` and
 * `estimatedSeconds` report the pacing against the 15-second budget without
 * hard-truncating (the review UI lets the user edit).
 *
 * Conditioned on retrieved brand context (DEV-16 RAG) and generated with
 * GPT-4.1-mini structured output. Testability mirrors the Phase-2 services
 * (`content-planner.ts`, `text-generation.ts`): the LLM call and the retriever
 * are injectable, so prompt assembly, spoken-text assembly, duration
 * estimation, cost, and logging unit-test with fakes. The default LLM lazily
 * loads the AI SDK and the default retriever lazily loads the retrieval
 * service, so the module loads under the bare Node test runner.
 *
 * Scope: script only. Presenter pre-selection, voiceover, video, persistence,
 * and UI are later Phase-3 slices (DEV-28…DEV-33).
 */
import { persistentPipelineLogger } from "./pipeline-log.ts";
import type { RetrievedChunk } from "@/lib/retrieval";
import type { PipelineLogger } from "@/lib/muapi";
import type { BusinessProfile } from "@/db/schema";

const SCRIPT_STEP = "execute:ugc_script";
const SCRIPT_MODEL = "gpt-4.1-mini";
// GPT-4.1-mini pricing: $0.40 / 1M input, $1.60 / 1M output tokens.
const INPUT_COST_PER_TOKEN = 0.4 / 1_000_000;
const OUTPUT_COST_PER_TOKEN = 1.6 / 1_000_000;

/** Target length of a UGC ad script. */
const TARGET_SECONDS = 15;
/** Conversational speaking rate (~150 wpm) used to estimate spoken duration. */
const WORDS_PER_SECOND = 2.5;
/** Word budget the prompt aims for so the read lands near TARGET_SECONDS. */
const TARGET_WORD_COUNT = Math.round(TARGET_SECONDS * WORDS_PER_SECOND);

/** The Business Profile fields the script writer reads (DB-decoupled). */
export interface UgcBusinessContext {
  businessName: string;
  businessType: BusinessProfile["businessType"];
  brandTone: string;
  targetCustomers?: string | null;
}

/** The product the UGC ad reviews. */
export interface UgcProduct {
  name: string;
  description?: string | null;
}

export interface UgcScriptRequest {
  userId: string;
  business: UgcBusinessContext;
  product: UgcProduct;
  /** Target platform — shapes voice/length. Defaults to tiktok (UGC-native). */
  platform?: string;
}

/** The three timeline segments an LLM returns, before assembly. */
export interface ScriptSegments {
  /** Attention-grabbing opener (talking head, ~0-8s). */
  hook: string;
  /** Product highlight / benefit (voiced over B-roll, ~8-12s). */
  body: string;
  /** Call to action (talking head, ~12-15s). */
  cta: string;
}

export interface UgcScript extends ScriptSegments {
  /** hook + body + cta, in order — the voiceover step's input. */
  spokenText: string;
  wordCount: number;
  /** Estimated spoken duration in seconds at the conversational rate. */
  estimatedSeconds: number;
  /** LLM cost in USD (COGS, hidden from the user). */
  cost: number;
}

/** The LLM call: prompt in, script segments + USD cost out. Injectable. */
export type ScriptLLM = (
  prompt: string,
) => Promise<ScriptSegments & { cost: number }>;

/** The RAG retriever. Injectable. */
export type ScriptRetriever = (
  userId: string,
  query: string,
  k: number,
) => Promise<RetrievedChunk[]>;

/** Count whitespace-separated word tokens. */
export function countWords(text: string): number {
  const trimmed = text.trim();
  return trimmed ? trimmed.split(/\s+/).length : 0;
}

/** Estimate spoken duration (seconds) for `text` at the conversational rate. */
export function estimateSpokenSeconds(text: string): number {
  return Math.round(countWords(text) / WORDS_PER_SECOND);
}

/** Join the segments in read order, trimming each and dropping blanks. */
export function assembleSpokenText(segments: ScriptSegments): string {
  return [segments.hook, segments.body, segments.cta]
    .map((part) => part.trim())
    .filter(Boolean)
    .join(" ");
}

/** Build the RAG query that surfaces the most relevant product/brand context. */
export function buildScriptRetrievalQuery(request: UgcScriptRequest): string {
  const { business, product } = request;
  const parts = [
    `UGC video ad script for ${product.name} from ${business.businessName}, a ${business.businessType}.`,
  ];
  if (product.description?.trim()) {
    parts.push(`Product: ${product.description.trim()}.`);
  }
  if (business.targetCustomers?.trim()) {
    parts.push(`Audience: ${business.targetCustomers.trim()}.`);
  }
  return parts.join(" ");
}

/** Assemble the LLM prompt from the product, brand, and retrieved context. */
export function buildScriptPrompt(
  request: UgcScriptRequest,
  context: string,
): string {
  const { business, product } = request;
  const platform = request.platform ?? "tiktok";
  return [
    `You are a real customer recording a short, authentic ${platform} user-generated-content (UGC) video review of a product.`,
    `Product: ${product.name}${product.description?.trim() ? ` — ${product.description.trim()}` : ""}.`,
    `Business: ${business.businessName}, a ${business.businessType}.`,
    `Brand tone: ${business.brandTone}.`,
    business.targetCustomers?.trim()
      ? `Speak to this audience: ${business.targetCustomers.trim()}.`
      : "",
    context
      ? `Relevant brand context (prefer these specifics over generic claims):\n${context}`
      : "",
    `Write a ${TARGET_SECONDS}-second spoken script (aim for about ${TARGET_WORD_COUNT} words total) in three parts:`,
    `- hook: a natural, scroll-stopping first-person opener (~8 seconds).`,
    `- body: the main benefit or reason you love it, specific to this product (~4 seconds).`,
    `- cta: a short, friendly call to action to buy or try it (~3 seconds).`,
    `Sound like a genuine person talking to their phone camera — casual, warm, and believable. No hashtags, no emojis, no stage directions.`,
  ]
    .filter(Boolean)
    .join("\n");
}

export interface UgcScriptConfig {
  scriptLLM?: ScriptLLM;
  retrieve?: ScriptRetriever;
  logger?: PipelineLogger;
  /** RAG chunks to retrieve for context (default 6). */
  k?: number;
}

export class UgcScriptService {
  private readonly scriptLLM: ScriptLLM;
  private readonly retrieve: ScriptRetriever;
  private readonly logger?: PipelineLogger;
  private readonly k: number;

  constructor(config: UgcScriptConfig = {}) {
    this.scriptLLM = config.scriptLLM ?? defaultScriptLLM;
    this.retrieve = config.retrieve ?? defaultRetrieve;
    this.logger = config.logger;
    this.k = config.k ?? 6;
  }

  /**
   * Generate a ~15-second UGC product-review script for `request`. Throws on
   * LLM/retrieval failure (the caller decides whether that's fatal).
   */
  async generateScript(request: UgcScriptRequest): Promise<UgcScript> {
    const startedAt = Date.now();
    let cost = 0;
    try {
      const chunks = await this.retrieve(
        request.userId,
        buildScriptRetrievalQuery(request),
        this.k,
      );
      const context = chunks.map((chunk) => `- ${chunk.content}`).join("\n");
      const segments = await this.scriptLLM(buildScriptPrompt(request, context));
      cost = segments.cost;

      const spokenText = assembleSpokenText(segments);
      const script: UgcScript = {
        hook: segments.hook,
        body: segments.body,
        cta: segments.cta,
        spokenText,
        wordCount: countWords(spokenText),
        estimatedSeconds: estimateSpokenSeconds(spokenText),
        cost,
      };

      this.log({
        step: SCRIPT_STEP,
        model: SCRIPT_MODEL,
        durationMs: Date.now() - startedAt,
        success: true,
        cost,
      });
      return script;
    } catch (error) {
      this.log({
        step: SCRIPT_STEP,
        model: SCRIPT_MODEL,
        durationMs: Date.now() - startedAt,
        success: false,
        cost,
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
      console.error("[ugc-script] pipeline logger threw:", loggerError);
    }
  }
}

/** Default LLM — GPT-4.1-mini structured output via the Vercel AI SDK. */
const defaultScriptLLM: ScriptLLM = async (prompt) => {
  const [{ generateObject }, { openai }, { z }, { env }] = await Promise.all([
    import("ai"),
    import("@ai-sdk/openai"),
    import("zod"),
    import("@/env"),
  ]);
  void env.OPENAI_API_KEY;

  const { object, usage } = await generateObject({
    model: openai(SCRIPT_MODEL),
    schema: z.object({
      hook: z.string().describe("Scroll-stopping first-person opener (~8s)."),
      body: z.string().describe("Main benefit, specific to the product (~4s)."),
      cta: z.string().describe("Short, friendly call to action (~3s)."),
    }),
    prompt,
  });
  const cost =
    (usage.inputTokens ?? 0) * INPUT_COST_PER_TOKEN +
    (usage.outputTokens ?? 0) * OUTPUT_COST_PER_TOKEN;
  return { ...object, cost };
};

/** Default retriever — the DEV-16 retrieval service. */
const defaultRetrieve: ScriptRetriever = async (userId, query, k) => {
  const { retrievalService } = await import("@/lib/retrieval");
  return retrievalService.retrieve(userId, query, { k });
};

export const ugcScriptService = new UgcScriptService({
  logger: persistentPipelineLogger,
});
