/**
 * DEV-33: UGC Video API — the review-wizard's backend (DESIGN §9.6).
 *
 * GET   — the caller's latest UGC Job (any status), for the /plan/ugc page.
 * POST  — propose a build: the agent writes the script (DEV-27) and pre-selects
 *         a presenter for the brand's audience, then saves a `draft` job.
 *         Replaces any existing draft; 409 while a job is generating.
 * PATCH — edit a draft's script (hook/body/cta) or swap the presenter.
 *
 * Running the pipeline is POST /api/ugc/generate. Users never see model names
 * or dollar costs — responses carry the job (script, presenter, step progress)
 * and the UI shows credits only (CONTEXT.md → "Credits Display").
 *
 * Convention: browser-called `/api` route (matches the plan/gallery/library
 * features + STU-C3's QA switch), not a Server Action.
 */
import { auth } from "@clerk/nextjs/server";
import { and, desc, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/db";
import { businessProfiles, ugcJobs, type UgcScriptRecord } from "@/db/schema";
import { ensureLocalUser } from "@/lib/local-user";
import { ugcPipelineService } from "@/lib/ugc-pipeline";
import {
  assembleSpokenText,
  countWords,
  estimateSpokenSeconds,
} from "@/lib/ugc-script";
import { PRESENTERS } from "@/lib/presenters";

export async function GET() {
  const { userId: clerkId } = await auth();
  if (!clerkId) {
    return NextResponse.json({ data: null, error: "Unauthorized" }, { status: 401 });
  }
  const user = await ensureLocalUser(clerkId);
  if (!user) {
    return NextResponse.json({ data: null, error: "User not found" }, { status: 404 });
  }

  const [job] = await db
    .select()
    .from(ugcJobs)
    .where(eq(ugcJobs.userId, user.id))
    .orderBy(desc(ugcJobs.createdAt))
    .limit(1);

  return NextResponse.json({ data: job ?? null, error: null });
}

export async function POST() {
  const { userId: clerkId } = await auth();
  if (!clerkId) {
    return NextResponse.json({ data: null, error: "Unauthorized" }, { status: 401 });
  }
  const user = await ensureLocalUser(clerkId);
  if (!user) {
    return NextResponse.json({ data: null, error: "User not found" }, { status: 404 });
  }

  const [profile] = await db
    .select()
    .from(businessProfiles)
    .where(eq(businessProfiles.userId, user.id))
    .limit(1);
  if (!profile) {
    return NextResponse.json(
      { data: null, error: "Complete onboarding before creating a UGC video" },
      { status: 404 },
    );
  }

  const product = profile.products[0];
  if (!product) {
    return NextResponse.json(
      { data: null, error: "Add a product to your profile before creating a UGC video" },
      { status: 400 },
    );
  }

  // Block a second build while one is running.
  const [generating] = await db
    .select({ id: ugcJobs.id })
    .from(ugcJobs)
    .where(and(eq(ugcJobs.userId, user.id), eq(ugcJobs.status, "generating")))
    .limit(1);
  if (generating) {
    return NextResponse.json(
      { data: null, error: "A video is already being created" },
      { status: 409 },
    );
  }

  try {
    // B-roll source: the user's most recent uploaded photo, if any. No photo →
    // the pipeline builds a talking-head-only video (still valid).
    const { mediaLibraryService } = await import("@/lib/media-library");
    const library = await mediaLibraryService.list(user.id);
    const productImageUrl = library[0]?.mediaUrl ?? null;

    const proposal = await ugcPipelineService.propose({
      userId: user.id,
      business: {
        businessName: profile.businessName,
        businessType: profile.businessType,
        brandTone: profile.brandTone,
        targetCustomers: profile.targetCustomers,
      },
      product: { name: product.name, description: product.description },
      productImageUrl,
    });

    // A new proposal supersedes any existing draft.
    await db
      .delete(ugcJobs)
      .where(and(eq(ugcJobs.userId, user.id), eq(ugcJobs.status, "draft")));

    const [job] = await db
      .insert(ugcJobs)
      .values({
        userId: user.id,
        status: "draft",
        productName: product.name,
        productImageUrl: proposal.productImageUrl,
        presenterId: proposal.presenterId,
        script: proposal.script,
        steps: proposal.steps,
        outputs: {},
        totalCost: proposal.scriptCost,
      })
      .returning();

    return NextResponse.json({ data: job, error: null }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "UGC proposal failed";
    console.error("[api/ugc] propose failed:", message);
    return NextResponse.json(
      { data: null, error: "We couldn't set up your video right now. Please try again." },
      { status: 502 },
    );
  }
}

const patchSchema = z
  .object({
    jobId: z.string().min(1),
    script: z
      .object({
        hook: z.string().min(1),
        body: z.string().min(1),
        cta: z.string().min(1),
      })
      .optional(),
    presenterId: z.string().min(1).optional(),
  })
  .refine((v) => v.script || v.presenterId, {
    message: "Nothing to update",
  });

export async function PATCH(req: Request) {
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
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { data: null, error: parsed.error.flatten().fieldErrors },
      { status: 400 },
    );
  }

  if (parsed.data.presenterId && !PRESENTERS.some((p) => p.id === parsed.data.presenterId)) {
    return NextResponse.json(
      { data: null, error: "Unknown presenter" },
      { status: 400 },
    );
  }

  // Load the draft so we can recompute derived script fields from the edits.
  const [current] = await db
    .select()
    .from(ugcJobs)
    .where(and(eq(ugcJobs.id, parsed.data.jobId), eq(ugcJobs.userId, user.id)))
    .limit(1);
  if (!current || current.status !== "draft") {
    return NextResponse.json(
      { data: null, error: "Draft video not found" },
      { status: 404 },
    );
  }

  const patch: { script?: UgcScriptRecord; presenterId?: string } = {};
  if (parsed.data.script) {
    const { hook, body: b, cta } = parsed.data.script;
    const spokenText = assembleSpokenText({ hook, body: b, cta });
    patch.script = {
      hook,
      body: b,
      cta,
      spokenText,
      wordCount: countWords(spokenText),
      estimatedSeconds: estimateSpokenSeconds(spokenText),
    };
  }
  if (parsed.data.presenterId) {
    patch.presenterId = parsed.data.presenterId;
  }

  const [job] = await db
    .update(ugcJobs)
    .set(patch)
    .where(
      and(
        eq(ugcJobs.id, parsed.data.jobId),
        eq(ugcJobs.userId, user.id),
        eq(ugcJobs.status, "draft"),
      ),
    )
    .returning();

  return NextResponse.json({ data: job, error: null });
}
