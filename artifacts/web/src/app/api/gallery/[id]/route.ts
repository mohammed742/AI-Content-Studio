/**
 * DEV-26: Single Asset Kit management.
 *
 * PATCH  { caption } — edit the caption (Gallery lightbox).
 * DELETE — remove the kit (cascades its feedback).
 *
 * Both are ownership-scoped to the caller.
 */
import { auth } from "@clerk/nextjs/server";
import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/db";
import { assetKits } from "@/db/schema";
import { ensureLocalUser } from "@/lib/local-user";

const patchSchema = z.object({ caption: z.string().min(1).max(2200) });

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { userId: clerkId } = await auth();
  if (!clerkId) {
    return NextResponse.json({ data: null, error: "Unauthorized" }, { status: 401 });
  }
  const user = await ensureLocalUser(clerkId);
  if (!user) {
    return NextResponse.json({ data: null, error: "User not found" }, { status: 404 });
  }

  const { id } = await params;
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

  const [kit] = await db
    .update(assetKits)
    .set({ caption: parsed.data.caption })
    .where(and(eq(assetKits.id, id), eq(assetKits.userId, user.id)))
    .returning();

  if (!kit) {
    return NextResponse.json({ data: null, error: "Not found" }, { status: 404 });
  }
  return NextResponse.json({ data: kit, error: null });
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { userId: clerkId } = await auth();
  if (!clerkId) {
    return NextResponse.json({ data: null, error: "Unauthorized" }, { status: 401 });
  }
  const user = await ensureLocalUser(clerkId);
  if (!user) {
    return NextResponse.json({ data: null, error: "User not found" }, { status: 404 });
  }

  const { id } = await params;
  const [deleted] = await db
    .delete(assetKits)
    .where(and(eq(assetKits.id, id), eq(assetKits.userId, user.id)))
    .returning({ id: assetKits.id });

  if (!deleted) {
    return NextResponse.json({ data: null, error: "Not found" }, { status: 404 });
  }
  return NextResponse.json({ data: { id: deleted.id }, error: null });
}
