"use client";

/**
 * DEV-33: Result (DESIGN §9.6 step 5). Video player with per-format tabs — the
 * 9:16 / 1:1 / 16:9 reframed variants (DEV-31), each downloadable. "Publish
 * Now" and "Add to Calendar" render disabled with a "coming soon" hint:
 * connected social accounts (Phase 4/5) and the calendar page don't exist yet.
 * A "View in Gallery" link opens the saved multi-format Asset Kit.
 */
import { useState } from "react";
import Link from "next/link";
import { Download, Sparkles, CalendarPlus, Send, ImageIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import type { AssetKitMedia } from "@/db/schema";

/** Platform hint per format so the tabs read for humans, not as ratios alone. */
const FORMAT_HINT: Record<string, string> = {
  "9:16": "TikTok · Reels · Shorts",
  "1:1": "Instagram feed",
  "16:9": "YouTube",
  "4:5": "Instagram portrait",
};

export function UgcResult({
  variants,
  assetKitId,
  onStartNew,
}: {
  variants: AssetKitMedia[];
  assetKitId: string | null;
  onStartNew: () => void;
}) {
  const [active, setActive] = useState(0);
  const current = variants[active];

  return (
    <div className="space-y-6 py-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">
            Your video is ready
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Formatted for every platform. Preview each, then download or publish.
          </p>
        </div>
        <Button variant="outline" className="rounded-full" onClick={onStartNew}>
          <Sparkles className="mr-2 h-4 w-4" strokeWidth={1.5} />
          Make another
        </Button>
      </div>

      {/* Format tabs */}
      <div className="flex flex-wrap gap-2" role="tablist" aria-label="Video formats">
        {variants.map((variant, i) => (
          <button
            key={variant.aspectRatio ?? i}
            type="button"
            role="tab"
            aria-selected={i === active}
            onClick={() => setActive(i)}
            className={cn(
              "rounded-full border px-4 py-1.5 text-sm transition",
              i === active
                ? "border-primary bg-primary/10 text-foreground"
                : "border-border text-muted-foreground hover:border-primary/50",
            )}
          >
            <span className="font-medium">{variant.aspectRatio ?? "Format"}</span>
            {variant.aspectRatio && FORMAT_HINT[variant.aspectRatio] && (
              <span className="ml-2 hidden text-xs text-muted-foreground sm:inline">
                {FORMAT_HINT[variant.aspectRatio]}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Player */}
      {current && (
        <div className="overflow-hidden rounded-xl border border-border bg-black">
          <video
            key={current.url}
            src={current.url}
            controls
            playsInline
            className="mx-auto max-h-[70vh] w-auto"
          />
        </div>
      )}

      {/* Actions */}
      <div className="flex flex-wrap items-center gap-2">
        {current && (
          <Button asChild className="rounded-full">
            <a href={current.url} download>
              <Download className="mr-2 h-4 w-4" strokeWidth={1.5} />
              Download {current.aspectRatio ?? "video"}
            </a>
          </Button>
        )}

        {/* Publish / Calendar — wired in Phase 4/5; disabled with a hint now. */}
        <TooltipProvider delayDuration={0}>
          <ComingSoon label="Publish Now" icon={Send} />
          <ComingSoon label="Add to Calendar" icon={CalendarPlus} />
        </TooltipProvider>

        {assetKitId && (
          <Button asChild variant="ghost" className="rounded-full">
            <Link href="/gallery">
              <ImageIcon className="mr-2 h-4 w-4" strokeWidth={1.5} />
              View in Gallery
            </Link>
          </Button>
        )}
      </div>
    </div>
  );
}

function ComingSoon({
  label,
  icon: Icon,
}: {
  label: string;
  icon: typeof Send;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        {/* span wrapper: a disabled button doesn't fire the tooltip's events */}
        <span tabIndex={0} className="inline-flex">
          <Button variant="outline" className="rounded-full" disabled>
            <Icon className="mr-2 h-4 w-4" strokeWidth={1.5} />
            {label}
          </Button>
        </span>
      </TooltipTrigger>
      <TooltipContent>Coming soon</TooltipContent>
    </Tooltip>
  );
}
