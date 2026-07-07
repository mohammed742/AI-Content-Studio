/**
 * DEV-9: Business Profile CRUD API (Phase 1 — Business Onboarding).
 *
 * The Business Profile is the onboarding data that drives ALL generation
 * (see CONTEXT.md "Business Profile"). Every route here requires an
 * authenticated Clerk user and resolves that Clerk user to our local
 * `users` row before reading/writing `business_profiles`, since
 * `business_profiles.user_id` references `users.id`, not the Clerk ID.
 * The row is created just-in-time if the Clerk webhook hasn't synced it
 * yet (see src/lib/local-user.ts).
 */
import { auth } from "@clerk/nextjs/server";
import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/db";
import {
  businessProfiles,
  insertBusinessProfileSchema,
  updateBusinessProfileSchema,
} from "@/db/schema";
import { ensureLocalUser } from "@/lib/local-user";

export async function GET() {
  const { userId: clerkId } = await auth();

  if (!clerkId) {
    return NextResponse.json(
      { data: null, error: "Unauthorized" },
      { status: 401 },
    );
  }

  const user = await ensureLocalUser(clerkId);
  if (!user) {
    return NextResponse.json(
      { data: null, error: "User not found" },
      { status: 404 },
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

  return NextResponse.json({ data: profile, error: null });
}

export async function POST(req: Request) {
  const { userId: clerkId } = await auth();

  if (!clerkId) {
    return NextResponse.json(
      { data: null, error: "Unauthorized" },
      { status: 401 },
    );
  }

  const user = await ensureLocalUser(clerkId);
  if (!user) {
    return NextResponse.json(
      { data: null, error: "User not found" },
      { status: 404 },
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { data: null, error: "Invalid JSON body" },
      { status: 400 },
    );
  }

  const parsed = insertBusinessProfileSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { data: null, error: parsed.error.flatten().fieldErrors },
      { status: 400 },
    );
  }

  const [existing] = await db
    .select()
    .from(businessProfiles)
    .where(eq(businessProfiles.userId, user.id))
    .limit(1);

  if (existing) {
    return NextResponse.json(
      { data: null, error: "Business profile already exists" },
      { status: 409 },
    );
  }

  const [profile] = await db
    .insert(businessProfiles)
    .values({ ...parsed.data, userId: user.id })
    .returning();

  return NextResponse.json({ data: profile, error: null }, { status: 201 });
}

export async function PATCH(req: Request) {
  const { userId: clerkId } = await auth();

  if (!clerkId) {
    return NextResponse.json(
      { data: null, error: "Unauthorized" },
      { status: 401 },
    );
  }

  const user = await ensureLocalUser(clerkId);
  if (!user) {
    return NextResponse.json(
      { data: null, error: "User not found" },
      { status: 404 },
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { data: null, error: "Invalid JSON body" },
      { status: 400 },
    );
  }

  const parsed = updateBusinessProfileSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { data: null, error: parsed.error.flatten().fieldErrors },
      { status: 400 },
    );
  }

  if (Object.keys(parsed.data).length === 0) {
    return NextResponse.json(
      { data: null, error: "No fields to update" },
      { status: 400 },
    );
  }

  const [profile] = await db
    .update(businessProfiles)
    .set(parsed.data)
    .where(eq(businessProfiles.userId, user.id))
    .returning();

  if (!profile) {
    return NextResponse.json(
      { data: null, error: "Business profile not found" },
      { status: 404 },
    );
  }

  return NextResponse.json({ data: profile, error: null });
}
