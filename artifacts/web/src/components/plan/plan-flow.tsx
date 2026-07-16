"use client";

/**
 * DEV-24: Content Plan flow orchestrator (DESIGN.md §9.5).
 *
 * State 1 — no plan: hero + "Create My Content Plan" with staged loading copy.
 * State 2 — draft: review cards (edit/remove/add) + sticky approve footer.
 * State 3 — generating/completed: per-item progress, top progress bar,
 *           failed items get Retry, completion banner.
 *
 * The flow polls GET /api/plan while a plan is generating; per-item statuses
 * are written by the Generation Queue as items finish. Users see credits and
 * plain-English progress only — no model names, no dollar costs.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { Sparkles, Plus, ArrowRight } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { PlanItemCard } from "./plan-item-card";
import type { ContentPlanItemRecord, ContentPlanRow } from "@/db/schema";

const CREATE_STAGES = [
  "Analyzing your business…",
  "Planning content types…",
  "Selecting best formats…",
  "Building your plan…",
];

type Plan = ContentPlanRow;

async function api<T>(
  url: string,
  init?: RequestInit,
): Promise<{ data: T | null; error: unknown }> {
  const res = await fetch(url, init);
  return res.json();
}

export function PlanFlow() {
  const [plan, setPlan] = useState<Plan | null | undefined>(undefined);
  const [creating, setCreating] = useState(false);
  const [stage, setStage] = useState(0);
  const [approving, setApproving] = useState(false);
  const [newItemText, setNewItemText] = useState("");
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const load = useCallback(async () => {
    const { data } = await api<Plan>("/api/plan");
    setPlan(data ?? null);
    return data ?? null;
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // Poll while generating so per-item statuses stream in.
  useEffect(() => {
    const shouldPoll = plan?.status === "generating" || approving;
    if (shouldPoll && !pollRef.current) {
      pollRef.current = setInterval(() => void load(), 2500);
    }
    if (!shouldPoll && pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
    return () => {
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
    };
  }, [plan?.status, approving, load]);

  const createPlan = async () => {
    setCreating(true);
    setStage(0);
    const ticker = setInterval(
      () => setStage((s) => Math.min(s + 1, CREATE_STAGES.length - 1)),
      2200,
    );
    try {
      const { data, error } = await api<Plan>("/api/plan", { method: "POST" });
      if (!data) {
        toast.error(typeof error === "string" ? error : "Couldn't build your plan");
        return;
      }
      setPlan(data);
    } finally {
      clearInterval(ticker);
      setCreating(false);
    }
  };

  const patchItems = async (items: ContentPlanItemRecord[]) => {
    if (!plan) return;
    const previous = plan;
    setPlan({ ...plan, items }); // optimistic
    const { data, error } = await api<Plan>("/api/plan", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ planId: plan.id, items }),
    });
    if (!data) {
      setPlan(previous);
      toast.error(typeof error === "string" ? error : "Couldn't save your changes");
    }
  };

  const approve = async () => {
    if (!plan) return;
    setApproving(true);
    setPlan({ ...plan, status: "generating" }); // optimistic; poll takes over
    try {
      const { error } = await api<{ completed: number; failed: number }>(
        "/api/plan/approve",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ planId: plan.id }),
        },
      );
      if (error) {
        toast.error(typeof error === "string" ? error : "Generation hit a problem");
      }
    } finally {
      setApproving(false);
      void load();
    }
  };

  // ---- State: initial load ----
  if (plan === undefined) {
    return (
      <div className="space-y-4 py-8">
        <Skeleton className="h-9 w-72" />
        <Skeleton className="h-24 w-full rounded-xl" />
        <Skeleton className="h-24 w-full rounded-xl" />
        <Skeleton className="h-24 w-full rounded-xl" />
      </div>
    );
  }

  // ---- Creating (staged loading) — shown regardless of prior state ----
  if (creating) {
    return (
      <div className="flex min-h-[60vh] flex-col justify-center py-8">
        <div className="max-w-xl space-y-3">
          <h1 className="text-3xl font-semibold tracking-tight">
            Building your content plan
          </h1>
          <div className="h-2 w-64 overflow-hidden rounded-full bg-accent">
            <div
              className="h-full rounded-full bg-primary transition-all duration-700"
              style={{ width: `${((stage + 1) / CREATE_STAGES.length) * 100}%` }}
            />
          </div>
          <p className="text-sm text-primary">{CREATE_STAGES[stage]}</p>
        </div>
      </div>
    );
  }

  // ---- State 1: no plan yet ----
  if (plan === null || (plan.status === "completed" && plan.items.length === 0)) {
    return (
      <div className="flex min-h-[60vh] flex-col justify-center py-8">
        <div className="max-w-xl">
          <h1 className="text-3xl font-semibold tracking-tight">
            Let&apos;s plan your content for the week
          </h1>
          <p className="mt-3 max-w-[65ch] text-sm leading-relaxed text-muted-foreground">
            We&apos;ll analyze your business and create a personalized content
            plan — photos, graphics, and captions, all ready to go. You review
            and approve; we handle the rest.
          </p>
          <div className="mt-6">
            <Button size="lg" className="rounded-full" onClick={createPlan}>
              <Sparkles className="mr-2 h-4 w-4" strokeWidth={1.5} />
              Create My Content Plan
            </Button>
          </div>
        </div>
      </div>
    );
  }

  const items = plan.items;
  const totalCredits = items.reduce((sum, i) => sum + (i.estimatedCredits || 1), 0);
  const doneCount = items.filter((i) => i.status === "completed").length;
  const failedCount = items.filter((i) => i.status === "failed").length;
  const allDone = plan.status === "completed";

  // ---- State 2: review a draft ----
  if (plan.status === "draft") {
    const weekOf = new Date(plan.weekStart).toLocaleDateString(undefined, {
      month: "long",
      day: "numeric",
    });
    return (
      <div className="space-y-6 pb-28 pt-8">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">
            Your Content Plan for This Week
          </h1>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            Week of {weekOf}. Review the plan below — edit or remove items, then
            approve to start generating.
          </p>
        </div>

        <div className="space-y-3">
          {items.map((item) => (
            <PlanItemCard
              key={item.id}
              item={item}
              mode="review"
              onUpdateDescription={(id, description) =>
                void patchItems(
                  items.map((i) => (i.id === id ? { ...i, description } : i)),
                )
              }
              onRemove={(id) =>
                items.length > 1
                  ? void patchItems(items.filter((i) => i.id !== id))
                  : toast.info("A plan needs at least one item")
              }
            />
          ))}
        </div>

        {/* Minimal add-item: describe it, the agent-set defaults do the rest */}
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            const text = newItemText.trim();
            if (!text) return;
            const first = items[0];
            void patchItems([
              ...items,
              {
                id: crypto.randomUUID(),
                type: "engagement",
                title: text.length > 60 ? `${text.slice(0, 57)}…` : text,
                description: text,
                platform: first?.platform ?? "instagram",
                scheduledDay: "friday",
                estimatedCredits: 1,
                status: "pending",
              },
            ]);
            setNewItemText("");
          }}
        >
          <Input
            value={newItemText}
            onChange={(e) => setNewItemText(e.target.value)}
            placeholder="Describe what you'd like — we'll handle the rest"
            aria-label="Add another item"
          />
          <Button type="submit" variant="outline" className="rounded-lg">
            <Plus className="mr-1 h-4 w-4" strokeWidth={1.5} /> Add
          </Button>
        </form>

        {/* Sticky approve footer */}
        <div className="fixed inset-x-0 bottom-0 border-t border-border bg-background/95 backdrop-blur md:left-[280px]">
          <div className="mx-auto flex max-w-4xl items-center justify-between gap-4 px-6 py-4">
            <p className="text-sm text-muted-foreground">
              <span className="font-medium text-foreground">{items.length} items</span>
              {" · "}Will use{" "}
              <span className="font-mono font-semibold text-foreground">
                {totalCredits}
              </span>{" "}
              credits
            </p>
            <Button
              size="lg"
              className="rounded-full"
              onClick={approve}
              disabled={approving}
            >
              Approve &amp; Generate All
              <ArrowRight className="ml-2 h-4 w-4" strokeWidth={1.5} />
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // ---- State 3: generating / completed ----
  return (
    <div className="space-y-6 py-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">
            {allDone ? "Your content is ready" : "Generating your content"}
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {doneCount} of {items.length} items complete
            {failedCount > 0 && ` · ${failedCount} failed`}
          </p>
          <div className="mt-3 h-2 w-full max-w-md overflow-hidden rounded-full bg-accent">
            <div
              className="h-full rounded-full bg-primary transition-all duration-500"
              style={{ width: `${(doneCount / Math.max(items.length, 1)) * 100}%` }}
            />
          </div>
        </div>
        {allDone && (
          <Button variant="outline" className="rounded-full" onClick={createPlan}>
            <Sparkles className="mr-2 h-4 w-4" strokeWidth={1.5} />
            Start a new plan
          </Button>
        )}
      </div>

      <div className="space-y-3">
        {items.map((item) => (
          <PlanItemCard
            key={item.id}
            item={item}
            mode="progress"
            onRetry={failedCount > 0 && allDone ? approve : undefined}
          />
        ))}
      </div>

      {allDone && failedCount === 0 && (
        <div className="rounded-xl border border-primary/20 bg-primary/5 p-4 text-sm">
          All {items.length} items generated. Each card&apos;s{" "}
          <span className="text-primary">View</span> link opens the finished
          content — the Gallery page is coming next.
        </div>
      )}
    </div>
  );
}
