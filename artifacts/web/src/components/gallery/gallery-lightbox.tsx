"use client";

/**
 * DEV-26: Gallery lightbox (DESIGN §9.7) — expanded Asset Kit: full media,
 * editable caption, hashtag pills, prominent "Did this match your brand?"
 * thumbs, Download + Delete. Publish/Regenerate are deferred (Phase 4 /
 * follow-up).
 */
import { useEffect, useState } from "react";
import { ThumbsUp, ThumbsDown, Download, Trash2, Check, Pencil } from "lucide-react";
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

  useEffect(() => {
    if (item) {
      setCaption(item.caption);
      setEditing(false);
    }
  }, [item]);

  if (!item) return null;

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
          <div className="overflow-hidden rounded-lg border border-border bg-accent">
            {item.mediaType === "video" ? (
              <video src={item.mediaUrl} controls className="h-full w-full" />
            ) : (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={item.mediaUrl} alt={item.title} className="h-full w-full object-cover" />
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
                <a href={item.mediaUrl} download target="_blank" rel="noreferrer">
                  <Download className="mr-1.5 h-4 w-4" strokeWidth={1.5} /> Download
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
