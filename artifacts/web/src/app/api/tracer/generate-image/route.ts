/**
 * DEV-8: Agent Loop tracer — Execute + Assemble proof.
 *
 * Exercises a slice of the Agent Loop (ARCHITECTURE.md §2) against the
 * hardcoded tracer Business Profile: calls Muapi to generate a product
 * photo (Execute step), then uploads the result to R2 (Assemble step).
 * No DB writes — out of scope per plan-phase-0-5.md.
 */
import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { muapiService } from "@/lib/muapi";
import { r2Service } from "@/lib/r2";
import { tracerBusinessProfile } from "@/lib/tracer-data";

const PRODUCT_PHOTO_MODEL = "ai-product-photography";

export async function POST() {
  const { userId } = await auth();

  if (!userId) {
    return NextResponse.json(
      { data: null, error: "Unauthorized" },
      { status: 401 },
    );
  }

  const startedAt = Date.now();

  try {
    const [product] = tracerBusinessProfile.products;
    if (!product) {
      throw new Error("Tracer Business Profile has no products");
    }

    const prompt =
      `A professional product photo of ${product.name} — ${product.description} — ` +
      `for ${tracerBusinessProfile.businessName}, a ${tracerBusinessProfile.businessType}. ` +
      `${tracerBusinessProfile.brandKit.tone} brand tone, natural lighting, high detail, appetizing.`;

    const generation = await muapiService.generate(PRODUCT_PHOTO_MODEL, {
      prompt,
    });

    const imageResponse = await fetch(generation.imageUrl);
    if (!imageResponse.ok) {
      throw new Error(
        `Failed to download generated image (${imageResponse.status} ${imageResponse.statusText})`,
      );
    }
    const buffer = Buffer.from(await imageResponse.arrayBuffer());
    const contentType =
      imageResponse.headers.get("content-type") ?? "image/png";
    const extension = contentType.includes("png") ? "png" : "jpg";

    const key = `tracer/${userId}/${Date.now()}.${extension}`;
    const r2Url = await r2Service.upload(key, buffer, contentType);

    const duration = Date.now() - startedAt;

    return NextResponse.json({
      data: { r2Url, cost: generation.cost, duration },
      error: null,
    });
  } catch (err) {
    const duration = Date.now() - startedAt;
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[tracer/generate-image] failed:", message);
    return NextResponse.json(
      { data: null, error: message, duration },
      { status: 500 },
    );
  }
}
