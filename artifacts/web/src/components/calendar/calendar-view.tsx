"use client";

/**
 * DEV-41 (STU-39): the Content Calendar (DESIGN §9.8).
 *
 * Owns all calendar state — view mode, the anchor date being viewed, the open
 * day, and the in-flight reschedule — and delegates rendering to the grids and
 * the day slide-over. Every date computation comes from the pure helpers in
 * `src/lib/calendar-view.ts`, which are unit-tested; this file is wiring.
 *
 * Reschedule is optimistic: dropping a chip immediately re-renders the entry on
 * its new day via an override map layered over the server props, then PATCHes
 * /api/calendar. On success `router.refresh()` re-runs the page query and the
 * override becomes a no-op; on failure the override is dropped and the entry
 * snaps back, so the UI never claims a write that didn't land.
 *
 * Icons are lucide (the project's established family — DESIGN §2 permits it
 * when already widely used; the whole dashboard uses lucide).
 */
import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  CalendarDays,
  CalendarPlus,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  addDays,
  buildMonthGrid,
  buildWeekGrid,
  FAMILY_META,
  formatMonthLabel,
  formatWeekLabel,
  shiftMonth,
  toDateKey,
  type CalendarDay,
  type CalendarEntryView,
  type CalendarViewMode,
} from "@/lib/calendar-view";
import {
  MonthGrid,
  WeekGrid,
  DayList,
  TypeDot,
  type GridHandlers,
} from "./calendar-grid";
import { DayPanel, type KitThumbnails } from "./day-panel";

export function CalendarView({
  entries: serverEntries,
  thumbnails = {},
}: {
  entries: CalendarEntryView[];
  thumbnails?: KitThumbnails;
}) {
  const router = useRouter();

  // Computed once per mount. Both SSR and hydration read the same UTC day, so
  // the "today" highlight matches without a hydration mismatch.
  const [today] = useState(() => new Date());
  const [anchor, setAnchor] = useState(() => new Date());
  const [mode, setMode] = useState<CalendarViewMode>("month");
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [dragOverKey, setDragOverKey] = useState<string | null>(null);

  // entryId → optimistic ISO date, layered over the server rows until the
  // refreshed props catch up (or the write fails and we drop the override).
  const [overrides, setOverrides] = useState<Record<string, string>>({});

  const entries = useMemo(
    () =>
      serverEntries.map((entry) =>
        overrides[entry.id] ? { ...entry, date: overrides[entry.id] } : entry,
      ),
    [serverEntries, overrides],
  );

  const weeks = useMemo(
    () => buildMonthGrid(anchor, entries, today),
    [anchor, entries, today],
  );
  const weekDays = useMemo(
    () => buildWeekGrid(anchor, entries, today),
    [anchor, entries, today],
  );

  const days = mode === "month" ? weeks.flat() : weekDays;
  const selectedDay = selectedKey
    ? (days.find((day) => day.key === selectedKey) ?? null)
    : null;

  async function rescheduleEntry(entryId: string, dayKey: string) {
    const entry = entries.find((e) => e.id === entryId);
    if (!entry) return;
    // Dropping an entry back on its own day is a no-op, not a write.
    if (toDateKey(new Date(entry.date)) === dayKey) return;

    const previous = overrides[entryId];
    setOverrides((prev) => ({ ...prev, [entryId]: `${dayKey}T00:00:00.000Z` }));
    setSavingId(entryId);

    try {
      const res = await fetch("/api/calendar", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ entryId, date: dayKey }),
      });
      const payload = (await res.json()) as { error: string | null };
      if (!res.ok) {
        throw new Error(payload.error ?? "Couldn't reschedule that item.");
      }
      toast.success(`Moved "${entry.title}"`);
      router.refresh();
    } catch (err) {
      // Roll the optimistic move back so the grid matches what's persisted.
      setOverrides((prev) => {
        const next = { ...prev };
        if (previous) next[entryId] = previous;
        else delete next[entryId];
        return next;
      });
      toast.error(
        err instanceof Error ? err.message : "Couldn't reschedule that item.",
      );
    } finally {
      setSavingId(null);
    }
  }

  const handlers: GridHandlers = {
    onSelectDay: (day: CalendarDay) => setSelectedKey(day.key),
    onDropEntry: rescheduleEntry,
    onDragStart: setDraggingId,
    onDragEnd: () => {
      setDraggingId(null);
      setDragOverKey(null);
    },
    draggingId,
    savingId,
  };

  function step(direction: 1 | -1) {
    setAnchor((current) =>
      mode === "month"
        ? shiftMonth(current, direction)
        : addDays(current, direction * 7),
    );
  }

  // A brand-new account has no plan yet — point at the one action that helps.
  if (serverEntries.length === 0) {
    return <EmptyState />;
  }

  return (
    <div className="mx-auto w-full max-w-7xl space-y-5">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => step(-1)}
            aria-label={mode === "month" ? "Previous month" : "Previous week"}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <h1 className="min-w-[13ch] text-center text-lg font-semibold tracking-tight sm:min-w-[18ch]">
            {mode === "month" ? formatMonthLabel(anchor) : formatWeekLabel(anchor)}
          </h1>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => step(1)}
            aria-label={mode === "month" ? "Next month" : "Next week"}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="ml-1"
            onClick={() => setAnchor(new Date())}
          >
            Today
          </Button>
        </div>

        <div className="flex items-center gap-2">
          <ModeToggle mode={mode} onChange={setMode} />
          <Button asChild size="sm">
            <Link href="/plan">
              <CalendarPlus className="h-4 w-4" />
              Plan this week
            </Link>
          </Button>
        </div>
      </header>

      <Legend />

      {/*
        Subtle enter fade on each view/period change (DESIGN MOTION_INTENSITY 5).
        Plain CSS via tailwindcss-animate rather than framer-motion: a fade this
        simple needs no JS animation runtime, and keeping it out of the bundle
        costs this page ~40 kB of first-load JS. framer-motion stays the right
        tool for genuinely interactive motion (drag, layout, gestures).
      */}
      <div
        key={`${mode}-${toDateKey(anchor)}`}
        className="animate-in fade-in duration-200"
      >
        {/* Desktop: the real grid, with drag-to-reschedule. */}
        <div className="hidden md:block">
          {mode === "month" ? (
            <MonthGrid
              weeks={weeks}
              handlers={handlers}
              dragOverKey={dragOverKey}
              setDragOverKey={setDragOverKey}
            />
          ) : (
            <WeekGrid
              days={weekDays}
              handlers={handlers}
              dragOverKey={dragOverKey}
              setDragOverKey={setDragOverKey}
            />
          )}
        </div>

        {/* Mobile (DESIGN §10): list by day — HTML5 drag doesn't fire on touch. */}
        <div className="md:hidden">
          <DayList days={days} onSelectDay={handlers.onSelectDay} />
        </div>
      </div>

      <p className="hidden text-xs text-muted-foreground md:block">
        Drag an item to another day to reschedule it.
      </p>

      <DayPanel
        day={selectedDay}
        thumbnails={thumbnails}
        onClose={() => setSelectedKey(null)}
      />
    </div>
  );
}

