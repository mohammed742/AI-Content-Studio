/**
 * DEV-39 (STU-36): Pure display helpers for the Publishing History section.
 *
 * The history table (`components/social/publish-history.tsx`) is a client
 * component, so its non-trivial logic lives here as pure functions to stay
 * testable under the Node runner: the status-summary counts for the header, a
 * deterministic relative-time formatter (the caller injects `now`), and the
 * status → badge metadata map. No React, no DOM, no `Date.now()` side effects.
 */
import type { PublishJobStatus } from "@/db/schema";

export interface PublishJobSummary {
  total: number;
  published: number;
  failed: number;
  /** pending + processing folded together — everything still in flight. */
  inProgress: number;
}

/** Count jobs by outcome for the history header. */
export function summarizePublishJobs(
  jobs: ReadonlyArray<{ status: PublishJobStatus }>,
): PublishJobSummary {
  const summary: PublishJobSummary = {
    total: jobs.length,
    published: 0,
    failed: 0,
    inProgress: 0,
  };
  for (const job of jobs) {
    if (job.status === "completed") summary.published += 1;
    else if (job.status === "failed") summary.failed += 1;
    else summary.inProgress += 1; // pending | processing
  }
  return summary;
}

const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;
const WEEK_MS = 7 * DAY_MS;

/**
 * Human-friendly relative time ("just now", "5m ago", "3h ago", "2d ago").
 * Past a week it falls back to an absolute date so old rows stay legible, and a
 * future timestamp (clock skew) reads as "just now" rather than a negative age.
 * `now` is injected so this is deterministic and unit-testable.
 */
export function formatRelativeTime(iso: string, now: Date | number): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "—";
  const nowMs = typeof now === "number" ? now : now.getTime();
  const diff = nowMs - then;

  if (diff < MINUTE_MS) return "just now"; // includes small future skew
  if (diff < HOUR_MS) return `${Math.floor(diff / MINUTE_MS)}m ago`;
  if (diff < DAY_MS) return `${Math.floor(diff / HOUR_MS)}h ago`;
  if (diff < WEEK_MS) return `${Math.floor(diff / DAY_MS)}d ago`;

  return new Date(then).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export type StatusTone = "success" | "danger" | "pending";

export interface StatusMeta {
  label: string;
  tone: StatusTone;
}

/** Map a job status to its badge label + tone. */
export function statusMeta(status: PublishJobStatus): StatusMeta {
  switch (status) {
    case "completed":
      return { label: "Published", tone: "success" };
    case "failed":
      return { label: "Failed", tone: "danger" };
    case "processing":
      return { label: "Processing", tone: "pending" };
    case "pending":
      return { label: "Pending", tone: "pending" };
  }
}
