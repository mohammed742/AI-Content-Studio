/**
 * DEV-34 (STU-32): Connected accounts management API.
 *
 * PATCH  — rename a connected account (a local friendly nickname; blank clears
 *          it). Ownership-scoped via our internal user id.
 * DELETE — disconnect: revoke on Muapi, then delete the local row.
 *
 * Browser-called via fetch, self-authing with `auth()` (the CLAUDE.md "Server
 * Actions only" rule is stale — every feature uses /api route handlers). The GET
 * list is served by the /social server component, so it isn't duplicated here.
 */
import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { ensureLocalUser } from "@/lib/local-user";
import { socialPublishingService } from "@/lib/social-publishing";

/** Validation errors carry user-safe messages; "Account not found" → 404; rest masked. */
function errorResponse(err: unknown, action: string) {
  const message = err instanceof Error ? err.message : "";
  if (/Account not found/i.test(message)) {
    return NextResponse.json({ data: null, error: "Account not found" }, { status: 404 });
  }
  if (/characters or fewer|is required/i.test(message)) {
    return NextResponse.json({ data: null, error: message }, { status: 400 });
  }
  console.error(`Social ${action} failed`, err);
  return NextResponse.json(
    { data: null, error: `Couldn't ${action} the account. Please try again.` },
    { status: 502 },
  );
}

export async function PATCH(req: Request) {
  const { userId: clerkId } = await auth();
  if (!clerkId) {
    return NextResponse.json({ data: null, error: "Unauthorized" }, { status: 401 });
  }
  const user = await ensureLocalUser(clerkId);
  if (!user) {
    return NextResponse.json({ data: null, error: "Unauthorized" }, { status: 401 });
  }

  let body: { accountId?: unknown; nickname?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ data: null, error: "Expected a JSON body" }, { status: 400 });
  }
  const accountId = typeof body.accountId === "string" ? body.accountId.trim() : "";
  const nickname = typeof body.nickname === "string" ? body.nickname : "";
  if (!accountId) {
    return NextResponse.json({ data: null, error: "accountId is required" }, { status: 400 });
  }

  try {
    const account = await socialPublishingService.renameAccount({
      userId: user.id,
      accountId,
      nickname,
    });
    return NextResponse.json({
      data: { account: { id: account.id, nickname: account.nickname } },
      error: null,
    });
  } catch (err) {
    return errorResponse(err, "rename");
  }
}

export async function DELETE(req: Request) {
  const { userId: clerkId } = await auth();
  if (!clerkId) {
    return NextResponse.json({ data: null, error: "Unauthorized" }, { status: 401 });
  }
  const user = await ensureLocalUser(clerkId);
  if (!user) {
    return NextResponse.json({ data: null, error: "Unauthorized" }, { status: 401 });
  }

  let body: { accountId?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ data: null, error: "Expected a JSON body" }, { status: 400 });
  }
  const accountId = typeof body.accountId === "string" ? body.accountId.trim() : "";
  if (!accountId) {
    return NextResponse.json({ data: null, error: "accountId is required" }, { status: 400 });
  }

  try {
    await socialPublishingService.disconnectAccount({
      userId: user.id,
      accountId,
      externalUserId: clerkId,
    });
    return NextResponse.json({ data: { ok: true }, error: null });
  } catch (err) {
    return errorResponse(err, "disconnect");
  }
}
