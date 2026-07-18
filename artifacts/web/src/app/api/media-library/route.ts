/**
 * STU-C3 (DEV-62): Media Library API.
 *
 * GET  — the caller's uploaded photos, newest first.
 * POST — multipart upload of one business photo (field `file`) → R2 + DB row.
 *
 * Browser-called via fetch (same pattern as the Gallery API and the onboarding
 * logo upload), not a Server Action. Route handlers aren't subject to the
 * Server Action body-size limit, so real photos upload cleanly. Auth is checked
 * here (ensureLocalUser = DEV-59 JIT provisioning); validation/storage lives in
 * the MediaLibraryService.
 */
import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { ensureLocalUser } from "@/lib/local-user";
import { mediaLibraryService } from "@/lib/media-library";

export async function GET() {
  const { userId: clerkId } = await auth();
  if (!clerkId) {
    return NextResponse.json({ data: null, error: "Unauthorized" }, { status: 401 });
  }
  const user = await ensureLocalUser(clerkId);
  if (!user) {
    return NextResponse.json({ data: null, error: "User not found" }, { status: 404 });
  }

  const items = await mediaLibraryService.list(user.id);
  return NextResponse.json({ data: { items }, error: null });
}

export async function POST(req: Request) {
  const { userId: clerkId } = await auth();
  if (!clerkId) {
    return NextResponse.json({ data: null, error: "Unauthorized" }, { status: 401 });
  }
  const user = await ensureLocalUser(clerkId);
  if (!user) {
    return NextResponse.json({ data: null, error: "User not found" }, { status: 404 });
  }

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json(
      { data: null, error: "Expected multipart form data" },
      { status: 400 },
    );
  }

  const file = formData.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json(
      { data: null, error: "Missing 'file' field" },
      { status: 400 },
    );
  }
  const rawLabel = formData.get("label");
  const label =
    typeof rawLabel === "string" && rawLabel.trim() ? rawLabel.trim() : null;

  const buffer = Buffer.from(await file.arrayBuffer());

  try {
    const item = await mediaLibraryService.uploadFromBuffer({
      userId: user.id,
      buffer,
      label,
    });
    return NextResponse.json({ data: item, error: null }, { status: 201 });
  } catch (err) {
    // Validation errors carry user-safe messages; anything else is masked.
    const isValidation =
      err instanceof Error && /empty|10 MB|PNG, JPG, or WEBP/i.test(err.message);
    if (!isValidation) console.error("Media upload failed", err);
    return NextResponse.json(
      {
        data: null,
        error: isValidation
          ? (err as Error).message
          : "Failed to store the photo. Please try again.",
      },
      { status: isValidation ? 400 : 500 },
    );
  }
}
