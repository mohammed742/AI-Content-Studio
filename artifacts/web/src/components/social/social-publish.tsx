"use client";

/**
 * DEV-36 (STU-33): Publish-to-YouTube (DESIGN §9.9 "Publish flow").
 *
 * Pick a ready video Asset Kit + a connected YouTube channel, set the title /
 * description / privacy / tags, and publish. Publishing is async (1–5 min), so
 * the submit records a job that shows here as "Processing"; we poll
 * GET /api/social/publish while anything is in flight and surface the live post
 * link on completion, or an error + Retry on failure.
 *
 * Publishing history gets its full table in DEV-39 — this is the minimal
 * in-context status list the publish flow needs to satisfy the slice's ACs.
 */
import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  Youtube,
  Loader2,
  CheckCircle2,
  XCircle,
  ExternalLink,
  Send,
  Clock,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export interface PublishAccountOption {
  id: string;
  label: string;
}
export interface PublishKitOption {
  id: string;
  title: string;
}
export interface PublishJobView {
  id: string;
  status: "pending" | "processing" | "completed" | "failed";
  title: string;
  platform: string;
  resultUrl: string | null;
  error: string | null;
  createdAt: string;
}

const PRIVACIES = [
  { value: "public", label: "Public" },
  { value: "unlisted", label: "Unlisted" },
  { value: "private", label: "Private" },
] as const;

const SELECT_CLASS =
  "flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50";

/** Map a raw API job (ISO date strings) to the view shape. */
function toView(raw: {
  id: string;
  status: PublishJobView["status"];
  title: string;
  platform: string;
  resultUrl: string | null;
  error: string | null;
  createdAt: string;
}): PublishJobView {
  return {
    id: raw.id,
    status: raw.status,
    title: raw.title,
    platform: raw.platform,
    resultUrl: raw.resultUrl,
    error: raw.error,
    createdAt: raw.createdAt,
  };
}

