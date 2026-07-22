/**
 * DEV-20: Content Plan Proposal engine — the Plan step of the Agent Loop
 * (**Plan** → Retrieve → Route → Execute → Assemble → Publish).
 *
 * Given a Business Profile, proposes a week of 5-7 content items, each with a
 * content type, title, description, platform, and scheduled day. The proposal
 * is conditioned on three things: the business's industry strategy (reused
 * from DEV-12's `INDUSTRY_TEMPLATES`), its own brand data retrieved via RAG
 * (DEV-16), and upcoming holidays (DEV-20 `seasonal`). Uses GPT-4.1-mini.
 *
 * This slice proposes only — persistence (`content_plans` table + status
 * lifecycle) is the Plan UI slice (DEV-24), and plan-quality scoring +
 * the performance feedback loop are Agent Evals (DEV-25). The `opts` include a
 * forward-compatible `performanceInsights` seam so DEV-25 wires in later.
 *
 * Testability mirrors the other Phase-2 services: the LLM call and the RAG
 * retriever are injectable, so prompt assembly, normalization, and item-count
 * clamping unit-test with fakes. The default LLM lazily loads the AI SDK; the
 * default retriever lazily loads the retrieval service — no `@/…` value
 * imports at the top, so the module loads under the bare Node test runner.
 */
import {
  INDUSTRY_TEMPLATES,
  type ContentType,
  type IndustryTemplate,
  type Weekday,
} from "./industry-templates.ts";
import { upcomingHolidays, type UpcomingHoliday, type Region } from "./seasonal.ts";
import { scorePlanQuality, MIN_PLAN_SCORE } from "./agent-evals.ts";
import { persistentPipelineLogger } from "./pipeline-log.ts";
import type { RetrievedChunk } from "@/lib/retrieval";
import type { PipelineLogger } from "@/lib/muapi";
import type { BusinessProfile } from "@/db/schema";

const PLAN_STEP = "plan";
const PLAN_MODEL = "gpt-4.1-mini";
const MIN_ITEMS = 5;
const MAX_ITEMS = 7;
const DEFAULT_SEASONAL_WINDOW_DAYS = 21;
// One generation = one credit (CONTEXT.md → "Generation Credit"). Video
// multi-credit pricing is Phase 3.
const CREDITS_PER_ITEM = 1;

const CONTENT_TYPES: ContentType[] = [
  "product_showcase",
  "tip",
  "behind_the_scenes",
  "promo",
  "testimonial",
  "ugc_ad",
  "seasonal",
  "engagement",
];

/** The Business Profile fields the planner reads (structural, DB-decoupled). */
export interface PlannableProfile {
  businessName: string;
  businessType: BusinessProfile["businessType"];
  brandTone: string;
  targetCustomers?: string | null;
  products: { name: string; description?: string | null }[];
  socialPlatforms: string[];
  /**
   * STU-C6: which region's seasonal calendar to use. Optional forward-compatible
   * seam — the Business Profile has no region column yet, so this defaults to
   * "US" when absent. When a region field is added, the API route passes it here.
   */
  region?: Region;
}

export interface ContentPlanItem {
  type: ContentType;
  title: string;
  description: string;
  platform: string;
  scheduledDay: Weekday;
  estimatedCredits: number;
}

export interface ContentPlan {
  items: ContentPlanItem[];
  /** LLM cost in USD (COGS), summed across any regeneration attempts. */
  cost: number;
  /** Plan quality score 0-100 (DEV-25). */
  score: number;
}

/** A single item as returned by the LLM, before normalization. */
export interface ProposedItem {
  type: ContentType;
  title: string;
  description: string;
  platform: string;
  scheduledDay: Weekday;
}

/** The LLM call: prompt in, proposed items + cost out. Injectable. */
export type PlanGenerator = (
  prompt: string,
) => Promise<{ items: ProposedItem[]; cost: number }>;

/** The RAG retriever. Injectable. */
export type PlanRetriever = (
  userId: string,
  query: string,
  k: number,
) => Promise<RetrievedChunk[]>;

export interface ProposePlanOptions {
  /** RAG chunks to retrieve (default 8). */
  k?: number;
  /** How far ahead to look for holidays (default 21 days). */
  seasonalWindowDays?: number;
  /** Reserved for DEV-25 (performance feedback loop) — unused for now. */
  performanceInsights?: string;
}

const DEFAULT_PLATFORMS = ["instagram"];

