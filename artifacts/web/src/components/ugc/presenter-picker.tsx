"use client";

/**
 * DEV-33: Presenter picker (DESIGN §9.6 step 2). The agent has already
 * pre-selected the best-matching presenter; the user can change it. A compact
 * responsive grid of portrait tiles — the selected one is ring-highlighted.
 */
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { PRESENTERS } from "@/lib/presenters";

export function PresenterPicker({
  selectedId,
  onSelect,
  disabled,
}: {
  selectedId: string;
  onSelect: (id: string) => void;
  disabled?: boolean;
}) {
  return (
    <div>
      <h2 className="text-sm font-medium text-foreground">Presenter</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        We picked the best match for your audience. Tap another to change it.
      </p>
      <div className="mt-4 grid grid-cols-3 gap-3 sm:grid-cols-5">
        {PRESENTERS.map((presenter) => {
          const selected = presenter.id === selectedId;
          return (
            <button
              key={presenter.id}
              type="button"
              disabled={disabled}
              onClick={() => onSelect(presenter.id)}
              aria-pressed={selected}
              aria-label={`Choose ${presenter.name}`}
              className={cn(
                "group relative overflow-hidden rounded-xl border text-left transition focus:outline-none focus-visible:ring-2 focus-visible:ring-primary",
                selected
                  ? "border-primary ring-2 ring-primary"
                  : "border-border hover:border-primary/50",
                disabled && "cursor-not-allowed opacity-60",
              )}
            >
              <div className="relative aspect-[4/5] w-full bg-accent">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={presenter.imageUrl}
                  alt={presenter.name}
                  className="h-full w-full object-cover"
                />
                {selected && (
                  <span className="absolute right-1.5 top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-primary text-primary-foreground">
                    <Check className="h-3 w-3" strokeWidth={2.5} />
                  </span>
                )}
              </div>
              <div className="px-2 py-1.5">
                <p className="truncate text-xs font-medium text-foreground">
                  {presenter.name}
                </p>
                <p className="truncate text-[11px] text-muted-foreground">
                  {presenter.style}
                </p>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
