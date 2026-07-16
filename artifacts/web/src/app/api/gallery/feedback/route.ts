/**
 * DEV-26: Gallery feedback API — thumbs up/down on an Asset Kit.
 *
 * POST { assetKitId, rating } — sets/toggles the caller's rating. Sending the
 * rating that's already set clears it (toggle off). Stored one-per-user-per-kit
 * in generation_feedback; feeds the Performance Feedback Loop (DEV-25).
 */
import { auth } from "@clerk/nextjs/server";
import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/db";
import { assetKits, generationFeedback, FEEDBACK_RATINGS } from "@/db/schema";
import { ensureLocalUser } from "@/lib/local-user";
import { toggleRating } from "@/lib/gallery";

const bodySchema = z.object({
  assetKitId: z.string().min(1),
  rating: z.enum(FEEDBACK_RATINGS),
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

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ data: null, error: "Invalid JSON body" }, { status: 400 });
  }
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { data: null, error: parsed.error.flatten().fieldErrors },
      { status: 400 },
    );
  }

  // Ownership: the kit must belong to the caller.
  const [kit] = await db
    .select({ id: assetKits.id })
    .from(assetKits)
    .where(
      and(eq(assetKits.id, parsed.data.assetKitId), eq(assetKits.userId, user.id)),
    )
    .limit(1);
  if (!kit) {
    return NextResponse.json({ data: null, error: "Not found" }, { status: 404 });
  }

  const [existing] = await db
    .select({ rating: generationFeedback.rating })
    .from(generationFeedback)
    .where(
      and(
        eq(generationFeedback.assetKitId, kit.id),
        eq(generationFeedback.userId, user.id),
      ),
    )
    .limit(1);

  const next = toggleRating(existing?.rating, parsed.data.rating);

  if (next === null) {
    await db
      .delete(generationFeedback)
      .where(
        and(
          eq(generationFeedback.assetKitId, kit.id),
          eq(generationFeedback.userId, user.id),
        ),
      );
  } else {
    await db
      .insert(generationFeedback)
      .values({ userId: user.id, assetKitId: kit.id, rating: next })
      .onConflictDoUpdate({
        target: [generationFeedback.userId, generationFeedback.assetKitId],
        set: { rating: next, updatedAt: new Date() },
      });
  }

  return NextResponse.json({ data: { rating: next }, error: null });
}
