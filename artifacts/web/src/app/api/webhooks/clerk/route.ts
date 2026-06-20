import { Webhook } from "svix";
import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { db } from "@/db";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";
import { env } from "@/env";

interface WebhookEvent {
  type: string;
  data: {
    id: string;
    email_addresses?: Array<{ email_address: string }>;
    first_name?: string | null;
    last_name?: string | null;
    image_url?: string | null;
  };
}

export async function POST(req: Request) {
  const payload = await req.text();
  const headerPayload = await headers();

  const svixId = headerPayload.get("svix-id");
  const svixTimestamp = headerPayload.get("svix-timestamp");
  const svixSignature = headerPayload.get("svix-signature");

  if (!svixId || !svixTimestamp || !svixSignature) {
    return NextResponse.json(
      { error: "Missing svix headers" },
      { status: 400 },
    );
  }

  const wh = new Webhook(env.CLERK_WEBHOOK_SECRET);

  let event: WebhookEvent;
  try {
    event = wh.verify(payload, {
      "svix-id": svixId,
      "svix-timestamp": svixTimestamp,
      "svix-signature": svixSignature,
    }) as WebhookEvent;
  } catch {
    return NextResponse.json(
      { error: "Invalid webhook signature" },
      { status: 400 },
    );
  }

  const { type, data } = event;
  const clerkId = data.id;
  const email = data.email_addresses?.[0]?.email_address ?? "";
  const name = [data.first_name, data.last_name]
    .filter(Boolean)
    .join(" ")
    .trim()
    || null;
  const imageUrl = data.image_url ?? null;

  if (type === "user.created") {
    const existing = await db
      .select()
      .from(users)
      .where(eq(users.clerkId, clerkId))
      .limit(1);

    if (existing.length === 0) {
      await db.insert(users).values({
        clerkId,
        email,
        name,
        imageUrl,
        role: "user",
      });
    }
  }

  if (type === "user.updated") {
    await db
      .update(users)
      .set({
        email,
        name,
        imageUrl,
        updatedAt: new Date(),
      })
      .where(eq(users.clerkId, clerkId));
  }

  return NextResponse.json({ received: true }, { status: 200 });
}
