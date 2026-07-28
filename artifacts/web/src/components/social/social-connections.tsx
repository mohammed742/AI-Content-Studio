"use client";

/**
 * DEV-35 (STU-31): Social connection cards (DESIGN §9.9).
 *
 * One card per platform (YouTube / TikTok / Instagram). Disconnected → a
 * "Connect" CTA that POSTs to /api/social/connect and navigates the browser to
 * the returned Muapi OAuth URL. Connected → the account name(s), read-only
 * (rename/disconnect is DEV-34). On return from OAuth the callback route bounces
 * here with ?connected=1&count=N (or ?error=sync_failed) → surfaced as a toast.
 */
import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { toast } from "sonner";
import {
  Youtube,
  Instagram,
  Music2,
  Share2,
  CheckCircle2,
  Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

type PlatformId = "youtube" | "tiktok" | "instagram";

interface ConnectedAccount {
  id: string;
  platform: string;
  platformName: string;
  accountName: string;
}

const PLATFORMS: ReadonlyArray<{
  id: PlatformId;
  name: string;
  Icon: typeof Youtube;
  accent: string;
  note?: string;
}> = [
  { id: "youtube", name: "YouTube", Icon: Youtube, accent: "text-red-500" },
  { id: "tiktok", name: "TikTok", Icon: Music2, accent: "text-foreground" },
  {
    id: "instagram",
    name: "Instagram",
    Icon: Instagram,
    accent: "text-pink-500",
    note: "Requires an Instagram Business or Creator account.",
  },
];

export function SocialConnections({
  accounts,
}: {
  accounts: ConnectedAccount[];
}) {
  const searchParams = useSearchParams();
  const [pending, setPending] = useState<PlatformId | null>(null);

  // Surface the OAuth-return result once, then scrub the query so a refresh
  // doesn't re-toast.
  useEffect(() => {
    if (searchParams.get("connected") === "1") {
      const count = Number(searchParams.get("count") ?? "0");
      toast.success(
        count > 0
          ? `Connected — ${count} account${count === 1 ? "" : "s"} synced.`
          : "Returned from the platform, but no connected account was found yet.",
      );
    } else if (searchParams.get("error") === "sync_failed") {
      toast.error("Couldn't sync your accounts. Please try connecting again.");
    } else {
      return;
    }
    window.history.replaceState(null, "", window.location.pathname);
  }, [searchParams]);

  async function connect(platform: PlatformId) {
    setPending(platform);
    try {
      const res = await fetch("/api/social/connect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ platform }),
      });
      const json = (await res.json()) as {
        data: { url?: string } | null;
        error: string | null;
      };
      if (!res.ok || !json.data?.url) {
        toast.error(json.error ?? "Couldn't start the connection.");
        setPending(null);
        return;
      }
      // Hand off to the platform's OAuth screen.
      window.location.href = json.data.url;
    } catch {
      toast.error("Couldn't start the connection. Please try again.");
      setPending(null);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <Share2 className="h-5 w-5" strokeWidth={1.5} />
        </div>
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            Social Accounts
          </h1>
          <p className="text-sm text-muted-foreground">
            Connect your channels so the agent can publish directly.
          </p>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {PLATFORMS.map(({ id, name, Icon, accent, note }) => {
          const connected = accounts.filter((a) => a.platform === id);
          const isPending = pending === id;
          return (
            <Card key={id} className="flex flex-col">
              <CardHeader>
                <div className="flex items-center gap-3">
                  <Icon className={`h-6 w-6 ${accent}`} strokeWidth={1.5} />
                  <CardTitle className="text-base">{name}</CardTitle>
                </div>
                {note && (
                  <CardDescription className="text-xs">{note}</CardDescription>
                )}
              </CardHeader>
              <CardContent className="mt-auto space-y-3">
                {connected.length > 0 && (
                  <ul className="space-y-1.5">
                    {connected.map((a) => (
                      <li
                        key={a.id}
                        className="flex items-center gap-2 text-sm text-foreground"
                      >
                        <CheckCircle2 className="h-4 w-4 shrink-0 text-green-500" />
                        <span className="truncate">{a.accountName}</span>
                      </li>
                    ))}
                  </ul>
                )}
                <Button
                  variant={connected.length > 0 ? "outline" : "default"}
                  className="w-full"
                  disabled={isPending}
                  onClick={() => connect(id)}
                >
                  {isPending ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Connecting…
                    </>
                  ) : connected.length > 0 ? (
                    "Connect another"
                  ) : (
                    `Connect ${name}`
                  )}
                </Button>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
