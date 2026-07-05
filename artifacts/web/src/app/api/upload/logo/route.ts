/**
 * DEV-11: Logo upload endpoint (Phase 1 — Business Onboarding).
 *
 * Accepts a multipart form upload of a business logo, validates type/size,
 * and stores it in R2 (the media storage from DEV-8). The returned public
 * URL is saved onto the Business Profile as `logoUrl` by the onboarding
 * wizard. Brand color extraction happens client-side (canvas pixel
 * analysis), not here — this route only persists the file.
 */
import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { r2Service } from "@/lib/r2";

const MAX_LOGO_BYTES = 5 * 1024 * 1024; // 5 MB

const ALLOWED_TYPES: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/svg+xml": "svg",
};

/**
 * Verify the file content actually matches the claimed type (the client's
 * MIME type is attacker-controlled). PNG/JPEG are checked by magic bytes;
 * SVG must parse as text containing an <svg root and no active content.
 */
function validateContent(buffer: Buffer, extension: string): string | null {
  if (extension === "png") {
    const PNG_MAGIC = [0x89, 0x50, 0x4e, 0x47];
    if (
      buffer.length < 4 ||
      !PNG_MAGIC.every((byte, i) => buffer[i] === byte)
    ) {
      return "File content does not match a PNG image";
    }
    return null;
  }

  if (extension === "jpg") {
    if (
      buffer.length < 3 ||
      buffer[0] !== 0xff ||
      buffer[1] !== 0xd8 ||
      buffer[2] !== 0xff
    ) {
      return "File content does not match a JPG image";
    }
    return null;
  }

  // SVG: must look like an SVG document and contain no active content.
  // Served with Content-Disposition: attachment as well (defense in depth),
  // so a direct navigation downloads instead of rendering as a document.
  const text = buffer.toString("utf8");
  if (!/<svg[\s>]/i.test(text)) {
    return "File content does not match an SVG image";
  }
  const dangerous =
    /<\s*(script|foreignObject|iframe|embed|object)[\s>]|on\w+\s*=|javascript:|data:text\/html/i;
  if (dangerous.test(text)) {
    return "SVG contains disallowed active content (scripts or event handlers)";
  }
  return null;
}

export async function POST(req: Request) {
  const { userId: clerkId } = await auth();

  if (!clerkId) {
    return NextResponse.json(
      { data: null, error: "Unauthorized" },
      { status: 401 },
    );
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

  const extension = ALLOWED_TYPES[file.type];
  if (!extension) {
    return NextResponse.json(
      { data: null, error: "Logo must be a PNG, JPG, or SVG image" },
      { status: 400 },
    );
  }

  if (file.size === 0) {
    return NextResponse.json(
      { data: null, error: "Uploaded file is empty" },
      { status: 400 },
    );
  }

  if (file.size > MAX_LOGO_BYTES) {
    return NextResponse.json(
      { data: null, error: "Logo must be 5 MB or smaller" },
      { status: 400 },
    );
  }

  const buffer = Buffer.from(await file.arrayBuffer());

  const contentError = validateContent(buffer, extension);
  if (contentError) {
    return NextResponse.json(
      { data: null, error: contentError },
      { status: 400 },
    );
  }

  try {
    const key = `logos/${clerkId}/${Date.now()}.${extension}`;
    const url = await r2Service.upload(
      key,
      buffer,
      extension === "svg" ? "image/svg+xml" : file.type,
      // SVGs: force download on direct navigation so the file can never
      // execute as a top-level document; <img> embedding is unaffected.
      extension === "svg" ? { contentDisposition: "attachment" } : undefined,
    );
    return NextResponse.json({ data: { url }, error: null }, { status: 201 });
  } catch (err) {
    console.error("Logo upload failed", err);
    return NextResponse.json(
      { data: null, error: "Failed to store the logo. Please try again." },
      { status: 500 },
    );
  }
}
