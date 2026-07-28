/**
 * DEV-33: Generate Video — claims a `draft` (or previously `failed`) UGC Job,
 * flips it to `generating`, and runs the pipeline inline (voiceover → talking
 * head → B-roll → assembly → reframe → finalize). Per-step status + each step's
 * output URL land in the row as they finish; the /plan/ugc page polls GET
 * /api/ugc for live progress.
 *
 * Re-POSTing a `failed` job serves the AC's "retry from that step": the runner
 * resumes at the first non-completed step, reusing the persisted intermediate
 * outputs, so completed work is never redone.
 *
 * Runs inline (like /api/plan/approve) rather than fire-and-forget so a
 * systemic failure surfaces to the caller; the pipeline itself persists
 * progress step-by-step regardless.
 */
import { auth } from "@clerk/nextjs/server";
import { and, eq, inArray } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/db";
import { ugcJobs } from "@/db/schema";
import { ensureLocalUser } from "@/lib/local-user";
import { ugcPipelineService } from "@/lib/ugc-pipeline";

const bodySchema = z.object({ jobId: z.string().min(1) });

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

  // Claim the job: draft (first run) or failed (retry). Prevents a double-run.
  const [job] = await db
    .update(ugcJobs)
    .set({ status: "generating" })
    .where(
      and(
        eq(ugcJobs.id, parsed.data.jobId),
        eq(ugcJobs.userId, user.id),
        inArray(ugcJobs.status, ["draft", "failed"]),
      ),
    )
    .returning();
  if (!job) {
    return NextResponse.json(
      { data: null, error: "Video not found or already being created" },
      { status: 404 },
    );
  }

  try {
    const result = await ugcPipelineService.run({
      id: job.id,
      userId: job.userId,
      productName: job.productName,
      productImageUrl: job.productImageUrl,
      presenterId: job.presenterId,
      script: job.script,
      steps: job.steps,
      outputs: job.outputs,
      totalCost: job.totalCost,
    });

    return NextResponse.json({
      data: {
        status: result.status,
        assetKitId: result.assetKitId ?? null,
        failedStep: result.failedStep ?? null,
      },
      error: null,
    });
  } catch (error) {
    // run() isolates step failures; reaching here means something systemic
    // (e.g. a DB write) broke. Mark failed so the UI shows Retry instead of
    // hanging in `generating`.
    const message = error instanceof Error ? error.message : "Generation failed";
    console.error("[api/ugc/generate] pipeline failed:", message);
    await db.update(ugcJobs).set({ status: "failed" }).where(eq(ugcJobs.id, job.id));
    return NextResponse.json(
      { data: null, error: "Something went wrong creating your video. You can retry." },
      { status: 502 },
    );
  }
}