export function SocialPublish({
  youtubeAccounts,
  videoKits,
  initialJobs,
}: {
  youtubeAccounts: PublishAccountOption[];
  videoKits: PublishKitOption[];
  initialJobs: PublishJobView[];
}) {
  const [kitId, setKitId] = useState(videoKits[0]?.id ?? "");
  const [accountId, setAccountId] = useState(youtubeAccounts[0]?.id ?? "");
  const [title, setTitle] = useState(videoKits[0]?.title.slice(0, 100) ?? "");
  const [description, setDescription] = useState("");
  const [tags, setTags] = useState("");
  const [privacy, setPrivacy] = useState<string>("public");
  const [submitting, setSubmitting] = useState(false);
  const [jobs, setJobs] = useState<PublishJobView[]>(initialJobs);

  const canPublish = youtubeAccounts.length > 0 && videoKits.length > 0;
  const hasInflight = jobs.some(
    (j) => j.status === "processing" || j.status === "pending",
  );

  // Prefill the title from the chosen kit (until the user edits it themselves).
  function chooseKit(id: string) {
    const kit = videoKits.find((k) => k.id === id);
    setKitId(id);
    if (kit) setTitle(kit.title.slice(0, 100));
  }

  // Poll for status while any job is still in flight.
  useEffect(() => {
    if (!hasInflight) return;
    const interval = setInterval(async () => {
      try {
        const res = await fetch("/api/social/publish");
        const json = (await res.json()) as { data: unknown };
        if (res.ok && Array.isArray(json.data)) {
          setJobs((json.data as Parameters<typeof toView>[0][]).map(toView));
        }
      } catch {
        // transient — the next tick retries
      }
    }, 5000);
    return () => clearInterval(interval);
  }, [hasInflight]);

  async function publish() {
    if (!kitId || !accountId || !title.trim()) {
      toast.error("Pick a video, a channel, and a title.");
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch("/api/social/publish", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          assetKitId: kitId,
          socialAccountId: accountId,
          title: title.trim(),
          description: description.trim() || undefined,
          tags: tags
            .split(",")
            .map((t) => t.trim())
            .filter(Boolean),
          privacy,
        }),
      });
      const json = (await res.json()) as {
        data: Parameters<typeof toView>[0] | null;
        error: unknown;
      };
      if (!res.ok || !json.data) {
        toast.error(
          typeof json.error === "string"
            ? json.error
            : "Couldn't publish. Please try again.",
        );
        return;
      }
      toast.success("Publishing started — this can take a few minutes.");
      setJobs((prev) => [toView(json.data!), ...prev]);
    } catch {
      toast.error("Couldn't publish. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  async function retry(jobId: string) {
    try {
      const res = await fetch("/api/social/publish", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ retryJobId: jobId }),
      });
      const json = (await res.json()) as {
        data: Parameters<typeof toView>[0] | null;
        error: unknown;
      };
      if (!res.ok || !json.data) {
        toast.error(
          typeof json.error === "string" ? json.error : "Couldn't retry.",
        );
        return;
      }
      toast.success("Retrying…");
      const updated = toView(json.data);
      setJobs((prev) => prev.map((j) => (j.id === updated.id ? updated : j)));
    } catch {
      toast.error("Couldn't retry. Please try again.");
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold tracking-tight">Publish to YouTube</h2>
        <p className="text-sm text-muted-foreground">
          Send a generated video straight to a connected channel.
        </p>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <Youtube className="h-6 w-6 text-red-500" strokeWidth={1.5} />
            <CardTitle className="text-base">New publish</CardTitle>
          </div>
          {!canPublish && (
            <CardDescription className="text-xs">
              {youtubeAccounts.length === 0
                ? "Connect a YouTube channel above to start publishing."
                : "Generate a video (UGC Video) first — YouTube publishing needs a video Asset Kit."}
            </CardDescription>
          )}
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="publish-kit">Video</Label>
              <select
                id="publish-kit"
                className={SELECT_CLASS}
                value={kitId}
                disabled={!canPublish || submitting}
                onChange={(e) => chooseKit(e.target.value)}
              >
                {videoKits.length === 0 && <option value="">No videos yet</option>}
                {videoKits.map((k) => (
                  <option key={k.id} value={k.id}>
                    {k.title}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="publish-account">Channel</Label>
              <select
                id="publish-account"
                className={SELECT_CLASS}
                value={accountId}
                disabled={!canPublish || submitting}
                onChange={(e) => setAccountId(e.target.value)}
              >
                {youtubeAccounts.length === 0 && (
                  <option value="">No channel connected</option>
                )}
                {youtubeAccounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="publish-title">
              Title{" "}
              <span className="text-xs text-muted-foreground">
                ({title.length}/100)
              </span>
            </Label>
            <Input
              id="publish-title"
              value={title}
              maxLength={100}
              disabled={!canPublish || submitting}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Video title"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="publish-description">Description</Label>
            <Textarea
              id="publish-description"
              value={description}
              rows={3}
              maxLength={5000}
              disabled={!canPublish || submitting}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Optional description"
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="publish-privacy">Privacy</Label>
              <select
                id="publish-privacy"
                className={SELECT_CLASS}
                value={privacy}
                disabled={!canPublish || submitting}
                onChange={(e) => setPrivacy(e.target.value)}
              >
                {PRIVACIES.map((p) => (
                  <option key={p.value} value={p.value}>
                    {p.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="publish-tags">
                Tags{" "}
                <span className="text-xs text-muted-foreground">
                  (comma-separated)
                </span>
              </Label>
              <Input
                id="publish-tags"
                value={tags}
                disabled={!canPublish || submitting}
                onChange={(e) => setTags(e.target.value)}
                placeholder="launch, product, sale"
              />
            </div>
          </div>

          <Button
            className="w-full"
            disabled={!canPublish || submitting}
            onClick={publish}
          >
            {submitting ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Publishing…
              </>
            ) : (
              <>
                <Send className="h-4 w-4" />
                Publish to YouTube
              </>
            )}
          </Button>
        </CardContent>
      </Card>

      {jobs.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-sm font-medium text-muted-foreground">
            Recent publishes
          </h3>
          <ul className="space-y-2">
            {jobs.map((job) => (
              <PublishJobRow key={job.id} job={job} onRetry={() => retry(job.id)} />
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function PublishJobRow({
  job,
  onRetry,
}: {
  job: PublishJobView;
  onRetry: () => void;
}) {
  return (
    <li className="flex items-center justify-between gap-3 rounded-lg border bg-card px-4 py-3">
      <div className="min-w-0">
        <p className="truncate text-sm font-medium">{job.title}</p>
        <p className="text-xs capitalize text-muted-foreground">{job.platform}</p>
        {job.status === "failed" && job.error && (
          <p className="mt-0.5 truncate text-xs text-destructive">{job.error}</p>
        )}
      </div>
      <div className="flex shrink-0 items-center gap-3">
        <StatusBadge status={job.status} />
        {job.status === "completed" && job.resultUrl && (
          <a
            href={job.resultUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
          >
            View <ExternalLink className="h-3 w-3" />
          </a>
        )}
        {job.status === "failed" && (
          <Button size="sm" variant="outline" onClick={onRetry}>
            Retry
          </Button>
        )}
      </div>
    </li>
  );
}

function StatusBadge({ status }: { status: PublishJobView["status"] }) {
  if (status === "completed") {
    return (
      <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-600 dark:text-emerald-400">
        <CheckCircle2 className="h-3.5 w-3.5" /> Published
      </span>
    );
  }
  if (status === "failed") {
    return (
      <span className="inline-flex items-center gap-1 text-xs font-medium text-destructive">
        <XCircle className="h-3.5 w-3.5" /> Failed
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground">
      {status === "processing" ? (
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
      ) : (
        <Clock className="h-3.5 w-3.5" />
      )}
      Processing
    </span>
  );
}