function ModeToggle({
  mode,
  onChange,
}: {
  mode: CalendarViewMode;
  onChange: (mode: CalendarViewMode) => void;
}) {
  return (
    <div
      role="group"
      aria-label="Calendar view"
      className="inline-flex rounded-md border p-0.5"
    >
      {(["month", "week"] as const).map((value) => (
        <button
          key={value}
          type="button"
          onClick={() => onChange(value)}
          aria-pressed={mode === value}
          className={cn(
            "rounded px-3 py-1 text-xs font-medium capitalize transition-colors",
            mode === value
              ? "bg-primary/10 text-primary"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          {value}
        </button>
      ))}
    </div>
  );
}

/** Colour key for the day-cell dots (DESIGN §9.8 — "Legend ... at top"). */
function Legend() {
  return (
    <div className="flex flex-wrap items-center gap-4">
      {(["photo", "graphic", "video"] as const).map((family) => (
        <span
          key={family}
          className="flex items-center gap-1.5 text-xs text-muted-foreground"
        >
          <TypeDot family={family} className="h-2 w-2" />
          {FAMILY_META[family].label}
        </span>
      ))}
    </div>
  );
}

function EmptyState() {
  return (
    <div className="mx-auto w-full max-w-2xl">
      <div className="rounded-lg border border-dashed bg-card/50 px-6 py-16 text-center">
        <CalendarDays
          className="mx-auto h-8 w-8 text-muted-foreground"
          strokeWidth={1.5}
        />
        <h1 className="mt-4 text-lg font-semibold tracking-tight">
          No content planned yet
        </h1>
        <p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">
          Approve a content plan and every item lands here on the day it&apos;s
          scheduled.
        </p>
        <Button asChild className="mt-6">
          <Link href="/plan">
            <CalendarPlus className="h-4 w-4" />
            Create your first content plan
          </Link>
        </Button>
      </div>
    </div>
  );
}
