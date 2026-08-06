"use client";

/**
 * DEV-41 (STU-39): Content Calendar grids (DESIGN §9.8).
 *
 * Three presentations of the same day cells built by `buildMonthGrid` /
 * `buildWeekGrid`: a month grid, a taller week grid, and a mobile day list
 * (DESIGN §10 — "Calendar → List view by day" under 768px). All three are
 * purely presentational: they render `CalendarDay[]` and raise events. The
 * parent <CalendarView> owns state and persistence.
 *
 * Drag-and-drop is native HTML5 (no `@dnd-kit`, per the zero-dependency
 * decision on DEV-41): entry chips are `draggable` and carry the entry id in
 * `dataTransfer`; day cells accept the drop and report the target day key.
 * HTML5 drag events don't fire on touch, so reschedule is a desktop
 * affordance — mobile gets the list view, which is read + open only.
 *
 * Icons are lucide (the project's established family — DESIGN §2 permits it
 * when already widely used; the whole dashboard uses lucide).
 */
import { CalendarDays } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  contentTypeMeta,
  WEEKDAY_HEADERS,
  type CalendarDay,
  type CalendarEntryView,
  type ContentFamily,
} from "@/lib/calendar-view";

/**
 * Dot colours for the three content families (DESIGN §9.8: emerald = photo,
 * blue = graphic, purple = video).
 *
 * These live here rather than beside `contentTypeMeta` in `src/lib` because
 * `tailwind.config.ts` only scans `src/app`, `src/components` and `src/pages` —
 * a class string written in `src/lib` never reaches the generated CSS, so the
 * dots render colourless. Keeping the classes in the component layer keeps
 * `src/lib/calendar-view.ts` purely semantic.
 */
const FAMILY_DOT_CLASS: Record<ContentFamily, string> = {
  photo: "bg-emerald-500",
  graphic: "bg-blue-500",
  video: "bg-purple-500",
};

/** The colour-coded dot for a content family. Shared by the grids and panel. */
export function TypeDot({
  family,
  className,
}: {
  family: ContentFamily;
  className?: string;
}) {
  return (
    <span
      aria-hidden
      className={cn(
        "shrink-0 rounded-full",
        FAMILY_DOT_CLASS[family],
        className ?? "h-1.5 w-1.5",
      )}
    />
  );
}

/** Events every grid raises. */
export interface GridHandlers {
  onSelectDay: (day: CalendarDay) => void;
  /** A chip was dropped on a day — (entryId, `YYYY-MM-DD`). */
  onDropEntry: (entryId: string, dayKey: string) => void;
  onDragStart: (entryId: string) => void;
  onDragEnd: () => void;
  /** The entry currently being dragged, for the lifted-chip styling. */
  draggingId: string | null;
  /** The entry currently being written, for the pending styling. */
  savingId: string | null;
}

const WEEKDAY_FULL = new Intl.DateTimeFormat("en-US", {
  weekday: "long",
  month: "long",
  day: "numeric",
  timeZone: "UTC",
});

// ------------------------------------------------------------------- chips

/**
 * One draggable entry. A `<div>` rather than a `<button>`: nesting an
 * interactive element inside the clickable day cell would be invalid HTML, so
 * the chip forwards its click to the cell's day handler and stops propagation
 * only to avoid a double-open.
 */
function EntryChip({
  entry,
  handlers,
  detailed,
}: {
  entry: CalendarEntryView;
  handlers: GridHandlers;
  detailed?: boolean;
}) {
  const meta = contentTypeMeta(entry.contentType);
  const dragging = handlers.draggingId === entry.id;
  const saving = handlers.savingId === entry.id;

  return (
    <div
      draggable={!saving}
      onDragStart={(event) => {
        event.dataTransfer.setData("text/plain", entry.id);
        event.dataTransfer.effectAllowed = "move";
        handlers.onDragStart(entry.id);
      }}
      onDragEnd={handlers.onDragEnd}
      title={`${meta.label} · ${entry.title}`}
      className={cn(
        "flex items-center gap-1.5 rounded px-1.5 py-1 text-left text-xs transition-colors",
        "cursor-grab active:cursor-grabbing hover:bg-accent",
        dragging && "opacity-40",
        saving && "cursor-wait opacity-60",
      )}
    >
      <TypeDot family={meta.family} />
      <span className="min-w-0 flex-1 truncate">
        {detailed && (
          <span className="mr-1 font-medium tabular-nums text-muted-foreground">
            {entry.time}
          </span>
        )}
        {entry.title}
      </span>
    </div>
  );
}

// -------------------------------------------------------------- day cell

