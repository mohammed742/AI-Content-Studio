/**
 * STU-C4 (DEV-66): Before/After Composite API.
 *
 * POST — stitch two of the caller's Media Library photos into one labelled
 * before/after image, saved as an Asset Kit. Body (JSON):
 *   { beforeId, afterId, beforeLabel?, afterLabel?, title?, platform?,
 *     caption?, hashtags?, contentType? }
 *
 * The two ids are resolved through the Media Library service ownership-scoped,
 * so a caller can only ever composite its own photos (never a guessed id).
 * Runs on the Node.js runtime — the compositor uses sharp (a native module).
 */
import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { z } from "zod";
import { CONTENT_TYPES } from "@/db/schema";
import { compositeService } from "@/lib/composite";
import { ensureLocalUser } from "@/lib/local-user";
import { mediaLibraryService } from "@/lib/media-library";

export const runtime = "nodejs";

const bodySchema = z.object({
  beforeId: z.string().min(1),
  afterId: z.string().min(1),
  beforeLabel: z.string().trim().max(40).optional(),
  afterLabel: z.string().trim().max(40).optional(),
  title: z.string().trim().min(1).max(120).optional(),
  platform: z.string().trim().min(1).max(40).optional(),
  caption: z.string().max(2200).optional(),
  hashtags: z.array(z.string()).max(30).optional(),
  contentType: z.enum(CONTENT_TYPES).optional(),
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

  // Resolve both photos, ownership-scoped. A guessed/foreign id simply won't
  // resolve → 404, so no cross-user photo can be composited.
  const items = await mediaLibraryService.getOwned(user.id, [body.beforeId, body.afterId]);
  const before = items.find((item) => item.id === body.beforeId);
  const after = items.find((item) => item.id === body.afterId);
  if (!before || !after) {
    return NextResponse.json(
      { data: null, error: "One or both photos were not found in your library" },
      { status: 404 },
    );
  }

  try {
    const kit = await compositeService.generate({
      userId: user.id,
      beforeUrl: before.mediaUrl,
      afterUrl: after.mediaUrl,
      beforeLabel: body.beforeLabel,
      afterLabel: body.afterLabel,
      title: body.title ?? "Before & After",
      platform: body.platform ?? "instagram",
      caption: body.caption ?? "",
      hashtags: body.hashtags,
      contentType: body.contentType,
    });
    return NextResponse.json({ data: kit, error: null }, { status: 201 });
  } catch (err) {
    console.error("Composite generation failed", err);
    return NextResponse.json(
      { data: null, error: "Failed to build the before/after image. Please try again." },
      { status: 500 },
    );
  }
}
