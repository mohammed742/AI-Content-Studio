/**
 * Bug fix (DEV-9/DEV-4 surface): resolve the authenticated Clerk user to our
 * local `users` row, creating it just-in-time when the Clerk webhook hasn't
 * synced it yet. Webhooks only reach the deployed URL — accounts created
 * while running locally (or before a delayed webhook lands in production)
 * would otherwise 404 with "User not found" on every profile API call.
 *
 * The webhook (src/app/api/webhooks/clerk/route.ts) remains the primary sync
 * path; this is the fallback. Safe under races with it: the insert is
 * ON CONFLICT DO NOTHING against the unique `clerk_id`, then re-selected.
 */
import { currentUser } from "@clerk/nextjs/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { users, type User } from "@/db/schema";

export async function ensureLocalUser(clerkId: string): Promise<User | null> {
  const [existing] = await db
    .select()
    .from(users)
    .where(eq(users.clerkId, clerkId))
    .limit(1);
  if (existing) return existing;

  // Not synced yet — pull the profile from the Clerk session and create it.
  const clerkUser = await currentUser();
  if (!clerkUser || clerkUser.id !== clerkId) return null;

  const email =
    clerkUser.primaryEmailAddress?.emailAddress ??
    clerkUser.emailAddresses[0]?.emailAddress ??
    "";
  const name =
    [clerkUser.firstName, clerkUser.lastName].filter(Boolean).join(" ").trim() ||
    null;

  const [created] = await db
    .insert(users)
    .values({
      clerkId,
      email,
      name,
      imageUrl: clerkUser.imageUrl ?? null,
      role: "user",
    })
    .onConflictDoNothing({ target: users.clerkId })
    .returning();
  if (created) return created;

  // Conflict: the webhook (or a parallel request) won the race — read theirs.
  const [row] = await db
    .select()
    .from(users)
    .where(eq(users.clerkId, clerkId))
    .limit(1);
  return row ?? null;
}
