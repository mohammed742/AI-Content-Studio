"use client";

/**
 * STU-C7 (DEV-64): Presenter Library view — a multi-select audience-tag filter
 * over a responsive grid (3/2/1) of presenter cards. Data is static (passed in
 * from the server page), so filtering is pure client state — no fetch.
 *
 * Filter semantics mirror `filterPresentersByTags`: no tags selected = show
 * everyone; otherwise show presenters matching ANY selected tag (union).
 */
import { useMemo, useState } from "react";
import { UserSquare } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  filterPresentersByTags,
  audienceTagCounts,
  type AudienceTag,
  type Presenter,
} from "@/lib/presenters";
import { PresenterCard } from "./presenter-card";

export function PresenterLibrary({
  presenters,
  tags,
}: {
  presenters: readonly Presenter[];
  tags: ReadonlyArray<{ value: AudienceTag; label: string }>;
}) {
  const [selected, setSelected] = useState<AudienceTag[]>([]);

  const counts = useMemo(() => audienceTagCounts(presenters), [presenters]);
  const visible = useMemo(
    () => filterPresentersByTags(presenters, selected),
    [presenters, selected],
  );

  const toggleTag = (tag: AudienceTag) => {
    setSelected((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag],
    );
  };

  return (
    <div className="space-y-6 py-8">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">Presenters</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          The agent picks the best-matching presenter for your audience when it
          creates UGC-style video ads. Filter by audience to see who fits.
        </p>
      </div>

      {/* Audience-tag filter pills */}
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => setSelected([])}
          className={cn(
            "rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
            selected.length === 0
              ? "border-primary bg-primary/10 text-primary"
              : "border-border text-muted-foreground hover:text-foreground",
          )}
        >
          All audiences
        </button>
        {tags.map((tag) => {
          const active = selected.includes(tag.value);
          return (
            <button
              key={tag.value}
              type="button"
              aria-pressed={active}
              onClick={() => toggleTag(tag.value)}
              className={cn(
                "rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
                active
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-border text-muted-foreground hover:text-foreground",
              )}
            >
              {tag.label}
              <span className="ml-1.5 opacity-60">{counts[tag.value] ?? 0}</span>
            </button>
          );
        })}
      </div>

      {/* Result count */}
      <p className="text-xs text-muted-foreground" aria-live="polite">
        {visible.length} {visible.length === 1 ? "presenter" : "presenters"}
        {selected.length > 0 ? " match your filter" : " available"}
      </p>

      {/* Grid / empty state */}
      {visible.length === 0 ? (
        <div className="flex min-h-[40vh] flex-col items-center justify-center rounded-xl border border-dashed border-border text-center">
          <UserSquare className="h-10 w-10 text-muted-foreground" strokeWidth={1.5} />
          <p className="mt-3 text-sm text-muted-foreground">
            No presenters match those audiences. Try removing a filter.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {visible.map((presenter) => (
            <PresenterCard key={presenter.id} presenter={presenter} />
          ))}
        </div>
      )}
    </div>
  );
}
