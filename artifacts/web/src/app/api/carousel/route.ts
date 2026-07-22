/**
 * STU-C5 (DEV-67): Carousel asset kit API.
 *
 * POST — assemble N already-generated frames into one multi-image Asset Kit
 * that shares a single caption/hashtag set. Body (JSON):
 *   { title, frames: [{ sourceMediaUrl }], platform?, caption?, hashtags?,
 *     contentType?, cost? }
 *
 * The frames are freshly-generated media URLs (from the photo/graphic/text
 * pipelines) — this route downloads each into R2 in order and persists one kit
 * whose `media` array preserves that order. Runs on the Node.js runtime for
 * parity with the other assembly routes.
 */
import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { z } from "zod";
import { CONTENT_TYPES } from "@/db/schema";
import {
  CAROUSEL_MAX_FRAMES,
  CAROUSEL_MIN_FRAMES,
  carouselService,
} from "@/lib/carousel";
import { ensureLocalUser } from "@/lib/local-user";

export const runtime = "nodejs";

const bodySchema = z.object({
  title: z.string().trim().min(1).max(120),
  frames: z
    .array(z.object({ sourceMediaUrl: z.string().url() }))
    .min(CAROUSEL_MIN_FRAMES, `A carousel needs at least ${CAROUSEL_MIN_FRAMES} frames`)
    .max(CAROUSEL_MAX_FRAMES, `A carousel can hold at most ${CAROUSEL_MAX_FRAMES} frames`),
  platform: z.string().trim().min(1).max(40).optional(),
  caption: z.string().max(2200).optional(),
  hashtags: z.array(z.string()).max(30).optional(),
  contentType: z.enum(CONTENT_TYPES).optional(),
  cost: z.number().min(0).optional(),
});

export async function POST(req: Request) {
  const { userId: clerkId } = await auth();
  if (!clerkId) {
    return NextResponse.json({ data: null, error: "Unauthorized" }, { status: 401 });
  }
  const user = await ensureLocalUser(clerkId);
  if (!user) {
    return NextResponse.json({ data: null, error: "User not found" }, { status: 404 });
  }

  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return NextResponse.json({ data: null, error: "Expected a JSON body" }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { data: null, error: "Invalid request", issues: parsed.error.flatten() },
      { status: 400 },
    );
  }
  const body = parsed.data;

  try {
    const kit = await carouselService.assemble({
      userId: user.id,
      title: body.title,
      contentType: body.contentType ?? "tip",
      platform: body.platform ?? "instagram",
      caption: body.caption ?? "",
      hashtags: body.hashtags,
      cost: body.cost ?? 0,
      frames: body.frames,
    });
    return NextResponse.json({ data: kit, error: null }, { status: 201 });
  } catch (err) {
    console.error("Carousel assembly failed", err);
    return NextResponse.json(
      { data: null, error: "Failed to build the carousel. Please try again." },
      { status: 500 },
    );
  }
}
