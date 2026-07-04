"use client";

import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  BUSINESS_TYPE_OPTIONS,
  type OnboardingFormState,
} from "./onboarding-data";

interface StepBusinessTypeProps {
  form: OnboardingFormState;
  onChange: (patch: Partial<OnboardingFormState>) => void;
}

export function StepBusinessType({ form, onChange }: StepBusinessTypeProps) {
  return (
    <div className="space-y-8">
      <div className="space-y-2">
        <Label htmlFor="businessName">Business name</Label>
        <Input
          id="businessName"
          placeholder="e.g. Sunrise Café"
          value={form.businessName}
          onChange={(e) => onChange({ businessName: e.target.value })}
          maxLength={120}
        />
        <p className="text-xs text-zinc-500">
          This appears in your captions and generated content.
        </p>
      </div>

      <div className="space-y-3">
        <Label>What kind of business is it?</Label>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {BUSINESS_TYPE_OPTIONS.map((option) => {
            const Icon = option.icon;
            const selected = form.businessType === option.value;
            return (
              <button
                key={option.value}
                type="button"
                onClick={() => onChange({ businessType: option.value })}
                aria-pressed={selected}
                className={cn(
                  "flex flex-col items-start gap-2 rounded-xl border p-4 text-left transition-all",
                  "hover:-translate-y-[2px] hover:shadow-md active:scale-[0.98]",
                  selected
                    ? "border-emerald-500 bg-emerald-500/10 ring-1 ring-emerald-500"
                    : "border-zinc-800 bg-zinc-900/50 hover:border-zinc-700",
                )}
              >
                <Icon
                  strokeWidth={1.5}
                  className={cn(
                    "h-6 w-6",
                    selected ? "text-emerald-400" : "text-zinc-400",
                  )}
                />
                <span className="text-base font-medium">{option.label}</span>
                <span className="text-xs text-zinc-500">
                  {option.description}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
