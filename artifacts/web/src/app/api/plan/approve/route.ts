/**
 * DEV-24: Approve & Generate All — flips a plan to `generating`, runs the
 * Generation Queue over its pending/failed items (parallel, failure-isolated),
 * then marks the plan `completed`. Also serves per-item Retry: re-approving a
 * plan whose items partially failed re-runs only the failed ones.
 *
 * Runs the queue inline in the request (per-item statuses land in the DB as
 * they finish; the /plan page polls GET /api/plan for live progress).
 */
import { auth } from "@clerk/nextjs/server";
import { and, eq, inArray, sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/db";
import { businessProfiles, contentPlans } from "@/db/schema";
import { generationQueueService } from "@/lib/generation-queue";
import { ensureLocalUser } from "@/lib/local-user";

const bodySchema = z.object({ planId: z.string().min(1) });

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

  const [profile] = await db
    .select()
    .from(businessProfiles)
    .where(eq(businessProfiles.userId, user.id))
    .limit(1);
  if (!profile) {
    return NextResponse.json(
      { data: null, error: "Business profile not found" },
      { status: 404 },
    );
  }

  // Claim the plan: draft (first approval) or completed-with-failures (retry).
  const [plan] = await db
    .update(contentPlans)
    .set({ status: "generating" })
    .where(
      and(
        eq(contentPlans.id, parsed.data.planId),
        eq(contentPlans.userId, user.id),
        inArray(contentPlans.status, ["draft", "completed"]),
      ),
    )
    .returning();
  if (!plan) {
    return NextResponse.json(
      { data: null, error: "Plan not found or already generating" },
      { status: 404 },
    );
  }

  try {
    const result = await generationQueueService.processPlan({
      planId: plan.id,
      userId: user.id,
      profile,
      items: plan.items,
    });

    const [updated] = await db
      .update(contentPlans)
      .set({
        status: "completed",
        totalCost: sql`${contentPlans.totalCost} + ${result.totalCost}`,
      })
      .where(eq(contentPlans.id, plan.id))
      .returning();

    return NextResponse.json({
      data: {
        plan: updated,
        completed: result.completed,
        failed: result.failed,
      },
      error: null,
    });
  } catch (error) {
    // processPlan isolates item failures; reaching here means something
    // systemic (e.g. DB write) broke. Mark completed so failed items show
    // their Retry state instead of the plan hanging in `generating`.
    const message = error instanceof Error ? error.message : "Generation failed";
    console.error("[api/plan/approve] queue failed:", message);
    await db
      .update(contentPlans)
      .set({ status: "completed" })
      .where(eq(contentPlans.id, plan.id));
    return NextResponse.json(
      { data: null, error: "Generation hit a problem. Failed items can be retried." },
      { status: 502 },
    );
  }
}
