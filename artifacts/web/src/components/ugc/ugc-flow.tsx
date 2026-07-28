"use client";

/**
 * DEV-33: UGC Video flow orchestrator (DESIGN §9.6). Agent-driven, no prompts.
 *
 * State — no job:     intro + "Create My UGC Video" (staged loading copy).
 * State — draft:      review the agent's script (editable) + presenter (changeable),
 *                     then a sticky "Generate Video" footer (credits, no dollars).
 * State — generating: per-step progress with friendly labels.
 * State — failed:     progress with the failed step + Retry (resumes there).
 * State — completed:  video player with per-format tabs + downloads.
 *
 * Polls GET /api/ugc while a job is generating; per-step statuses are written by
 * the pipeline as steps finish. Users see credits and plain-English progress
 * only — no model names, no dollar costs (CONTEXT.md → "Credits Display").
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { Sparkles, ArrowRight } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { UgcScriptCard } from "./ugc-script-card";
import { PresenterPicker } from "./presenter-picker";
import { UgcProgress } from "./ugc-progress";
import { UgcResult } from "./ugc-result";
import type { UgcJobRow, UgcScriptRecord } from "@/db/schema";

/** A UGC video is billed as 3 credits (DESIGN §9.6 step 3). */
const UGC_CREDITS = 3;

const CREATE_STAGES = [
  "Reading your brand…",
  "Writing the script…",
  "Casting a presenter…",
  "Getting things ready…",
];

type Job = UgcJobRow;
type Segments = Pick<UgcScriptRecord, "hook" | "body" | "cta">;

async function api<T>(
  url: string,
  init?: RequestInit,
): Promise<{ data: T | null; error: unknown }> {
  const res = await fetch(url, init);
  return res.json();
}

export function UgcFlow() {
  const [job, setJob] = useState<Job | null | undefined>(undefined);
  const [creating, setCreating] = useState(false);
  const [stage, setStage] = useState(0);
  const [generating, setGenerating] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const load = useCallback(async () => {
    const { data } = await api<Job>("/api/ugc");
    setJob(data ?? null);
    return data ?? null;
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // Poll while the pipeline runs so per-step progress streams in.
  useEffect(() => {
    const shouldPoll = job?.status === "generating" || generating;
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
  }, [job?.status, generating, load]);

  const createProposal = async () => {
    setCreating(true);
    setStage(0);
    const ticker = setInterval(
      () => setStage((s) => Math.min(s + 1, CREATE_STAGES.length - 1)),
      1800,
    );
    try {
      const { data, error } = await api<Job>("/api/ugc", { method: "POST" });
      if (!data) {
        toast.error(typeof error === "string" ? error : "Couldn't set up your video");
        return;
      }
      setJob(data);
    } finally {
      clearInterval(ticker);
      setCreating(false);
    }
  };

  const saveScript = async (segments: Segments) => {
    if (!job) return;
    const { data, error } = await api<Job>("/api/ugc", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jobId: job.id, script: segments }),
    });
    if (!data) {
      toast.error(typeof error === "string" ? error : "Couldn't save your edits");
      return;
    }
    setJob(data);
  };

  const changePresenter = async (presenterId: string) => {
    if (!job || job.presenterId === presenterId) return;
    const previous = job;
    setJob({ ...job, presenterId }); // optimistic
    const { data, error } = await api<Job>("/api/ugc", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jobId: job.id, presenterId }),
    });
    if (!data) {
      setJob(previous);
      toast.error(typeof error === "string" ? error : "Couldn't change the presenter");
    }
  };

  const generate = async () => {
    if (!job) return;
    setGenerating(true);
    setJob({ ...job, status: "generating" }); // optimistic; poll takes over
    try {
      const { error } = await api<{ status: string }>("/api/ugc/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jobId: job.id }),
      });
      if (error) {
        toast.error(typeof error === "string" ? error : "Something went wrong");
      }
    } finally {
      setGenerating(false);
      void load();
    }
  };

  // ---- State: initial load ----
  if (job === undefined) {
    return (
      <div className="space-y-4 py-8">
        <Skeleton className="h-9 w-72" />
        <Skeleton className="h-40 w-full rounded-xl" />
        <Skeleton className="h-24 w-full rounded-xl" />
      </div>
    );
  }

  // ---- Creating (staged loading) ----
  if (creating) {
    return (
      <div className="flex min-h-[60vh] flex-col justify-center py-8">
        <div className="max-w-xl space-y-3">
          <h1 className="text-3xl font-semibold tracking-tight">
            Setting up your video
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

  // ---- State: no job yet ----
  if (job === null) {
    return (
      <div className="flex min-h-[60vh] flex-col justify-center py-8">
        <div className="max-w-xl">
          <h1 className="text-3xl font-semibold tracking-tight">
            Make a UGC-style video ad
          </h1>
          <p className="mt-3 max-w-[60ch] text-sm leading-relaxed text-muted-foreground">
            We&apos;ll write a short, natural script about your product, cast a
            presenter that fits your audience, and produce a ready-to-post video —
            formatted for every platform. You just review and confirm.
          </p>
          <div className="mt-6">
            <Button size="lg" className="rounded-full" onClick={createProposal}>
              <Sparkles className="mr-2 h-4 w-4" strokeWidth={1.5} />
              Create My UGC Video
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // ---- State: generating / failed ----
  if (job.status === "generating" || job.status === "failed") {
    return <UgcProgress job={job} onRetry={generate} retrying={generating} />;
  }

  // ---- State: completed ----
  if (job.status === "completed") {
    return (
      <UgcResult
        variants={job.outputs.variants ?? []}
        assetKitId={job.assetKitId}
        onStartNew={createProposal}
      />
    );
  }

  // ---- State: draft (review) ----
  return (
    <div className="space-y-6 pb-28 pt-8">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">
          Review your UGC video
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
          The agent drafted everything below. Tweak the script or swap the
          presenter, then generate.
        </p>
      </div>

      <UgcScriptCard
        script={job.script}
        onSave={saveScript}
        onRegenerate={createProposal}
      />

      <PresenterPicker
        selectedId={job.presenterId}
        onSelect={changePresenter}
      />

      {/* Sticky confirm footer */}
      <div className="fixed inset-x-0 bottom-0 border-t border-border bg-background/95 backdrop-blur md:left-[280px]">
        <div className="mx-auto flex max-w-4xl items-center justify-between gap-4 px-6 py-4">
          <p className="text-sm text-muted-foreground">
            This will use{" "}
            <span className="font-mono font-semibold text-foreground">
              {UGC_CREDITS}
            </span>{" "}
            credits
          </p>
          <Button
            size="lg"
            className="rounded-full"
            onClick={generate}
            disabled={generating}
          >
            Generate Video
            <ArrowRight className="ml-2 h-4 w-4" strokeWidth={1.5} />
          </Button>
        </div>
      </div>
    </div>
  );
}
