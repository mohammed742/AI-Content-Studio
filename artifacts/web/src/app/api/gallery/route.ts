/**
 * DEV-26: Gallery list API.
 *
 * GET — the caller's Asset Kits, paginated (12/page, load-more), filterable by
 * media type + platform, sortable newest/oldest, each annotated with the
 * caller's thumbs up/down rating (LEFT JOIN generation_feedback). Users see
 * content only — no model names, no costs.
 */
import { auth } from "@clerk/nextjs/server";
import { and, asc, desc, eq, sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/db";
import { assetKits, generationFeedback } from "@/db/schema";
import { ensureLocalUser } from "@/lib/local-user";
import { GALLERY_PAGE_SIZE, pageOffset, parseGalleryQuery } from "@/lib/gallery";

export async function GET(req: Request) {
  const { userId: clerkId } = await auth();
  if (!clerkId) {
    return NextResponse.json({ data: null, error: "Unauthorized" }, { status: 401 });
  }
  const user = await ensureLocalUser(clerkId);
  if (!user) {
    return NextResponse.json({ data: null, error: "User not found" }, { status: 404 });
  }

  const query = parseGalleryQuery(new URL(req.url).searchParams);

  const filters = [eq(assetKits.userId, user.id)];
  if (query.type !== "all") {
    filters.push(eq(assetKits.mediaType, query.type));
  }
  if (query.platform) {
    filters.push(eq(assetKits.platform, query.platform));
  }
  const where = and(...filters);

  // Fetch one extra row to know whether another page exists.
  const rows = await db
    .select({
      id: assetKits.id,
      title: assetKits.title,
      contentType: assetKits.contentType,
      platform: assetKits.platform,
      mediaUrl: assetKits.mediaUrl,
      mediaType: assetKits.mediaType,
      media: assetKits.media,
      caption: assetKits.caption,
      hashtags: assetKits.hashtags,
      status: assetKits.status,
      createdAt: assetKits.createdAt,
      rating: generationFeedback.rating,
    })
    .from(assetKits)
    .leftJoin(
      generationFeedback,
      and(
        eq(generationFeedback.assetKitId, assetKits.id),
        eq(generationFeedback.userId, user.id),
      ),
    )
    .where(where)
    .orderBy(
      query.sort === "oldest" ? asc(assetKits.createdAt) : desc(assetKits.createdAt),
    )
    .limit(GALLERY_PAGE_SIZE + 1)
    .offset(pageOffset(query.page));

  const hasMore = rows.length > GALLERY_PAGE_SIZE;
  const items = hasMore ? rows.slice(0, GALLERY_PAGE_SIZE) : rows;

  const [{ total } = { total: 0 }] = await db
    .select({ total: sql<number>`count(*)::int` })
    .from(assetKits)
    .where(where);

  return NextResponse.json({
    data: { items, page: query.page, hasMore, total },
    error: null,
  });
}
