"use client";

/**
 * DEV-24: One Content Plan Item card (DESIGN.md §9.5).
 *
 * Review mode (draft plan): type icon, title, platform badge, scheduled day,
 * editable description, remove. Progress mode (generating/completed plan):
 * per-item status — waiting (dimmed), generating (shimmer), completed
 * (thumbnail + View), failed (error + Retry).
 *
 * Icons are lucide (the project's established family — DESIGN §2 permits it
 * when already widely used; the whole dashboard uses lucide).
 */
import { useState } from "react";
import {
  Camera,
  Image as ImageIcon,
  Video,
  Lightbulb,
  Megaphone,
  MessageSquareQuote,
  CalendarHeart,
  Users,
  Pencil,
  Trash2,
  Check,
  RotateCcw,
} from "lucide-react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { friendlyPlanItemError } from "@/lib/plan-errors";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import type { ContentPlanItemRecord } from "@/db/schema";

const TYPE_META: Record<
  ContentPlanItemRecord["type"],
  { icon: typeof Camera; label: string }
> = {
  product_showcase: { icon: Camera, label: "Product photo" },
  tip: { icon: Lightbulb, label: "Tip" },
  behind_the_scenes: { icon: ImageIcon, label: "Behind the scenes" },
  promo: { icon: Megaphone, label: "Promotion" },
  testimonial: { icon: MessageSquareQuote, label: "Testimonial" },
  ugc_ad: { icon: Video, label: "UGC-style ad" },
  seasonal: { icon: CalendarHeart, label: "Seasonal" },
  engagement: { icon: Users, label: "Engagement" },
};

function dayLabel(day: string): string {
  return day.charAt(0).toUpperCase() + day.slice(1);
}

export function PlanItemCard({
  item,
  mode,
  onUpdateDescription,
  onRemove,
  onRetry,
}: {
  item: ContentPlanItemRecord;
  mode: "review" | "progress";
  onUpdateDescription?: (id: string, description: string) => void;
  onRemove?: (id: string) => void;
  onRetry?: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(item.description);
  const meta = TYPE_META[item.type] ?? TYPE_META.engagement;
  const Icon = meta.icon;

  const dimmed = mode === "progress" && item.status === "pending";

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: dimmed ? 0.5 : 1, y: 0 }}
      className={cn(
        "rounded-xl border border-border bg-card p-4",
        mode === "review" && "transition-transform hover:-translate-y-[2px]",
      )}
    >
      <div className="flex items-start gap-4">
        {/* Type icon / thumbnail */}
        {mode === "progress" && item.status === "completed" && item.mediaUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={item.mediaUrl}
            alt={item.title}
            className="h-14 w-14 shrink-0 rounded-lg object-cover"
          />
        ) : (
          <div
            className={cn(
              "flex h-14 w-14 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary",
              mode === "progress" &&
                item.status === "generating" &&
                "animate-pulse",
            )}
          >
            <Icon className="h-6 w-6" strokeWidth={1.5} />
          </div>
        )}

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-base font-medium">{item.title}</p>
            <span className="rounded-full bg-accent px-2 py-0.5 text-xs capitalize text-muted-foreground">
              {item.platform}
            </span>
            <span className="text-xs text-zinc-500">{dayLabel(item.scheduledDay)}</span>
          </div>

          {mode === "review" && editing ? (
            <div className="mt-2 space-y-2">
              <Textarea
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                rows={2}
                className="text-sm"
              />
              <div className="flex gap-2">
                <Button
                  size="sm"
                  onClick={() => {
                    onUpdateDescription?.(item.id, draft.trim() || item.description);
                    setEditing(false);
                  }}
                >
                  <Check className="mr-1 h-4 w-4" strokeWidth={1.5} /> Save
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    setDraft(item.description);
                    setEditing(false);
                  }}
                >
                  Cancel
                </Button>
              </div>
            </div>
          ) : (
            <p className="mt-1 max-w-[65ch] text-sm leading-relaxed text-muted-foreground">
              {item.description}
            </p>
          )}

          {/* Progress state line */}
          {mode === "progress" && (
            <div className="mt-2 text-xs">
              {item.status === "pending" && (
                <span className="text-zinc-500">Waiting…</span>
              )}
              {item.status === "generating" && (
                <span className="text-primary">
                  Creating your {meta.label.toLowerCase()}…
                </span>
              )}
              {item.status === "completed" && (
                <span className="inline-flex items-center gap-2 text-green-500">
                  <Check className="h-3.5 w-3.5" strokeWidth={2} /> Done
                  {item.mediaUrl && (
                    <a
                      href={item.mediaUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="text-primary hover:underline"
                    >
                      View
                    </a>
                  )}
                </span>
              )}
              {item.status === "failed" && (
                <span className="inline-flex flex-wrap items-center gap-x-2 gap-y-1">
                  <span className="rounded-full bg-red-500/10 px-2 py-0.5 text-red-500">
                    Failed
                  </span>
                  {onRetry && (
                    <button
                      onClick={onRetry}
                      className="inline-flex items-center gap-1 text-primary hover:underline"
                    >
                      <RotateCcw className="h-3.5 w-3.5" strokeWidth={1.5} /> Retry
                    </button>
                  )}
                  {/*
                    Why it failed, in plain English. The stored error is raw
                    provider output (status codes, model names, the whole
                    generated prompt), so it is translated rather than shown —
                    see plan-errors.ts. The raw text stays in the DB and logs.
                  */}
                  <span className="w-full text-muted-foreground">
                    {friendlyPlanItemError(item.error)}
                  </span>
                </span>
              )}
            </div>
          )}
        </div>

        {/* Review actions */}
        {mode === "review" && !editing && (
          <div className="flex shrink-0 gap-1">
            <Button
              variant="ghost"
              size="icon"
              aria-label="Edit description"
              onClick={() => setEditing(true)}
            >
              <Pencil className="h-4 w-4" strokeWidth={1.5} />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              aria-label="Remove item"
              className="text-muted-foreground hover:text-red-500"
              onClick={() => onRemove?.(item.id)}
            >
              <Trash2 className="h-4 w-4" strokeWidth={1.5} />
            </Button>
          </div>
        )}
      </div>
    </motion.div>
  );
}
