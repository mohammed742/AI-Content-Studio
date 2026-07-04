/**
 * DEV-13: Minimal OpenAI (GPT-4.1-mini) client for the Agent Loop tracer.
 *
 * Wraps a single Vercel AI SDK `generateObject` call used by the Assemble
 * step of the Agent Loop (Plan → Retrieve → Route → Execute → **Assemble**
 * → Publish) — see ARCHITECTURE.md §2 (Assemble). Given a Business Profile
 * and a description of the generated image, produces a caption + hashtags
 * conditioned on the brand's tone and audience.
 *
 * Cost tracking: the AI SDK returns token usage but not a dollar amount, so
 * cost is computed from GPT-4.1-mini's per-token pricing (per OpenAI's
 * published pricing as of this slice): $0.40 / 1M input tokens, $1.60 / 1M
 * output tokens. See ARCHITECTURE.md §8 (COGS tracking).
 */
import { openai } from "@ai-sdk/openai";
import { generateObject } from "ai";
import { z } from "zod";
import { env } from "@/env";
import type { TracerBusinessProfile } from "@/lib/tracer-data";

const MODEL = "gpt-4.1-mini";
const INPUT_COST_PER_TOKEN = 0.4 / 1_000_000;
const OUTPUT_COST_PER_TOKEN = 1.6 / 1_000_000;

const captionSchema = z.object({
  caption: z
    .string()
    .describe("A social media caption for the generated image."),
  hashtags: z
    .array(z.string())
    .describe(
      "5-10 relevant hashtags, without the leading '#' character.",
    ),
});

export interface GenerateCaptionResult {
  caption: string;
  hashtags: string[];
  cost: number;
}

export async function generateCaption(
  business: TracerBusinessProfile,
  imageDescription: string,
): Promise<GenerateCaptionResult> {
  // `openai()` reads OPENAI_API_KEY from process.env by default; referencing
  // `env.OPENAI_API_KEY` here just ensures Zod validation has already run.
  void env.OPENAI_API_KEY;

  const { object, usage } = await generateObject({
    model: openai(MODEL),
    schema: captionSchema,
    prompt:
      `You are writing a social media caption for ${business.businessName}, ` +
      `a ${business.businessType}. Business description: ${business.description} ` +
      `Target customers: ${business.targetCustomers} ` +
      `Brand tone: ${business.brandKit.tone}. ` +
      `The image being posted shows: ${imageDescription} ` +
      `Write a caption matching the brand's tone and audience, plus relevant hashtags.`,
  });

  const cost =
    (usage.inputTokens ?? 0) * INPUT_COST_PER_TOKEN +
    (usage.outputTokens ?? 0) * OUTPUT_COST_PER_TOKEN;

  return {
    caption: object.caption,
    hashtags: object.hashtags,
    cost,
  };
}
