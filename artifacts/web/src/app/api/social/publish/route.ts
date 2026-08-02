/**
 * DEV-36 (STU-33): Publish API.
 *
 * POST — publish an Asset Kit to a connected account, OR retry a failed job:
 *   { assetKitId, socialAccountId, title, description?, tags?, privacy? }  → new publish
 *   { retryJobId }                                                          → resubmit a failed job
 * Submits to Muapi and records a `processing` job; does NOT poll inline (a
 * publish takes 1–5 min). The job advances on read via GET.
 *
 * GET — the caller's publish jobs (newest first), advancing any `processing`
 * job one poll on read so the /social page's polling drives status.
 *
 * Browser-called via fetch, self-authing with `auth()` (the CLAUDE.md "Server
 * Actions only" rule is stale — every feature uses /api route handlers).
 */
import { auth } from "@clerk/nextjs/server";
import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/db";
import { assetKits } from "@/db/schema";
import { ensureLocalUser } from "@/lib/local-user";
import {
  socialPublishingService,
  TIKTOK_PRIVACY_LEVELS,
  INSTAGRAM_PLACEMENTS,
} from "@/lib/social-publishing";

export const runtime = "nodejs";

// Superset of every platform's fields. `title` is optional here (TikTok +
// Instagram captions are optional; the YouTube builder still fails loud if it's
// missing) and capped at Instagram's 2200 — the per-platform service builders
// enforce the real caps (YouTube 100 / TikTok 150 / Instagram 2200). The
// authoritative, platform-specific validation lives in those builders.
const publishSchema = z.object({
  assetKitId: z.string().min(1),
  socialAccountId: z.string().min(1),
  title: z.string().trim().max(2200).optional(),
  // YouTube
  description: z.string().max(5000).optional(),
  tags: z.array(z.string()).max(50).optional(),
  privacy: z.enum(["public", "private", "unlisted"]).optional(),
  // TikTok
  privacyLevel: z.enum(TIKTOK_PRIVACY_LEVELS).optional(),
  allowComment: z.boolean().optional(),
  allowDuet: z.boolean().optional(),
  allowStitch: z.boolean().optional(),
  isAiGenerated: z.boolean().optional(),
  // Instagram
  placement: z.enum(INSTAGRAM_PLACEMENTS).optional(),
  shareToFeed: z.boolean().optional(),
});

const retrySchema = z.object({ retryJobId: z.string().min(1) });

/** Service errors whose message is safe to show the user, mapped to a status. */
function statusForError(message: string): number | null {
  if (/not found/i.test(message)) return 404;
  if (
    /Only failed publishes|account_id|media_url|title|caption|privacy|privacy_level|placement|Unsupported platform|characters or fewer/i.test(
      message,
    )
  ) {
    return 400;
  }
  return null; // upstream/unknown → mask as 502
}

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

  // Retry path: resubmit a failed job with its stored params.
  if (body && typeof body === "object" && "retryJobId" in body) {
    const parsed = retrySchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { data: null, error: parsed.error.flatten().fieldErrors },
        { status: 400 },
      );
    }
    try {
      const job = await socialPublishingService.retryPublishJob(
        user.id,
        parsed.data.retryJobId,
      );
      return NextResponse.json({ data: job, error: null });
    } catch (err) {
      return respondToServiceError(err, "Publish retry");
    }
  }

  // Publish path.
  const parsed = publishSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { data: null, error: parsed.error.flatten().fieldErrors },
      { status: 400 },
    );
  }

  // Resolve the owned kit → its R2 media URL. YouTube + TikTok are video-only.
  const [kit] = await db
    .select()
    .from(assetKits)
    .where(and(eq(assetKits.id, parsed.data.assetKitId), eq(assetKits.userId, user.id)))
    .limit(1);
  if (!kit) {
    return NextResponse.json(
      { data: null, error: "Asset Kit not found" },
      { status: 404 },
    );
  }
  if (kit.mediaType !== "video") {
    return NextResponse.json(
      { data: null, error: "Publishing requires a video Asset Kit." },
      { status: 400 },
    );
  }

  try {
    const job = await socialPublishingService.publishAssetKit({
      userId: user.id,
      socialAccountId: parsed.data.socialAccountId,
      assetKitId: kit.id,
      mediaUrl: kit.mediaUrl,
      title: parsed.data.title,
      description: parsed.data.description,
      tags: parsed.data.tags,
      privacy: parsed.data.privacy,
      privacyLevel: parsed.data.privacyLevel,
      allowComment: parsed.data.allowComment,
      allowDuet: parsed.data.allowDuet,
      allowStitch: parsed.data.allowStitch,
      isAiGenerated: parsed.data.isAiGenerated,
      placement: parsed.data.placement,
      shareToFeed: parsed.data.shareToFeed,
    });
    return NextResponse.json({ data: job, error: null });
  } catch (err) {
    return respondToServiceError(err, "Publish");
  }
}

export async function GET() {
  const { userId: clerkId } = await auth();
  if (!clerkId) {
    return NextResponse.json({ data: null, error: "Unauthorized" }, { status: 401 });
  }
  const user = await ensureLocalUser(clerkId);
  if (!user) {
    return NextResponse.json({ data: null, error: "User not found" }, { status: 404 });
  }

  try {
    const jobs = await socialPublishingService.listPublishJobs(user.id);
    return NextResponse.json({ data: jobs, error: null });
  } catch (err) {
    console.error("[api/social/publish] list failed", err);
    return NextResponse.json(
      { data: null, error: "Couldn't load publishing history." },
      { status: 502 },
    );
  }
}

/** Map a thrown service error to a user-safe response (validation vs masked). */
function respondToServiceError(err: unknown, label: string): NextResponse {
  const message = err instanceof Error ? err.message : String(err);
  const status = statusForError(message);
  if (status === null) {
    console.error(`[api/social/publish] ${label} failed`, err);
    return NextResponse.json(
      { data: null, error: "Couldn't publish. Please try again." },
      { status: 502 },
    );
  }
  return NextResponse.json({ data: null, error: message }, { status });
}
