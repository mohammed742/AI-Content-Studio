"use client";

/**
 * DEV-39 (STU-36): Publishing History table (DESIGN §9.9).
 *
 * The full history section on /social, superseding the minimal "Recent
 * publishes" list the publish slices shipped inline. Each row shows the asset
 * thumbnail, title, platform, relative date, and a status badge; clicking a row
 * expands it to reveal the live post URL, any error, the published time, and a
 * Retry control for failures. Jobs + polling are owned by the parent
 * <SocialPublish>, so this is a pure presentational list: it renders `jobs` and
 * calls `onRetry` — no data fetching of its own.
 */
import { useState } from "react";
import {
  Youtube,
  Music2,
  Instagram,
  Loader2,
  CheckCircle2,
  XCircle,
  Clock,
  ExternalLink,
  ChevronDown,
  Film,
  History,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  summarizePublishJobs,
  formatRelativeTime,
  statusMeta,
  type StatusTone,
} from "@/lib/publish-history";
import type { PublishJobView, PublishPlatform } from "./social-publish";

const PLATFORM_LABEL: Record<string, string> = {
  youtube: "YouTube",
  tiktok: "TikTok",
  instagram: "Instagram",
};

export function PublishHistory({
  jobs,
  onRetry,
  retryingId,
}: {
  jobs: PublishJobView[];
  onRetry: (id: string) => void;
  retryingId: string | null;
}) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const summary = summarizePublishJobs(jobs);

  function toggle(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <History className="h-4 w-4 text-muted-foreground" />
          <h3 className="text-sm font-semibold tracking-tight">
            Publishing history
          </h3>
        </div>
        {summary.total > 0 && (
          <p className="text-xs text-muted-foreground">
            {summary.published} published
            {summary.failed > 0 && ` · ${summary.failed} failed`}
            {summary.inProgress > 0 && ` · ${summary.inProgress} in progress`}
          </p>
        )}
      </div>

      {jobs.length === 0 ? (
        <div className="rounded-lg border border-dashed bg-card/50 px-4 py-10 text-center">
          <History className="mx-auto h-6 w-6 text-muted-foreground" />
          <p className="mt-2 text-sm font-medium">No publishes yet</p>
          <p className="text-xs text-muted-foreground">
            Publish a video above and it&apos;ll show up here with live status.
          </p>
        </div>
      ) : (
        <ul className="divide-y overflow-hidden rounded-lg border bg-card">
          {jobs.map((job) => (
            <HistoryRow
              key={job.id}
              job={job}
              open={expanded.has(job.id)}
              onToggle={() => toggle(job.id)}
              onRetry={() => onRetry(job.id)}
              retrying={retryingId === job.id}
            />
          ))}
        </ul>
      )}
    </section>
  );
}

function HistoryRow({
  job,
  open,
  onToggle,
  onRetry,
  retrying,
}: {
  job: PublishJobView;
  open: boolean;
  onToggle: () => void;
  onRetry: () => void;
  retrying: boolean;
}) {
  const platform = job.platform as PublishPlatform;
  return (
    <li>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/40"
      >
        <JobThumbnail mediaUrl={job.mediaUrl} platform={platform} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">
            {job.title || "Untitled video"}
          </p>
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <PlatformIcon platform={platform} className="h-3.5 w-3.5" />
            {PLATFORM_LABEL[job.platform] ?? job.platform}
            <span aria-hidden>·</span>
            {formatRelativeTime(job.createdAt, Date.now())}
          </p>
        </div>
        <StatusBadge status={job.status} />
        <ChevronDown
          className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform ${
            open ? "rotate-180" : ""
          }`}
        />
      </button>

      {open && (
        <div className="space-y-3 border-t bg-muted/20 px-4 py-3 text-sm">
          <DetailLine label="Status">
            <StatusBadge status={job.status} />
          </DetailLine>
          <DetailLine label="Published">
            {job.status === "completed" && job.completedAt
              ? formatRelativeTime(job.completedAt, Date.now())
              : "—"}
          </DetailLine>
          {job.status === "completed" && job.resultUrl && (
            <DetailLine label="Live post">
              <a
                href={job.resultUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 font-medium text-primary hover:underline"
              >
                View on {PLATFORM_LABEL[job.platform] ?? job.platform}
                <ExternalLink className="h-3.5 w-3.5" />
              </a>
            </DetailLine>
          )}
          {job.status === "failed" && (
            <>
              {job.error && (
                <DetailLine label="Error">
                  <span className="text-destructive">{job.error}</span>
                </DetailLine>
              )}
              <div className="pt-1">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={onRetry}
                  disabled={retrying}
                >
                  {retrying ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Retrying…
                    </>
                  ) : (
                    "Retry publish"
                  )}
                </Button>
              </div>
            </>
          )}
        </div>
      )}
    </li>
  );
}

function DetailLine({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-start gap-3">
      <span className="w-20 shrink-0 text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </span>
      <span className="min-w-0 flex-1">{children}</span>
    </div>
  );
}

/**
 * A small video first-frame thumbnail with an icon fallback. `preload="metadata"`
 * fetches just enough to paint frame one; on any load error we swap to a neutral
 * film-icon tile so a broken/expired media URL never leaves a blank box.
 */
function JobThumbnail({
  mediaUrl,
  platform,
}: {
  mediaUrl: string | null;
  platform: PublishPlatform;
}) {
  const [failed, setFailed] = useState(false);
  const showVideo = mediaUrl && !failed;
  return (
    <div className="relative flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-md border bg-muted">
      {showVideo ? (
        <video
          src={mediaUrl}
          muted
          playsInline
          preload="metadata"
          className="h-full w-full object-cover"
          onError={() => setFailed(true)}
        />
      ) : (
        <Film className="h-4 w-4 text-muted-foreground" />
      )}
      <span className="absolute bottom-0 right-0 rounded-tl bg-background/80 p-0.5">
        <PlatformIcon platform={platform} className="h-3 w-3" />
      </span>
    </div>
  );
}

function PlatformIcon({
  platform,
  className,
}: {
  platform: PublishPlatform;
  className?: string;
}) {
  if (platform === "tiktok") {
    return <Music2 className={className} strokeWidth={1.75} />;
  }
  if (platform === "instagram") {
    return <Instagram className={`${className ?? ""} text-pink-500`} strokeWidth={1.75} />;
  }
  return <Youtube className={`${className ?? ""} text-red-500`} strokeWidth={1.75} />;
}

const TONE_CLASS: Record<StatusTone, string> = {
  success: "text-emerald-600 dark:text-emerald-400",
  danger: "text-destructive",
  pending: "text-muted-foreground",
};

function StatusBadge({ status }: { status: PublishJobView["status"] }) {
  const { label, tone } = statusMeta(status);
  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1 text-xs font-medium ${TONE_CLASS[tone]}`}
    >
      {tone === "success" ? (
        <CheckCircle2 className="h-3.5 w-3.5" />
      ) : tone === "danger" ? (
        <XCircle className="h-3.5 w-3.5" />
      ) : status === "processing" ? (
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
      ) : (
        <Clock className="h-3.5 w-3.5" />
      )}
      {label}
    </span>
  );
}
