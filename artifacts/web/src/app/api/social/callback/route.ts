/**
 * DEV-35 (STU-31): Social OAuth callback.
 *
 * GET — the `redirect_to` Muapi bounces the user's browser to after it captures
 * the OAuth token. There is **no** OAuth code here and we store **no** tokens;
 * Muapi holds them. We just re-sync the user's connected accounts from Muapi
 * into `social_accounts`, then send the browser to /social with a result flag.
 *
 * This is a browser-hit GET redirect target — a legitimate exception to the
 * "no browser-called /api" convention, the same webhook class as Clerk/Stripe.
 */
import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { ensureLocalUser } from "@/lib/local-user";
import { socialPublishingService } from "@/lib/social-publishing";

export async function GET(req: Request) {
  const platform = new URL(req.url).searchParams.get("platform") ?? "";

  const { userId: clerkId } = await auth();
  if (!clerkId) {
    return NextResponse.redirect(new URL("/sign-in", req.url));
  }
  const user = await ensureLocalUser(clerkId);
  if (!user) {
    return NextResponse.redirect(new URL("/sign-in", req.url));
  }

  const dest = new URL("/social", req.url);
  if (platform) {
    dest.searchParams.set("platform", platform);
  }
  try {
    const saved = await socialPublishingService.syncAccounts({
      userId: user.id,
      externalUserId: clerkId,
    });
    dest.searchParams.set("connected", "1");
    dest.searchParams.set("count", String(saved.length));
  } catch (err) {
    console.error("Social callback sync failed", err);
    dest.searchParams.set("error", "sync_failed");
  }
  return NextResponse.redirect(dest);
}
