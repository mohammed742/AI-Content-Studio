"use client";

/**
 * DEV-33: Pipeline progress (DESIGN §9.6 step 4). Step-by-step with friendly,
 * no-jargon labels (stored on each step at propose time) — "Writing the
 * voiceover…" etc. Statuses: pending (dimmed), generating (spinner),
 * completed (check), failed (red + friendly message + Retry from that step).
 * No model names, no costs.
 */
import { Check, Loader2, RotateCcw, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import type { UgcJobRow } from "@/db/schema";

export function UgcProgress({
  job,
  onRetry,
  retrying,
}: {
  job: UgcJobRow;
  onRetry: () => void;
  retrying?: boolean;
}) {
  const steps = job.steps;
  const done = steps.filter((s) => s.status === "completed").length;
  const failed = job.status === "failed";

  return (
    <div className="space-y-6 py-8">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">
          {failed ? "We hit a snag" : "Creating your video"}
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {failed
            ? "One step didn't finish. Your progress is saved — pick up right where it stopped."
            : "This takes a couple of minutes. You can leave this page; we'll keep going."}
        </p>
        <div className="mt-3 h-2 w-full max-w-md overflow-hidden rounded-full bg-accent">
          <div
            className="h-full rounded-full bg-primary transition-all duration-500"
            style={{ width: `${(done / Math.max(steps.length, 1)) * 100}%` }}
          />
        </div>
      </div>

      <ol className="space-y-2">
        {steps.map((step) => (
          <li
            key={step.key}
            className={cn(
              "flex items-start gap-3 rounded-lg border px-4 py-3 text-sm",
              step.status === "failed"
                ? "border-destructive/40 bg-destructive/5"
                : "border-border",
              step.status === "pending" && "opacity-55",
            )}
          >
            <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center">
              {step.status === "completed" && (
                <Check className="h-4 w-4 text-primary" strokeWidth={2} />
              )}
              {step.status === "generating" && (
                <Loader2 className="h-4 w-4 animate-spin text-primary" strokeWidth={2} />
              )}
              {step.status === "failed" && (
                <X className="h-4 w-4 text-destructive" strokeWidth={2} />
              )}
              {step.status === "pending" && (
                <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/50" />
              )}
            </span>
            <div className="min-w-0">
              <p
                className={cn(
                  "font-medium",
                  step.status === "failed" ? "text-destructive" : "text-foreground",
                )}
              >
                {step.label}
              </p>
              {step.status === "failed" && step.error && (
                <p className="mt-0.5 text-xs text-muted-foreground">
                  Couldn&apos;t finish this step. Retrying picks up here.
                </p>
              )}
            </div>
          </li>
        ))}
      </ol>

      {failed && (
        <Button className="rounded-full" onClick={onRetry} disabled={retrying}>
          <RotateCcw className="mr-2 h-4 w-4" strokeWidth={1.5} />
          {retrying ? "Retrying…" : "Retry"}
        </Button>
      )}
    </div>
  );
}
