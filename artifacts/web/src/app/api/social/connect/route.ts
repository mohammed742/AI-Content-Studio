/**
 * DEV-35 (STU-31): Social connect API.
 *
 * POST — start the OAuth connection for a platform. Returns the Muapi-generated
 * OAuth URL for the browser to navigate to. `external_user_id` is the Clerk id;
 * `redirect_to` points back at our callback (Muapi bounces the user there after
 * it captures the OAuth token — see social-publishing.ts).
 *
 * Browser-called via fetch, self-authing with `auth()` (the CLAUDE.md "Server
 * Actions only" rule is stale — every feature uses /api route handlers).
 */
import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { socialPublishingService } from "@/lib/social-publishing";

export async function POST(req: Request) {
  const { userId: clerkId } = await auth();
  if (!clerkId) {
    return NextResponse.json({ data: null, error: "Unauthorized" }, { status: 401 });
  }

  let body: { platform?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { data: null, error: "Expected a JSON body" },
      { status: 400 },
    );
  }
  const platform = typeof body.platform === "string" ? body.platform : "";

  // Muapi redirects the user's browser here after OAuth; derive the origin from
  // the request so it works in dev and prod without an APP_URL env.
  const origin = new URL(req.url).origin;
  const redirectTo = `${origin}/api/social/callback?platform=${encodeURIComponent(platform)}`;

  try {
    const { url } = await socialPublishingService.getConnectUrl({
      platform,
      externalUserId: clerkId,
      redirectTo,
    });
    return NextResponse.json({ data: { url }, error: null });
  } catch (err) {
    // Validation errors carry user-safe messages; upstream failures are masked.
    const isBadInput =
      err instanceof Error &&
      /Unsupported social platform|redirect_to|external_user_id/i.test(err.message);
    if (!isBadInput) console.error("Social connect failed", err);
    return NextResponse.json(
      {
        data: null,
        error: isBadInput
          ? (err as Error).message
          : "Couldn't start the connection. Please try again.",
      },
      { status: isBadInput ? 400 : 502 },
    );
  }
}
