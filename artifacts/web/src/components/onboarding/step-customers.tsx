"use client";

import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { OnboardingFormState } from "./onboarding-data";

interface StepCustomersProps {
  form: OnboardingFormState;
  onChange: (patch: Partial<OnboardingFormState>) => void;
}

export function StepCustomers({ form, onChange }: StepCustomersProps) {
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
    </div>
  );
}
