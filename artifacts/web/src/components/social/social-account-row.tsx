"use client";

/**
 * DEV-34 (STU-32): One connected account with management controls.
 *
 * Shows the display name (nickname ?? platform handle) with a green connected
 * marker, plus Rename and Disconnect actions. Rename edits a local nickname
 * (PATCH /api/social/accounts); Disconnect revokes on Muapi + deletes the row
 * (DELETE). After a mutation we `router.refresh()` so the server component re-lists.
 */
import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CheckCircle2, Loader2, Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";

export interface ManagedAccount {
  id: string;
  platform: string;
  platformName: string;
  accountName: string;
  nickname: string | null;
}

const MAX_NICKNAME_LENGTH = 60;

export function SocialAccountRow({ account }: { account: ManagedAccount }) {
  const router = useRouter();
  const [renameOpen, setRenameOpen] = useState(false);
  const [disconnectOpen, setDisconnectOpen] = useState(false);
  const [nickname, setNickname] = useState(account.nickname ?? "");
  const [busy, setBusy] = useState(false);

  const displayName = account.nickname?.trim() || account.accountName;

  async function saveRename() {
    setBusy(true);
    try {
      const res = await fetch("/api/social/accounts", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accountId: account.id, nickname }),
      });
      const json = (await res.json()) as { error: string | null };
      if (!res.ok) {
        toast.error(json.error ?? "Couldn't rename the account.");
        return;
      }
      toast.success("Account renamed.");
      setRenameOpen(false);
      router.refresh();
    } catch {
      toast.error("Couldn't rename the account. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  async function confirmDisconnect() {
    setBusy(true);
    try {
      const res = await fetch("/api/social/accounts", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accountId: account.id }),
      });
      const json = (await res.json()) as { error: string | null };
      if (!res.ok) {
        toast.error(json.error ?? "Couldn't disconnect the account.");
        return;
      }
      toast.success(`Disconnected ${displayName}.`);
      setDisconnectOpen(false);
      router.refresh();
    } catch {
      toast.error("Couldn't disconnect the account. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <li className="flex items-center gap-2 text-sm">
      <CheckCircle2 className="h-4 w-4 shrink-0 text-green-500" />
      <div className="min-w-0 flex-1">
        <div className="truncate text-foreground">{displayName}</div>
        {account.nickname?.trim() && (
          <div className="truncate text-xs text-muted-foreground">
            {account.accountName}
          </div>
        )}
      </div>

      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="h-7 w-7 shrink-0 text-muted-foreground"
        aria-label={`Rename ${displayName}`}
        title="Rename"
        onClick={() => {
          setNickname(account.nickname ?? "");
          setRenameOpen(true);
        }}
      >
        <Pencil className="h-3.5 w-3.5" />
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="h-7 w-7 shrink-0 text-muted-foreground hover:text-destructive"
        aria-label={`Disconnect ${displayName}`}
        title="Disconnect"
        onClick={() => setDisconnectOpen(true)}
      >
        <Trash2 className="h-3.5 w-3.5" />
      </Button>

      {/* Rename dialog */}
      <Dialog open={renameOpen} onOpenChange={(o) => !busy && setRenameOpen(o)}>
        <DialogContent className="sm:max-w-md">
          <DialogTitle>Rename account</DialogTitle>
          <DialogDescription>
            Set a friendly label for {account.platformName}. This only changes how
            the account is shown here — leave it blank to use the original handle.
          </DialogDescription>
          <div className="space-y-2 py-2">
            <Input
              value={nickname}
              maxLength={MAX_NICKNAME_LENGTH}
              placeholder={account.accountName}
              disabled={busy}
              onChange={(e) => setNickname(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !busy) saveRename();
              }}
            />
          </div>
          <div className="flex justify-end gap-2">
            <DialogClose asChild>
              <Button type="button" variant="outline" disabled={busy}>
                Cancel
              </Button>
            </DialogClose>
            <Button type="button" onClick={saveRename} disabled={busy}>
              {busy && <Loader2 className="h-4 w-4 animate-spin" />}
              Save
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Disconnect confirm dialog */}
      <Dialog
        open={disconnectOpen}
        onOpenChange={(o) => !busy && setDisconnectOpen(o)}
      >
        <DialogContent className="sm:max-w-md">
          <DialogTitle>Disconnect account?</DialogTitle>
          <DialogDescription>
            {displayName} will be disconnected from {account.platformName}. The
            agent won&apos;t be able to publish to it until you reconnect.
          </DialogDescription>
          <div className="flex justify-end gap-2 pt-2">
            <DialogClose asChild>
              <Button type="button" variant="outline" disabled={busy}>
                Cancel
              </Button>
            </DialogClose>
            <Button
              type="button"
              variant="destructive"
              onClick={confirmDisconnect}
              disabled={busy}
            >
              {busy && <Loader2 className="h-4 w-4 animate-spin" />}
              Disconnect
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </li>
  );
}
