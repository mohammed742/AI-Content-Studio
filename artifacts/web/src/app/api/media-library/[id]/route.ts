/**
 * STU-C3 (DEV-62): Single Media Library item — DELETE (ownership-scoped).
 */
import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { ensureLocalUser } from "@/lib/local-user";
import { mediaLibraryService } from "@/lib/media-library";

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
  const removed = await mediaLibraryService.remove(user.id, id);
  if (!removed) {
    return NextResponse.json({ data: null, error: "Not found" }, { status: 404 });
  }
  return NextResponse.json({ data: { id }, error: null });
}