/** Build the RAG query that surfaces the most relevant brand context. */
export function buildRetrievalQuery(
  profile: PlannableProfile,
  holidays: UpcomingHoliday[],
): string {
  const parts = [
    `Content ideas for ${profile.businessName}, a ${profile.businessType}.`,
  ];
  if (profile.targetCustomers?.trim()) {
    parts.push(`Audience: ${profile.targetCustomers.trim()}.`);
  }
  if (holidays.length > 0) {
    parts.push(`Upcoming occasions: ${holidays.map((h) => h.name).join(", ")}.`);
  }
  return parts.join(" ");
}

/** Assemble the LLM prompt from the profile, strategy, context, and season. */
export function buildPlannerPrompt(input: {
  profile: PlannableProfile;
  strategy: IndustryTemplate;
  context: string;
  holidays: UpcomingHoliday[];
  /** Performance Feedback Loop hint (DEV-25) — what the audience prefers. */
  performanceInsights?: string;
}): string {
  const { profile, strategy, context, holidays, performanceInsights } = input;
  const platforms =
    profile.socialPlatforms.length > 0
      ? profile.socialPlatforms
      : DEFAULT_PLATFORMS;
  const schedule = strategy.postingSchedule.weeklyPlan
    .map((slot) => `${slot.day}: ${slot.contentType}`)
    .join(", ");
  const holidayLine =
    holidays.length > 0
      ? holidays.map((h) => `${h.name} (in ${h.daysAway} days)`).join(", ")
      : "none in the next few weeks";

  return [
    `You are a social media strategist proposing one week of content for ${profile.businessName}, a ${profile.businessType}.`,
    `Brand tone: ${profile.brandTone}.`,
    `Industry strategy: ${strategy.strategyHint}`,
    profile.targetCustomers?.trim()
      ? `Target customers: ${profile.targetCustomers.trim()}.`
      : "",
    `Post on these platforms only: ${platforms.join(", ")}.`,
    `Recommended cadence: about ${strategy.postingSchedule.postsPerWeek} posts/week. Suggested weekly mix: ${schedule}.`,
    `Upcoming holidays to consider for seasonal content: ${holidayLine}.`,
    performanceInsights?.trim()
      ? `What has worked for this business before: ${performanceInsights.trim()}`
      : "",
    context ? `\nRelevant brand context (prefer these specifics over generic ideas):\n${context}` : "",
    `\nPropose between ${MIN_ITEMS} and ${MAX_ITEMS} content items for the week. Each item needs: type (one of ${CONTENT_TYPES.join(", ")}), a short title, a one-sentence description, a platform (from the allowed list), and a scheduledDay (monday-sunday). Vary the content types and spread items across different days. If a listed holiday is close, include a seasonal item for it.`,
  ]
    .filter(Boolean)
    .join("\n");
}

// Auto-regenerate a proposed plan up to this many times if it scores below
// MIN_PLAN_SCORE (DEV-25). Capped to bound GPT spend.
const MAX_PLAN_ATTEMPTS = 2;

export interface ContentPlannerConfig {
  generate?: PlanGenerator;
  retrieve?: PlanRetriever;
  logger?: PipelineLogger;
  now?: () => Date;
  /** Plan quality scorer (DEV-25). Defaults to `scorePlanQuality`. */
  scorePlan?: (items: ContentPlanItem[]) => number;
  /** Max proposal attempts before accepting the best-scoring plan. */
  maxAttempts?: number;
}

export class ContentPlannerService {
  private readonly generate: PlanGenerator;
  private readonly retrieve: PlanRetriever;
  private readonly logger?: PipelineLogger;
  private readonly now: () => Date;
  private readonly scorePlan: (items: ContentPlanItem[]) => number;
  private readonly maxAttempts: number;

  constructor(config: ContentPlannerConfig = {}) {
    this.generate = config.generate ?? defaultGenerate;
    this.retrieve = config.retrieve ?? defaultRetrieve;
    this.logger = config.logger;
    this.now = config.now ?? (() => new Date());
    this.scorePlan = config.scorePlan ?? scorePlanQuality;
    this.maxAttempts = config.maxAttempts ?? MAX_PLAN_ATTEMPTS;
  }

