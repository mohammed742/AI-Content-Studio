"use client";

/**
 * DEV-41 (STU-39): Day slide-over (DESIGN §9.8 — "Click day → slide-over panel
 * with scheduled items").
 *
 * Each item shows its thumbnail when the Asset Kit exists, otherwise a neutral
 * type tile, plus the content type, platform, time, and a status badge. Purely
 * presentational — the parent owns which day is open.
 *
 * DESIGN also calls for the plan's content description on not-yet-generated
 * items; `calendar_entries` denormalizes title/platform/type but not
 * description (DEV-40), so that would need a join back to the source Content
 * Plan. Deferred rather than silently dropped — noted on DEV-41.
 */
import { CalendarDays, Film, ImageIcon } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import {
  contentTypeMeta,
  entryStatusMeta,
  type CalendarDay,
  type CalendarEntryView,
  type EntryStatusTone,
} from "@/lib/calendar-view";
import { TypeDot } from "./calendar-grid";

/** Asset Kit media, keyed by kit id, for entries that have generated. */
export type KitThumbnails = Record<
  string,
  { url: string; mediaType: "image" | "video" }
>;

const PLATFORM_LABEL: Record<string, string> = {
  youtube: "YouTube",
  tiktok: "TikTok",
  instagram: "Instagram",
  linkedin: "LinkedIn",
  facebook: "Facebook",
  x: "X",
};

const DAY_TITLE = new Intl.DateTimeFormat("en-US", {
  weekday: "long",
  month: "long",
  day: "numeric",
  year: "numeric",
  timeZone: "UTC",
});

const TONE_CLASS: Record<EntryStatusTone, string> = {
  success: "text-emerald-600 dark:text-emerald-400",
  danger: "text-destructive",
  active: "text-blue-600 dark:text-blue-400",
  pending: "text-muted-foreground",
};

export function DayPanel({
  day,
  thumbnails,
  onClose,
}: {
  day: CalendarDay | null;
  thumbnails: KitThumbnails;
  onClose: () => void;
}) {
  return (
    <Sheet open={day !== null} onOpenChange={(open) => !open && onClose()}>
      <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-md">
        {day && (
          <>
            <SheetHeader>
              <SheetTitle>{DAY_TITLE.format(day.date)}</SheetTitle>
              <SheetDescription>
                {day.entries.length === 0
                  ? "Nothing scheduled on this day."
                  : `${day.entries.length} item${day.entries.length === 1 ? "" : "s"} scheduled.`}
              </SheetDescription>
            </SheetHeader>

            {day.entries.length === 0 ? (
              <div className="mt-6 rounded-lg border border-dashed bg-card/50 px-4 py-10 text-center">
                <CalendarDays className="mx-auto h-6 w-6 text-muted-foreground" />
                <p className="mt-2 text-sm font-medium">No content here yet</p>
                <p className="text-xs text-muted-foreground">
                  Drag an item onto this day, or plan a new week.
                </p>
              </div>
            ) : (
              <ul className="mt-6 space-y-3">
                {day.entries.map((entry) => (
                  <EntryRow
                    key={entry.id}
                    entry={entry}
                    thumbnail={
                      entry.assetKitId ? thumbnails[entry.assetKitId] : undefined
                    }
                  />
                ))}
              </ul>
            )}
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}

function EntryRow({
  entry,
  thumbnail,
}: {
  entry: CalendarEntryView;
  thumbnail?: { url: string; mediaType: "image" | "video" };
}) {
  const type = contentTypeMeta(entry.contentType);
  const status = entryStatusMeta(entry.status);

  return (
    <li className="flex gap-3 rounded-lg border bg-card p-3">
      <Thumbnail thumbnail={thumbnail} family={type.family} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{entry.title}</p>
        <p className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
          <TypeDot family={type.family} />
          {type.label}
          <span aria-hidden>·</span>
          {PLATFORM_LABEL[entry.platform] ?? entry.platform}
        </p>
        <p className="mt-1.5 flex items-center gap-2 text-xs">
          <span className="tabular-nums text-muted-foreground">
            {entry.time}
          </span>
          <span className={cn("font-medium", TONE_CLASS[status.tone])}>
            {status.label}
          </span>
        </p>
      </div>
    </li>
  );
}

/**
 * The Asset Kit's media when the item has generated, else a neutral tile keyed
 * to the content family. Video kits paint their first frame via
 * `preload="metadata"`; a broken or expired URL falls back to the icon tile
 * rather than leaving a blank box (same approach as the publish history).
 */
function Thumbnail({
  thumbnail,
  family,
}: {
  thumbnail?: { url: string; mediaType: "image" | "video" };
  family: string;
}) {
  return (
    <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-md border bg-muted">
      {thumbnail?.mediaType === "video" ? (
        <video
          src={thumbnail.url}
          muted
          playsInline
          preload="metadata"
          className="h-full w-full object-cover"
        />
      ) : thumbnail ? (
        /* eslint-disable-next-line @next/next/no-img-element */
        <img
          src={thumbnail.url}
          alt=""
          className="h-full w-full object-cover"
        />
      ) : family === "video" ? (
        <Film className="h-5 w-5 text-muted-foreground" />
      ) : (
        <ImageIcon className="h-5 w-5 text-muted-foreground" />
      )}
    </div>
  );
}
