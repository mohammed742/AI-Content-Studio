"use client";

/**
 * DEV-33: Script review card (DESIGN §9.6 step 1). Shows the agent-written
 * ~15s script as three labelled lines (hook / body / cta). "Edit" flips to
 * textareas; "Save" persists the edits (PATCH). "Regenerate" asks the agent for
 * a fresh take. A timing badge reports the spoken estimate against the 15s
 * budget — informational, never a hard limit.
 */
import { useState } from "react";
import { Pencil, RotateCcw, Check, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import type { UgcScriptRecord } from "@/db/schema";

type Segments = Pick<UgcScriptRecord, "hook" | "body" | "cta">;

const SEGMENT_META: { key: keyof Segments; label: string }[] = [
  { key: "hook", label: "Hook" },
  { key: "body", label: "Body" },
  { key: "cta", label: "Call to action" },
];

export function UgcScriptCard({
  script,
  onSave,
  onRegenerate,
  busy,
}: {
  script: UgcScriptRecord;
  onSave: (segments: Segments) => Promise<void> | void;
  onRegenerate: () => void;
  busy?: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<Segments>({
    hook: script.hook,
    body: script.body,
    cta: script.cta,
  });
  const [saving, setSaving] = useState(false);

  const startEdit = () => {
    setDraft({ hook: script.hook, body: script.body, cta: script.cta });
    setEditing(true);
  };

  const save = async () => {
    setSaving(true);
    try {
      await onSave(draft);
      setEditing(false);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="rounded-xl border border-border bg-card p-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-sm font-medium text-foreground">Your script</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Here&apos;s what your customer would say. Tweak it or ask for a new take.
          </p>
        </div>
        <span className="shrink-0 rounded-full bg-accent px-2.5 py-1 text-xs text-muted-foreground">
          ~{Math.round(script.estimatedSeconds)}s · {script.wordCount} words
        </span>
      </div>

      <div className="mt-4 space-y-3">
        {SEGMENT_META.map(({ key, label }) => (
          <div key={key}>
            <p className="mb-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              {label}
            </p>
            {editing ? (
              <Textarea
                value={draft[key]}
                onChange={(e) => setDraft((d) => ({ ...d, [key]: e.target.value }))}
                rows={2}
                aria-label={label}
              />
            ) : (
              <p className="text-sm leading-relaxed text-foreground">{script[key]}</p>
            )}
          </div>
        ))}
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        {editing ? (
          <>
            <Button
              size="sm"
              className="rounded-lg"
              onClick={save}
              disabled={saving || !draft.hook.trim() || !draft.body.trim() || !draft.cta.trim()}
            >
              <Check className="mr-1.5 h-4 w-4" strokeWidth={1.5} /> Save
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="rounded-lg"
              onClick={() => setEditing(false)}
              disabled={saving}
            >
              <X className="mr-1.5 h-4 w-4" strokeWidth={1.5} /> Cancel
            </Button>
          </>
        ) : (
          <>
            <Button
              size="sm"
              variant="outline"
              className="rounded-lg"
              onClick={startEdit}
              disabled={busy}
            >
              <Pencil className="mr-1.5 h-4 w-4" strokeWidth={1.5} /> Edit
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="rounded-lg"
              onClick={onRegenerate}
              disabled={busy}
            >
              <RotateCcw className="mr-1.5 h-4 w-4" strokeWidth={1.5} /> New take
            </Button>
          </>
        )}
      </div>
    </div>
  );
}