  /**
   * Propose a week of 5-7 content items for `userId`'s business. Throws on
   * LLM/retrieval failure (the caller decides whether that's fatal).
   */
  async proposePlan(
    userId: string,
    profile: PlannableProfile,
    options: ProposePlanOptions = {},
  ): Promise<ContentPlan> {
    const startedAt = Date.now();
    let cost = 0;
    try {
      const strategy =
        INDUSTRY_TEMPLATES[profile.businessType] ?? INDUSTRY_TEMPLATES.other;
      const holidays = upcomingHolidays(
        this.now(),
        options.seasonalWindowDays ?? DEFAULT_SEASONAL_WINDOW_DAYS,
        profile.region ?? "US",
      );
      const retrieved = await this.retrieve(
        userId,
        buildRetrievalQuery(profile, holidays),
        options.k ?? 8,
      );
      const context = retrieved.map((chunk) => `- ${chunk.content}`).join("\n");
      const prompt = buildPlannerPrompt({
        profile,
        strategy,
        context,
        holidays,
        performanceInsights: options.performanceInsights,
      });

      // Propose → score → auto-regenerate below MIN_PLAN_SCORE, keeping the
      // best-scoring attempt (CONTEXT.md → "Plan Quality Score"). Silent to
      // the user; capped at maxAttempts to bound cost.
      let best: { items: ContentPlanItem[]; score: number } | null = null;
      for (let attempt = 1; attempt <= this.maxAttempts; attempt += 1) {
        const { items: proposed, cost: llmCost } = await this.generate(prompt);
        cost += llmCost;
        const items = normalizeItems(proposed, profile);
        const score = this.scorePlan(items);
        if (!best || score > best.score) {
          best = { items, score };
        }
        if (score >= MIN_PLAN_SCORE) {
          break;
        }
      }
      // maxAttempts >= 1, so best is always set here.
      const chosen = best as { items: ContentPlanItem[]; score: number };

      this.log({
        step: PLAN_STEP,
        model: PLAN_MODEL,
        durationMs: Date.now() - startedAt,
        success: true,
        cost,
      });
      return { items: chosen.items, cost, score: chosen.score };
    } catch (error) {
      this.log({
        step: PLAN_STEP,
        model: PLAN_MODEL,
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
      console.error("[content-planner] pipeline logger threw:", loggerError);
    }
  }
}

/**
 * Validate + normalize LLM output into Content Plan Items: cap at MAX_ITEMS,
 * drop invalid content types, snap each platform to one the business actually
 * uses, and stamp the credit cost.
 */
export function normalizeItems(
  proposed: ProposedItem[],
  profile: PlannableProfile,
): ContentPlanItem[] {
  const platforms =
    profile.socialPlatforms.length > 0
      ? profile.socialPlatforms
      : DEFAULT_PLATFORMS;

  return proposed
    .filter((item) => CONTENT_TYPES.includes(item.type))
    .slice(0, MAX_ITEMS)
    .map((item) => ({
      type: item.type,
      title: item.title,
      description: item.description,
      platform: platforms.includes(item.platform) ? item.platform : platforms[0],
      scheduledDay: item.scheduledDay,
      estimatedCredits: CREDITS_PER_ITEM,
    }));
}

/** Default LLM — GPT-4.1-mini structured output via the Vercel AI SDK. */
const defaultGenerate: PlanGenerator = async (prompt) => {
  const [{ generateObject }, { openai }, { z }, { env }] = await Promise.all([
    import("ai"),
    import("@ai-sdk/openai"),
    import("zod"),
    import("@/env"),
  ]);
  void env.OPENAI_API_KEY;

  const schema = z.object({
    items: z
      .array(
        z.object({
          type: z.enum(CONTENT_TYPES as [ContentType, ...ContentType[]]),
          title: z.string(),
          description: z.string(),
          platform: z.string(),
          scheduledDay: z.enum([
            "monday",
            "tuesday",
            "wednesday",
            "thursday",
            "friday",
            "saturday",
            "sunday",
          ]),
        }),
      )
      .min(MIN_ITEMS)
      .max(MAX_ITEMS),
  });

  const { object, usage } = await generateObject({
    model: openai(PLAN_MODEL),
    schema,
    prompt,
  });
  // GPT-4.1-mini pricing: $0.40 / 1M input, $1.60 / 1M output.
  const cost =
    (usage.inputTokens ?? 0) * (0.4 / 1_000_000) +
    (usage.outputTokens ?? 0) * (1.6 / 1_000_000);
  return { items: object.items, cost };
};

/** Default retriever — the DEV-16 retrieval service. */
const defaultRetrieve: PlanRetriever = async (userId, query, k) => {
  const { retrievalService } = await import("@/lib/retrieval");
  return retrievalService.retrieve(userId, query, { k });
};

export const contentPlannerService = new ContentPlannerService({
  logger: persistentPipelineLogger,
});
