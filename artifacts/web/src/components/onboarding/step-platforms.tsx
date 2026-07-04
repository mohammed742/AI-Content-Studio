"use client";

import { Check } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  PLATFORM_OPTIONS,
  type OnboardingFormState,
} from "./onboarding-data";

interface StepPlatformsProps {
  form: OnboardingFormState;
  onChange: (patch: Partial<OnboardingFormState>) => void;
}

export function StepPlatforms({ form, onChange }: StepPlatformsProps) {
  const togglePlatform = (value: string) => {
    const socialPlatforms = form.socialPlatforms.includes(value)
      ? form.socialPlatforms.filter((p) => p !== value)
      : [...form.socialPlatforms, value];
    onChange({ socialPlatforms });
  };

  return (
    <div className="space-y-6">
      <p className="max-w-[65ch] text-sm leading-relaxed text-zinc-400">
        Where do you want to publish? We&apos;ll format every piece of content
        for the platforms you pick. You can connect accounts later.
      </p>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {PLATFORM_OPTIONS.map((option) => {
          const Icon = option.icon;
          const selected = form.socialPlatforms.includes(option.value);
          return (
            <button
              key={option.value}
              type="button"
              role="checkbox"
              aria-checked={selected}
              onClick={() => togglePlatform(option.value)}
              className={cn(
                "relative flex flex-col items-start gap-2 rounded-xl border p-4 text-left transition-all",
                "hover:-translate-y-[2px] hover:shadow-md active:scale-[0.98]",
                selected
                  ? "border-emerald-500 bg-emerald-500/10 ring-1 ring-emerald-500"
                  : "border-zinc-800 bg-zinc-900/50 hover:border-zinc-700",
              )}
            >
              <span
                className={cn(
                  "absolute right-3 top-3 flex h-5 w-5 items-center justify-center rounded-full border transition-colors",
                  selected
                    ? "border-emerald-500 bg-emerald-500 text-zinc-950"
                    : "border-zinc-700",
                )}
              >
                {selected && (
                  <Check strokeWidth={2.5} className="h-3.5 w-3.5" />
                )}
              </span>
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
  );
}
