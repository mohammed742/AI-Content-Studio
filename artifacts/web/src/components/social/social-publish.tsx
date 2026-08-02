"use client";

/**
 * DEV-36 (STU-33) + DEV-37 (STU-34): Publish flow (DESIGN §9.9).
 *
 * Pick a ready video Asset Kit + a connected account, and publish. The form is
 * account-driven: choosing the account sets the platform, and the
 * platform-specific fields render off it — YouTube (title / description /
 * privacy / tags) or TikTok (caption / privacy level / interaction toggles / AI
 * disclosure). Publishing is async (1–5 min), so the submit records a job that
 * shows here as "Processing"; we poll GET /api/social/publish while anything is
 * in flight and surface the live post link on completion, or an error + Retry on
 * failure.
 *
 * Publishing history gets its full table in DEV-39 — this is the minimal
 * in-context status list the publish flow needs to satisfy the slice's ACs.
 */
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  Youtube,
  Music2,
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

export type PublishPlatform = "youtube" | "tiktok";

export interface PublishAccountOption {
  id: string;
  label: string;
  platform: PublishPlatform;
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

const TIKTOK_PRIVACY_LEVELS = [
  { value: "PUBLIC_TO_EVERYONE", label: "Public" },
  { value: "FOLLOWER_OF_CREATOR", label: "Followers" },
  { value: "MUTUAL_FOLLOW_FRIENDS", label: "Friends" },
  { value: "SELF_ONLY", label: "Only me" },
] as const;

const PLATFORM_META: Record<
  PublishPlatform,
  { label: string; titleLabel: string; titleMax: number }
> = {
  youtube: { label: "YouTube", titleLabel: "Title", titleMax: 100 },
  tiktok: { label: "TikTok", titleLabel: "Caption", titleMax: 150 },
};

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
  accounts,
  videoKits,
  initialJobs,
}: {
  accounts: PublishAccountOption[];
  videoKits: PublishKitOption[];
  initialJobs: PublishJobView[];
}) {
  const [kitId, setKitId] = useState(videoKits[0]?.id ?? "");
  const [accountId, setAccountId] = useState(accounts[0]?.id ?? "");
  const [title, setTitle] = useState(videoKits[0]?.title.slice(0, 100) ?? "");
  // YouTube fields.
  const [description, setDescription] = useState("");
  const [tags, setTags] = useState("");
  const [privacy, setPrivacy] = useState<string>("public");
  // TikTok fields.
  const [privacyLevel, setPrivacyLevel] = useState<string>("PUBLIC_TO_EVERYONE");
  const [allowComment, setAllowComment] = useState(true);
  const [allowDuet, setAllowDuet] = useState(true);
  const [allowStitch, setAllowStitch] = useState(true);
  const [isAiGenerated, setIsAiGenerated] = useState(true);

  const [submitting, setSubmitting] = useState(false);
  const [jobs, setJobs] = useState<PublishJobView[]>(initialJobs);

  const account = useMemo(
    () => accounts.find((a) => a.id === accountId),
    [accounts, accountId],
  );
  const platform: PublishPlatform = account?.platform ?? "youtube";
  const meta = PLATFORM_META[platform];

  const canPublish = accounts.length > 0 && videoKits.length > 0;
  const hasInflight = jobs.some(
    (j) => j.status === "processing" || j.status === "pending",
  );

  // Prefill the title from the chosen kit (until the user edits it themselves).
  function chooseKit(id: string) {
    const kit = videoKits.find((k) => k.id === id);
    setKitId(id);
    if (kit) setTitle(kit.title.slice(0, meta.titleMax));
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
    if (!kitId || !accountId) {
      toast.error("Pick a video and an account.");
      return;
    }
    if (platform === "youtube" && !title.trim()) {
      toast.error("A YouTube title is required.");
      return;
    }
    setSubmitting(true);
    try {
      const body =
        platform === "youtube"
          ? {
              assetKitId: kitId,
              socialAccountId: accountId,
              title: title.trim(),
              description: description.trim() || undefined,
              tags: tags
                .split(",")
                .map((t) => t.trim())
                .filter(Boolean),
              privacy,
            }
          : {
              assetKitId: kitId,
              socialAccountId: accountId,
              title: title.trim() || undefined,
              privacyLevel,
              allowComment,
              allowDuet,
              allowStitch,
              isAiGenerated,
            };
      const res = await fetch("/api/social/publish", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
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
        <h2 className="text-lg font-semibold tracking-tight">Publish</h2>
        <p className="text-sm text-muted-foreground">
          Send a generated video straight to a connected account.
        </p>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <PlatformIcon platform={platform} />
            <CardTitle className="text-base">
              New publish{account ? ` · ${meta.label}` : ""}
            </CardTitle>
          </div>
          {!canPublish && (
            <CardDescription className="text-xs">
              {accounts.length === 0
                ? "Connect a YouTube or TikTok account above to start publishing."
                : "Generate a video (UGC Video) first — publishing needs a video Asset Kit."}
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
              <Label htmlFor="publish-account">Account</Label>
              <select
                id="publish-account"
                className={SELECT_CLASS}
                value={accountId}
                disabled={!canPublish || submitting}
                onChange={(e) => setAccountId(e.target.value)}
              >
                {accounts.length === 0 && (
                  <option value="">No account connected</option>
                )}
                {accounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.label} · {PLATFORM_META[a.platform].label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="publish-title">
              {meta.titleLabel}{" "}
              <span className="text-xs text-muted-foreground">
                ({title.length}/{meta.titleMax}
                {platform === "tiktok" ? " · optional" : ""})
              </span>
            </Label>
            <Input
              id="publish-title"
              value={title}
              maxLength={meta.titleMax}
              disabled={!canPublish || submitting}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={platform === "tiktok" ? "Video caption" : "Video title"}
            />
          </div>

          {platform === "youtube" ? (
            <>
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
            </>
          ) : (
            <>
              <div className="space-y-1.5">
                <Label htmlFor="publish-privacy-level">Who can view</Label>
                <select
                  id="publish-privacy-level"
                  className={SELECT_CLASS}
                  value={privacyLevel}
                  disabled={!canPublish || submitting}
                  onChange={(e) => setPrivacyLevel(e.target.value)}
                >
                  {TIKTOK_PRIVACY_LEVELS.map((p) => (
                    <option key={p.value} value={p.value}>
                      {p.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                <CheckboxField
                  id="publish-allow-comment"
                  label="Allow comments"
                  checked={allowComment}
                  disabled={!canPublish || submitting}
                  onChange={setAllowComment}
                />
                <CheckboxField
                  id="publish-allow-duet"
                  label="Allow Duet"
                  checked={allowDuet}
                  disabled={!canPublish || submitting}
                  onChange={setAllowDuet}
                />
                <CheckboxField
                  id="publish-allow-stitch"
                  label="Allow Stitch"
                  checked={allowStitch}
                  disabled={!canPublish || submitting}
                  onChange={setAllowStitch}
                />
                <CheckboxField
                  id="publish-ai-generated"
                  label="Disclose AI-generated"
                  checked={isAiGenerated}
                  disabled={!canPublish || submitting}
                  onChange={setIsAiGenerated}
                />
              </div>
            </>
          )}

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
                Publish to {meta.label}
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

function PlatformIcon({ platform }: { platform: PublishPlatform }) {
  if (platform === "tiktok") {
    return <Music2 className="h-6 w-6 text-foreground" strokeWidth={1.5} />;
  }
  return <Youtube className="h-6 w-6 text-red-500" strokeWidth={1.5} />;
}

function CheckboxField({
  id,
  label,
  checked,
  disabled,
  onChange,
}: {
  id: string;
  label: string;
  checked: boolean;
  disabled: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label
      htmlFor={id}
      className="flex items-center gap-2 rounded-md border bg-transparent px-3 py-2 text-sm"
    >
      <input
        id={id}
        type="checkbox"
        className="h-4 w-4 rounded border-input accent-primary disabled:cursor-not-allowed disabled:opacity-50"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
      />
      {label}
    </label>
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
