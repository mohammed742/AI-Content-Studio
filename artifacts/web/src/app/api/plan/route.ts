/**
 * DEV-24: Content Plan API.
 *
 * GET   — the caller's latest Content Plan (any status), for the /plan page.
 * POST  — propose a new plan: runs the DEV-20 Content Planner against the
 *         caller's Business Profile and saves a `draft` plan. Replaces any
 *         existing draft; 409 while a plan is generating.
 * PATCH — edit a draft plan's items (review mode: edit/remove/add).
 *
 * Users never see model names or dollar costs — responses expose items and
 * credit estimates only (CONTEXT.md → "Credits Display").
 */
import { auth } from "@clerk/nextjs/server";
import { and, desc, eq, inArray } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/db";
import {
  businessProfiles,
  contentPlans,
  CONTENT_TYPES,
  type ContentPlanItemRecord,
} from "@/db/schema";
import { contentPlannerService } from "@/lib/content-planner";
import { agentEvalsService } from "@/lib/agent-evals";
import { ensureLocalUser } from "@/lib/local-user";

/** Monday 00:00 UTC of the current week. */
function currentWeekStart(now = new Date()): Date {
  const day = now.getUTCDay(); // 0 = Sunday
  const sinceMonday = (day + 6) % 7;
  const monday = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - sinceMonday),
  );
  return monday;
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

  const [plan] = await db
    .select()
    .from(contentPlans)
    .where(eq(contentPlans.userId, user.id))
    .orderBy(desc(contentPlans.createdAt))
    .limit(1);

  return NextResponse.json({ data: plan ?? null, error: null });
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
      { data: null, error: "Complete onboarding before creating a content plan" },
      { status: 404 },
    );
  }

  const [generating] = await db
    .select({ id: contentPlans.id })
    .from(contentPlans)
    .where(
      and(eq(contentPlans.userId, user.id), eq(contentPlans.status, "generating")),
    )
    .limit(1);
  if (generating) {
    return NextResponse.json(
      { data: null, error: "A plan is already generating" },
      { status: 409 },
    );
  }

  try {
    // Performance Feedback Loop (DEV-25): bias the plan toward what this
    // user's audience has rated well. Non-fatal — a fresh user has no data.
    let performanceInsights: string | undefined;
    try {
      const insights = await agentEvalsService.getPerformanceInsights(user.id);
      performanceInsights = insights.hasData ? insights.summary : undefined;
    } catch (insightsError) {
      console.error("[api/plan] performance insights failed:", insightsError);
    }

    const proposal = await contentPlannerService.proposePlan(user.id, profile, {
      performanceInsights,
    });

    const items: ContentPlanItemRecord[] = proposal.items.map((item) => ({
      id: crypto.randomUUID(),
      type: item.type,
      title: item.title,
      description: item.description,
      platform: item.platform,
      scheduledDay: item.scheduledDay,
      estimatedCredits: item.estimatedCredits,
      status: "pending",
    }));

    // A new proposal supersedes any existing draft.
    await db
      .delete(contentPlans)
      .where(
        and(eq(contentPlans.userId, user.id), eq(contentPlans.status, "draft")),
      );

    const [plan] = await db
      .insert(contentPlans)
      .values({
        userId: user.id,
        weekStart: currentWeekStart(),
        status: "draft",
        items,
        totalCost: proposal.cost,
      })
      .returning();

    return NextResponse.json({ data: plan, error: null }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Plan proposal failed";
    console.error("[api/plan] propose failed:", message);
    return NextResponse.json(
      { data: null, error: "We couldn't build your plan right now. Please try again." },
      { status: 502 },
    );
  }
}

const itemSchema = z.object({
  id: z.string().min(1),
  type: z.enum(CONTENT_TYPES),
  title: z.string().min(1),
  description: z.string().min(1),
  platform: z.string().min(1),
  scheduledDay: z.string().min(1),
  estimatedCredits: z.number().int().min(1).default(1),
  status: z
    .enum(["pending", "generating", "completed", "failed"])
    .default("pending"),
  assetKitId: z.string().optional(),
  mediaUrl: z.string().optional(),
  error: z.string().optional(),
});

const patchSchema = z.object({
  planId: z.string().min(1),
  items: z.array(itemSchema).min(1).max(10),
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

  const [plan] = await db
    .update(contentPlans)
    .set({ items: parsed.data.items as ContentPlanItemRecord[] })
    .where(
      and(
        eq(contentPlans.id, parsed.data.planId),
        eq(contentPlans.userId, user.id),
        // Items are only editable while the plan is still a draft.
        inArray(contentPlans.status, ["draft"]),
      ),
    )
    .returning();

  if (!plan) {
    return NextResponse.json(
      { data: null, error: "Draft plan not found" },
      { status: 404 },
    );
  }
  return NextResponse.json({ data: plan, error: null });
}
