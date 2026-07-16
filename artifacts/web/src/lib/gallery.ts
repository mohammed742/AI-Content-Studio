/**
 * DEV-26: Pure helpers for the Gallery — query parsing/clamping and the
 * thumbs up/down toggle rule. Kept side-effect-free so the pagination and
 * rating logic unit-test without a request or DB (the Drizzle queries live in
 * the API route and use these).
 */
import type { AssetKit, FeedbackRating, MediaType } from "@/db/schema";

/** An Asset Kit as returned by GET /api/gallery (dates serialized to strings). */
export interface GalleryItem {
  id: string;
  title: string;
  contentType: AssetKit["contentType"];
  platform: string;
  mediaUrl: string;
  mediaType: MediaType;
  caption: string;
  hashtags: string[];
  status: AssetKit["status"];
  createdAt: string;
  rating: FeedbackRating | null;
}

/** Cards per page (DESIGN §9.7: 12 per page, load-more). */
export const GALLERY_PAGE_SIZE = 12;

export type GallerySort = "newest" | "oldest";
/** Filter by the media kind — `all`, or one media type. */
export type GalleryTypeFilter = "all" | MediaType;

export interface GalleryQuery {
  page: number;
  sort: GallerySort;
  type: GalleryTypeFilter;
  /** Platform filter, or undefined for all platforms. */
  platform?: string;
}

const TYPE_FILTERS: GalleryTypeFilter[] = ["all", "image", "video"];

/**
 * Parse + clamp the gallery query string into a safe shape. Unknown or
 * malformed values fall back to defaults (page 1, newest, all types).
 */
export function parseGalleryQuery(
  params: URLSearchParams | Record<string, string | undefined>,
): GalleryQuery {
  const get = (key: string): string | undefined =>
    params instanceof URLSearchParams
      ? (params.get(key) ?? undefined)
      : params[key];

  const rawPage = Number.parseInt(get("page") ?? "1", 10);
  const page = Number.isFinite(rawPage) && rawPage >= 1 ? rawPage : 1;

  const sort: GallerySort = get("sort") === "oldest" ? "oldest" : "newest";

  const rawType = get("type");
  const type: GalleryTypeFilter =
    rawType && TYPE_FILTERS.includes(rawType as GalleryTypeFilter)
      ? (rawType as GalleryTypeFilter)
      : "all";

  const platformRaw = get("platform")?.trim();
  const platform = platformRaw && platformRaw !== "all" ? platformRaw : undefined;

  return { page, sort, type, platform };
}

/** Zero-based row offset for a 1-based page. */
export function pageOffset(page: number): number {
  return (page - 1) * GALLERY_PAGE_SIZE;
}

/**
 * The new rating after a thumbs tap: tapping the current rating clears it
 * (null), tapping the other switches to it.
 */
export function toggleRating(
  current: FeedbackRating | null | undefined,
  tapped: FeedbackRating,
): FeedbackRating | null {
  return current === tapped ? null : tapped;
}
