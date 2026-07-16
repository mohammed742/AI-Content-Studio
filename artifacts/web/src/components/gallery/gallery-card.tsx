"use client";

/**
 * DEV-26: One Gallery card (DESIGN §9.7) — thumbnail with a hover overlay:
 * type badge (top-left), platform (top-right), date + one-tap thumbs
 * (bottom). Filled thumb = current rating. Click opens the lightbox.
 */
import { ThumbsUp, ThumbsDown, PlayCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import type { GalleryItem } from "@/lib/gallery";
import type { FeedbackRating } from "@/db/schema";

const CONTENT_TYPE_LABEL: Record<string, string> = {
  product_showcase: "Product photo",
  tip: "Tip",
  behind_the_scenes: "Behind the scenes",
  promo: "Promotion",
  testimonial: "Testimonial",
  ugc_ad: "UGC ad",
  seasonal: "Seasonal",
  engagement: "Engagement",
};

export function GalleryCard({
  item,
  onOpen,
  onRate,
}: {
  item: GalleryItem;
  onOpen: (item: GalleryItem) => void;
  onRate: (item: GalleryItem, rating: FeedbackRating) => void;
}) {
  const date = new Date(item.createdAt).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });

  return (
    <div className="group relative aspect-square overflow-hidden rounded-xl border border-border bg-card">
      <button
        type="button"
        onClick={() => onOpen(item)}
        className="absolute inset-0 h-full w-full"
        aria-label={`Open ${item.title}`}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={item.mediaUrl}
          alt={item.title}
          className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
        />
      </button>

      {item.mediaType === "video" && (
        <PlayCircle
          className="pointer-events-none absolute left-1/2 top-1/2 h-10 w-10 -translate-x-1/2 -translate-y-1/2 text-white/90"
          strokeWidth={1.5}
        />
      )}

      {/* Hover overlay */}
      <div className="pointer-events-none absolute inset-0 flex flex-col justify-between bg-gradient-to-t from-black/70 via-transparent to-black/40 p-3 opacity-0 transition-opacity group-hover:opacity-100">
        <div className="flex items-start justify-between">
          <span className="rounded-full bg-black/50 px-2 py-0.5 text-xs text-white">
            {CONTENT_TYPE_LABEL[item.contentType] ?? item.contentType}
          </span>
          <span className="rounded-full bg-black/50 px-2 py-0.5 text-xs capitalize text-white">
            {item.platform}
          </span>
        </div>
        <div className="flex items-end justify-between">
          <span className="text-xs text-white/90">{date}</span>
          <div className="pointer-events-auto flex gap-1">
            <RateButton
              active={item.rating === "up"}
              activeClass="bg-green-500 text-white"
              label="Rate up"
              onClick={() => onRate(item, "up")}
            >
              <ThumbsUp className="h-4 w-4" strokeWidth={1.5} />
            </RateButton>
            <RateButton
              active={item.rating === "down"}
              activeClass="bg-red-500 text-white"
              label="Rate down"
              onClick={() => onRate(item, "down")}
            >
              <ThumbsDown className="h-4 w-4" strokeWidth={1.5} />
            </RateButton>
          </div>
        </div>
      </div>
    </div>
  );
}

function RateButton({
  active,
  activeClass,
  label,
  onClick,
  children,
}: {
  active: boolean;
  activeClass: string;
  label: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        "rounded-lg p-1.5 transition active:scale-[0.95]",
        active ? activeClass : "bg-black/50 text-white hover:bg-black/70",
      )}
    >
      {children}
    </button>
  );
}
