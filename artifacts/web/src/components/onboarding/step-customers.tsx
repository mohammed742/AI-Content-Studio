"use client";

import { cn } from "@/lib/utils";
import { INDUSTRY_TEMPLATES } from "@/lib/industry-templates";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { OnboardingFormState } from "./onboarding-data";

interface StepCustomersProps {
  form: OnboardingFormState;
  onChange: (patch: Partial<OnboardingFormState>) => void;
}

export function StepCustomers({ form, onChange }: StepCustomersProps) {
  // AI-suggested customer personas for the chosen industry (DESIGN.md §9.3).
  // Click one to accept it, or type a custom description.
  const personas = form.businessType
    ? INDUSTRY_TEMPLATES[form.businessType].sampleTargetCustomers
    : [];

  return (
    <div className="space-y-6">
      <p className="max-w-[65ch] text-sm leading-relaxed text-zinc-400">
        Describe your ideal customers — age range, interests, lifestyle,
        location. The more specific, the more on-target your content will be.
      </p>

      <div className="space-y-2">
        <Label htmlFor="targetCustomers">Who are your ideal customers?</Label>
        <Textarea
          id="targetCustomers"
          placeholder="e.g. Local families, remote workers looking for a cozy spot, and coffee enthusiasts aged 25-45."
          value={form.targetCustomers}
          onChange={(e) => onChange({ targetCustomers: e.target.value })}
          rows={5}
          maxLength={1000}
        />
        <p className="text-xs text-zinc-500">
          Optional, but strongly recommended — this shapes the voice and
          targeting of every post.
        </p>
      </div>

      {personas.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs uppercase tracking-wide text-zinc-500">
            Suggested personas — tap one to use it
          </p>
          <div className="flex flex-col gap-2">
            {personas.map((persona) => {
              const selected = form.targetCustomers.trim() === persona.trim();
              return (
                <button
                  key={persona}
                  type="button"
                  onClick={() => onChange({ targetCustomers: persona })}
                  aria-pressed={selected}
                  className={cn(
                    "rounded-lg border p-3 text-left text-sm leading-relaxed transition-all",
                    selected
                      ? "border-emerald-500 bg-emerald-500/10 text-zinc-200 ring-1 ring-emerald-500"
                      : "border-zinc-800 bg-zinc-900/50 text-zinc-400 hover:border-zinc-700",
                  )}
                >
                  {persona}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
