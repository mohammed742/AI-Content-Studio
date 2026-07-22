"use client";

/**
 * DEV-26: Gallery lightbox (DESIGN §9.7) — expanded Asset Kit: full media,
 * editable caption, hashtag pills, prominent "Did this match your brand?"
 * thumbs, Download + Delete. Publish/Regenerate are deferred (Phase 4 /
 * follow-up).
 */
import { useEffect, useState } from "react";
import {
  ThumbsUp,
  ThumbsDown,
  Download,
  Trash2,
  Check,
  Pencil,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import type { GalleryItem } from "@/lib/gallery";
import type { FeedbackRating } from "@/db/schema";

export function GalleryLightbox({
  item,
  onClose,
  onRate,
  onCaptionSaved,
  onDeleted,
}: {
  item: GalleryItem | null;
  onClose: () => void;
  onRate: (item: GalleryItem, rating: FeedbackRating) => void;
  onCaptionSaved: (id: string, caption: string) => void;
  onDeleted: (id: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [caption, setCaption] = useState("");
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [frame, setFrame] = useState(0);

  useEffect(() => {
    if (item) {
      setCaption(item.caption);
      setEditing(false);
      setFrame(0);
    }
  }, [item]);

  if (!item) return null;

  // A carousel carries an ordered `media` array; a single-image kit falls back
  // to its cover. The viewer steps through frames in payload order.
  const frames =
    item.media && item.media.length > 0
      ? item.media
      : [{ url: item.mediaUrl, mediaType: item.mediaType }];
  const isCarousel = frames.length > 1;
  const current = frames[Math.min(frame, frames.length - 1)];

  const saveCaption = async () => {
    const trimmed = caption.trim();
    if (!trimmed || trimmed === item.caption) {
      setEditing(false);
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(`/api/gallery/${item.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ caption: trimmed }),
      });
      const json = await res.json();
      if (json.data) {
        onCaptionSaved(item.id, trimmed);
        setEditing(false);
        toast.success("Caption updated");
      } else {
        toast.error("Couldn't update the caption");
      }
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    setDeleting(true);
    try {
      const res = await fetch(`/api/gallery/${item.id}`, { method: "DELETE" });
      const json = await res.json();
      if (json.data) {
        onDeleted(item.id);
        onClose();
        toast.success("Deleted");
      } else {
        toast.error("Couldn't delete this item");
      }
    } finally {
      setDeleting(false);
    }
  };

  return (
    <Dialog open={!!item} onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogTitle>{item.title}</DialogTitle>
        <DialogDescription className="sr-only">
          Generated content detail and actions
        </DialogDescription>

        <div className="grid gap-5 md:grid-cols-[1fr_1fr]">
          {/* Media */}
          <div className="relative overflow-hidden rounded-lg border border-border bg-accent">
            {current.mediaType === "video" ? (
              <video src={current.url} controls className="h-full w-full" />
            ) : (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={current.url}
                alt={isCarousel ? `${item.title} — slide ${frame + 1}` : item.title}
                className="h-full w-full object-cover"
              />
            )}

            {isCarousel && (
              <>
                <button
                  type="button"
                  aria-label="Previous slide"
                  onClick={() =>
                    setFrame((f) => (f - 1 + frames.length) % frames.length)
                  }
                  className="absolute left-2 top-1/2 -translate-y-1/2 rounded-full bg-black/55 p-1.5 text-white transition hover:bg-black/75"
                >
                  <ChevronLeft className="h-5 w-5" strokeWidth={1.5} />
                </button>
                <button
                  type="button"
                  aria-label="Next slide"
                  onClick={() => setFrame((f) => (f + 1) % frames.length)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full bg-black/55 p-1.5 text-white transition hover:bg-black/75"
                >
                  <ChevronRight className="h-5 w-5" strokeWidth={1.5} />
                </button>
                {/* Position indicator + dots — order runs left to right. */}
                <div className="absolute inset-x-0 bottom-2 flex flex-col items-center gap-1.5">
                  <div className="flex gap-1.5">
                    {frames.map((f, i) => (
                      <button
                        key={f.url}
                        type="button"
                        aria-label={`Go to slide ${i + 1}`}
                        aria-current={i === frame}
                        onClick={() => setFrame(i)}
                        className={cn(
                          "h-1.5 rounded-full transition-all",
                          i === frame ? "w-4 bg-white" : "w-1.5 bg-white/50",
                        )}
                      />
                    ))}
                  </div>
                  <span className="rounded-full bg-black/55 px-2 py-0.5 text-xs text-white">
                    {frame + 1} / {frames.length}
                  </span>
                </div>
              </>
            )}
          </div>

          {/* Details */}
          <div className="flex flex-col gap-4">
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <span className="rounded-full bg-accent px-2 py-0.5 capitalize text-muted-foreground">
                {item.platform}
              </span>
              <span className="text-zinc-500">
                {new Date(item.createdAt).toLocaleDateString(undefined, {
                  year: "numeric",
                  month: "long",
                  day: "numeric",
                })}
              </span>
            </div>

            {/* Editable caption */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="text-xs font-medium text-muted-foreground">Caption</label>
                {!editing && (
                  <button
                    onClick={() => setEditing(true)}
                    className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                  >
                    <Pencil className="h-3 w-3" strokeWidth={1.5} /> Edit
                  </button>
                )}
              </div>
              {editing ? (
                <div className="space-y-2">
                  <Textarea
                    value={caption}
                    onChange={(e) => setCaption(e.target.value)}
                    rows={4}
                    className="text-sm"
                  />
                  <div className="flex gap-2">
                    <Button size="sm" onClick={saveCaption} disabled={saving}>
                      <Check className="mr-1 h-4 w-4" strokeWidth={1.5} /> Save
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        setCaption(item.caption);
                        setEditing(false);
                      }}
                    >
                      Cancel
                    </Button>
                  </div>
                </div>
              ) : (
                <p className="max-w-[65ch] text-sm leading-relaxed">{item.caption}</p>
              )}
            </div>

            {/* Hashtags */}
            {item.hashtags.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {item.hashtags.map((tag) => (
                  <span
                    key={tag}
                    className="rounded-full bg-primary/10 px-2 py-0.5 text-xs text-primary"
                  >
                    #{tag}
                  </span>
                ))}
              </div>
            )}

            {/* Feedback */}
            <div className="rounded-lg border border-border p-3">
              <p className="text-sm font-medium">Did this match your brand?</p>
              <div className="mt-2 flex gap-2">
                <Button
                  variant={item.rating === "up" ? "default" : "outline"}
                  size="sm"
                  className={cn(
                    "rounded-lg",
                    item.rating === "up" && "bg-green-500 hover:bg-green-500/90",
                  )}
                  onClick={() => onRate(item, "up")}
                >
                  <ThumbsUp className="mr-1.5 h-4 w-4" strokeWidth={1.5} /> Yes
                </Button>
                <Button
                  variant={item.rating === "down" ? "default" : "outline"}
                  size="sm"
                  className={cn(
                    "rounded-lg",
                    item.rating === "down" && "bg-red-500 hover:bg-red-500/90",
                  )}
                  onClick={() => onRate(item, "down")}
                >
                  <ThumbsDown className="mr-1.5 h-4 w-4" strokeWidth={1.5} /> Not quite
                </Button>
              </div>
            </div>

            {/* Actions */}
            <div className="mt-auto flex flex-wrap gap-2">
              <Button variant="outline" size="sm" className="rounded-lg" asChild>
                <a href={current.url} download target="_blank" rel="noreferrer">
                  <Download className="mr-1.5 h-4 w-4" strokeWidth={1.5} />
                  {isCarousel ? `Download slide ${frame + 1}` : "Download"}
                </a>
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="rounded-lg text-muted-foreground hover:text-red-500"
                onClick={remove}
                disabled={deleting}
              >
                <Trash2 className="mr-1.5 h-4 w-4" strokeWidth={1.5} /> Delete
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
