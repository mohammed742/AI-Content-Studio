/**
 * DEV-13: Agent Loop tracer — Assemble (caption) proof.
 *
 * Exercises the caption-generation slice of the Agent Loop
 * (ARCHITECTURE.md §2, Assemble) against the hardcoded tracer Business
 * Profile: calls GPT-4.1-mini to generate a caption + hashtags conditioned
 * on the brand and a description of the already-generated image. No DB
 * writes — out of scope per plan-phase-0-5.md.
 */
import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { z } from "zod";
import { generateCaption } from "@/lib/openai";
import { tracerBusinessProfile } from "@/lib/tracer-data";

const bodySchema = z.object({
  imageDescription: z.string().min(1, "imageDescription is required"),
});

export async function POST(request: Request) {
  const { userId } = await auth();

  if (!userId) {
    return NextResponse.json(
      { data: null, error: "Unauthorized" },
      { status: 401 },
    );
  }

  const startedAt = Date.now();

  try {
    const json = await request.json().catch(() => null);
    const parsed = bodySchema.safeParse(json);
    if (!parsed.success) {
      throw new Error(parsed.error.issues[0]?.message ?? "Invalid request body");
    }

    const generation = await generateCaption(
      tracerBusinessProfile,
      parsed.data.imageDescription,
    );

    const duration = Date.now() - startedAt;

    return NextResponse.json({
      data: {
        caption: generation.caption,
        hashtags: generation.hashtags,
        cost: generation.cost,
        duration,
      },
      error: null,
    });
  } catch (err) {
    const duration = Date.now() - startedAt;
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[tracer/generate-caption] failed:", message);
    return NextResponse.json(
      { data: null, error: message, duration },
      { status: 500 },
    );
  }
}
