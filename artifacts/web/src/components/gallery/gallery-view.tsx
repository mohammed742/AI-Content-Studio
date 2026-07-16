"use client";

/**
 * DEV-26: Gallery orchestrator (DESIGN §9.7).
 *
 * Filter (type + platform) + sort bar, responsive grid (3/2/1), load-more
 * pagination (12/page), skeleton loading + empty states, and the lightbox.
 * Ratings are optimistic (toggle locally, reconcile with the server).
 */
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Images } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { GalleryCard } from "./gallery-card";
import { GalleryLightbox } from "./gallery-lightbox";
import { toggleRating, type GalleryItem, type GalleryTypeFilter } from "@/lib/gallery";
import type { FeedbackRating } from "@/db/schema";

const TYPE_TABS: { value: GalleryTypeFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "image", label: "Images" },
  { value: "video", label: "Videos" },
];
const PLATFORMS = ["all", "instagram", "tiktok", "youtube"];

export function GalleryView() {
  const [items, setItems] = useState<GalleryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [type, setType] = useState<GalleryTypeFilter>("all");
  const [platform, setPlatform] = useState("all");
  const [sort, setSort] = useState<"newest" | "oldest">("newest");
  const [active, setActive] = useState<GalleryItem | null>(null);

  const fetchPage = useCallback(
    async (nextPage: number, replace: boolean) => {
      const params = new URLSearchParams({
        page: String(nextPage),
        type,
        platform,
        sort,
      });
      const res = await fetch(`/api/gallery?${params}`);
      const json = await res.json();
      if (!json.data) return;
      setItems((prev) =>
        replace ? json.data.items : [...prev, ...json.data.items],
      );
      setHasMore(json.data.hasMore);
      setPage(nextPage);
    },
    [type, platform, sort],
  );

  // Reload from page 1 whenever filters change.
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    (async () => {
      await fetchPage(1, true);
      if (!cancelled) setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [fetchPage]);

  const loadMore = async () => {
    setLoadingMore(true);
    try {
      await fetchPage(page + 1, false);
    } finally {
      setLoadingMore(false);
    }
  };

  const rate = async (item: GalleryItem, tapped: FeedbackRating) => {
    const next = toggleRating(item.rating, tapped);
    // Optimistic
    setItems((prev) => prev.map((i) => (i.id === item.id ? { ...i, rating: next } : i)));
    setActive((a) => (a && a.id === item.id ? { ...a, rating: next } : a));
    const res = await fetch("/api/gallery/feedback", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ assetKitId: item.id, rating: tapped }),
    });
    const json = await res.json();
    if (!res.ok || json.error) {
      // Roll back
      setItems((prev) =>
        prev.map((i) => (i.id === item.id ? { ...i, rating: item.rating } : i)),
      );
      toast.error("Couldn't save your rating");
    }
  };

  const onCaptionSaved = (id: string, caption: string) => {
    setItems((prev) => prev.map((i) => (i.id === id ? { ...i, caption } : i)));
    setActive((a) => (a && a.id === id ? { ...a, caption } : a));
  };

  const onDeleted = (id: string) => {
    setItems((prev) => prev.filter((i) => i.id !== id));
  };

  return (
    <div className="space-y-6 py-8">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">Gallery</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Everything your agent has generated. Rate items to teach it your taste.
        </p>
      </div>

      {/* Filter + sort bar */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex rounded-lg border border-border p-0.5">
          {TYPE_TABS.map((tab) => (
            <button
              key={tab.value}
              onClick={() => setType(tab.value)}
              className={cn(
                "rounded-md px-3 py-1.5 text-sm transition",
                type === tab.value
                  ? "bg-primary/10 text-primary"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <select
          value={platform}
          onChange={(e) => setPlatform(e.target.value)}
          aria-label="Filter by platform"
          className="rounded-lg border border-border bg-background px-3 py-1.5 text-sm capitalize"
        >
          {PLATFORMS.map((p) => (
            <option key={p} value={p}>
              {p === "all" ? "All platforms" : p}
            </option>
          ))}
        </select>

        <select
          value={sort}
          onChange={(e) => setSort(e.target.value as "newest" | "oldest")}
          aria-label="Sort order"
          className="ml-auto rounded-lg border border-border bg-background px-3 py-1.5 text-sm"
        >
          <option value="newest">Newest first</option>
          <option value="oldest">Oldest first</option>
        </select>
      </div>

      {/* Grid / states */}
      {loading ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="aspect-square rounded-xl" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <div className="flex min-h-[40vh] flex-col items-center justify-center rounded-xl border border-dashed border-border text-center">
          <Images className="h-10 w-10 text-muted-foreground" strokeWidth={1.5} />
          <p className="mt-3 text-sm text-muted-foreground">
            {type === "all" && platform === "all"
              ? "No content yet."
              : "No content matches these filters."}
          </p>
          {type === "all" && platform === "all" && (
            <Button asChild className="mt-4 rounded-full">
              <Link href="/plan">Create your first content plan</Link>
            </Button>
          )}
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {items.map((item) => (
              <GalleryCard
                key={item.id}
                item={item}
                onOpen={setActive}
                onRate={rate}
              />
            ))}
          </div>
          {hasMore && (
            <div className="flex justify-center pt-2">
              <Button
                variant="outline"
                className="rounded-full"
                onClick={loadMore}
                disabled={loadingMore}
              >
                {loadingMore ? "Loading…" : "Load more"}
              </Button>
            </div>
          )}
        </>
      )}

      <GalleryLightbox
        item={active}
        onClose={() => setActive(null)}
        onRate={rate}
        onCaptionSaved={onCaptionSaved}
        onDeleted={onDeleted}
      />
    </div>
  );
}