function DayCell({
  day,
  handlers,
  dragOverKey,
  setDragOverKey,
  className,
  maxChips,
  detailed,
}: {
  day: CalendarDay;
  handlers: GridHandlers;
  dragOverKey: string | null;
  setDragOverKey: (key: string | null) => void;
  className?: string;
  /** Chips to render before collapsing the rest into a "+N more". */
  maxChips: number;
  detailed?: boolean;
}) {
  const overflow = day.entries.length - maxChips;
  const isOver = dragOverKey === day.key;

  return (
    <div
      onDragOver={(event) => {
        // Preventing default is what marks this a valid drop target.
        event.preventDefault();
        event.dataTransfer.dropEffect = "move";
        setDragOverKey(day.key);
      }}
      onDragLeave={() => setDragOverKey(null)}
      onDrop={(event) => {
        event.preventDefault();
        const entryId = event.dataTransfer.getData("text/plain");
        // Clear the drag state here rather than relying on `dragend`: a
        // successful drop re-renders the chip into a different day cell, so
        // `dragend` can never fire on the original node and the chip would
        // stay stranded at the dragging opacity.
        handlers.onDragEnd();
        if (entryId) {
          handlers.onDropEntry(entryId, day.key);
        }
      }}
      className={cn(
        "flex flex-col gap-1 border-b border-r border-border p-1.5 transition-colors",
        !day.inCurrentMonth && "bg-muted/30",
        isOver && "bg-primary/10 ring-1 ring-inset ring-primary",
        className,
      )}
    >
      <button
        type="button"
        onClick={() => handlers.onSelectDay(day)}
        aria-label={`${WEEKDAY_FULL.format(day.date)}, ${day.entries.length} scheduled`}
        className={cn(
          "flex h-6 w-6 shrink-0 items-center justify-center self-start rounded-full text-xs transition-colors",
          "hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          day.isToday && "bg-primary font-semibold text-primary-foreground hover:bg-primary/90",
          !day.inCurrentMonth && "text-muted-foreground",
        )}
      >
        {day.dayOfMonth}
      </button>

      <div className="min-h-0 flex-1 space-y-0.5 overflow-hidden">
        {day.entries.slice(0, maxChips).map((entry) => (
          <EntryChip
            key={entry.id}
            entry={entry}
            handlers={handlers}
            detailed={detailed}
          />
        ))}
        {overflow > 0 && (
          <button
            type="button"
            onClick={() => handlers.onSelectDay(day)}
            className="w-full rounded px-1.5 text-left text-[11px] text-muted-foreground hover:text-foreground"
          >
            +{overflow} more
          </button>
        )}
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ grids

function WeekdayHeader() {
  return (
    <div className="grid grid-cols-7 border-b border-border bg-muted/40 [&>div:last-child]:border-r-0">
      {WEEKDAY_HEADERS.map((label) => (
        <div
          key={label}
          className="border-r border-border px-2 py-1.5 text-center text-xs font-medium text-muted-foreground"
        >
          <span className="hidden sm:inline">{label}</span>
          <span className="sm:hidden">{label.charAt(0)}</span>
        </div>
      ))}
    </div>
  );
}

export function MonthGrid({
  weeks,
  handlers,
  dragOverKey,
  setDragOverKey,
}: {
  weeks: CalendarDay[][];
  handlers: GridHandlers;
  dragOverKey: string | null;
  setDragOverKey: (key: string | null) => void;
}) {
  return (
    <div className="overflow-hidden rounded-lg border border-border">
      <WeekdayHeader />
      <div>
        {weeks.map((week) => (
          <div
            key={week[0].key}
            // The wrapper draws the outer edge, so the row's last cell drops
            // its right border rather than doubling up against it.
            className="grid grid-cols-7 [&>div:last-child]:border-r-0"
          >
            {week.map((day) => (
              <DayCell
                key={day.key}
                day={day}
                handlers={handlers}
                dragOverKey={dragOverKey}
                setDragOverKey={setDragOverKey}
                maxChips={3}
                className="min-h-[104px]"
              />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

export function WeekGrid({
  days,
  handlers,
  dragOverKey,
  setDragOverKey,
}: {
  days: CalendarDay[];
  handlers: GridHandlers;
  dragOverKey: string | null;
  setDragOverKey: (key: string | null) => void;
}) {
  return (
    <div className="overflow-hidden rounded-lg border border-border">
      <WeekdayHeader />
      <div className="grid grid-cols-7 [&>div:last-child]:border-r-0">
        {days.map((day) => (
          <DayCell
            key={day.key}
            day={day}
            handlers={handlers}
            dragOverKey={dragOverKey}
            setDragOverKey={setDragOverKey}
            maxChips={12}
            detailed
            className="min-h-[320px]"
          />
        ))}
      </div>
    </div>
  );
}

/**
 * Mobile presentation (DESIGN §10): the same days as a scrollable list grouped
 * by day, empty days omitted. Read + open only — no drag on touch.
 */
export function DayList({
  days,
  onSelectDay,
}: {
  days: CalendarDay[];
  onSelectDay: (day: CalendarDay) => void;
}) {
  const scheduled = days.filter((day) => day.entries.length > 0);

  if (scheduled.length === 0) {
    return (
      <div className="rounded-lg border border-dashed bg-card/50 px-4 py-10 text-center">
        <CalendarDays className="mx-auto h-6 w-6 text-muted-foreground" />
        <p className="mt-2 text-sm font-medium">Nothing scheduled</p>
        <p className="text-xs text-muted-foreground">
          Try another month, or plan this week below.
        </p>
      </div>
    );
  }

  return (
    <ul className="space-y-3">
      {scheduled.map((day) => (
        <li key={day.key} className="overflow-hidden rounded-lg border bg-card">
          <button
            type="button"
            onClick={() => onSelectDay(day)}
            className="flex w-full items-center justify-between gap-2 border-b bg-muted/30 px-3 py-2 text-left"
          >
            <span
              className={cn(
                "text-sm font-medium",
                day.isToday && "text-primary",
              )}
            >
              {WEEKDAY_FULL.format(day.date)}
              {day.isToday && " · Today"}
            </span>
            <span className="text-xs text-muted-foreground">
              {day.entries.length}
            </span>
          </button>
          <div className="divide-y">
            {day.entries.map((entry) => {
              const meta = contentTypeMeta(entry.contentType);
              return (
                <div
                  key={entry.id}
                  className="flex items-center gap-2 px-3 py-2 text-sm"
                >
                  <TypeDot family={meta.family} className="h-2 w-2" />
                  <span className="min-w-0 flex-1 truncate">{entry.title}</span>
                  <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                    {entry.time}
                  </span>
                </div>
              );
            })}
          </div>
        </li>
      ))}
    </ul>
  );
}
