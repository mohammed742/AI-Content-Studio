"use client";

import { useRef } from "react";
import { Plus, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  BRAND_TONE_OPTIONS,
  type OnboardingFormState,
} from "./onboarding-data";

const MAX_BRAND_COLORS = 6;

interface StepBrandProps {
  form: OnboardingFormState;
  onChange: (patch: Partial<OnboardingFormState>) => void;
}

export function StepBrand({ form, onChange }: StepBrandProps) {
  const colorInputRef = useRef<HTMLInputElement>(null);

  const addColor = (color: string) => {
    const normalized = color.toLowerCase();
    if (form.brandColors.includes(normalized)) return;
    if (form.brandColors.length >= MAX_BRAND_COLORS) return;
    onChange({ brandColors: [...form.brandColors, normalized] });
  };

  const removeColor = (color: string) => {
    onChange({ brandColors: form.brandColors.filter((c) => c !== color) });
  };

  return (
    <div className="space-y-8">
      <div className="space-y-3">
        <Label>Brand tone</Label>
        <p className="max-w-[65ch] text-sm leading-relaxed text-zinc-400">
          How should your content sound? Each option shows a sample caption in
          that voice.
        </p>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {BRAND_TONE_OPTIONS.map((option) => {
            const selected = form.brandTone === option.value;
            return (
              <button
                key={option.value}
                type="button"
                onClick={() => onChange({ brandTone: option.value })}
                aria-pressed={selected}
                className={cn(
                  "flex flex-col gap-2 rounded-xl border p-4 text-left transition-all",
                  "hover:-translate-y-[2px] hover:shadow-md active:scale-[0.98]",
                  selected
                    ? "border-emerald-500 bg-emerald-500/10 ring-1 ring-emerald-500"
                    : "border-zinc-800 bg-zinc-900/50 hover:border-zinc-700",
                )}
              >
                <div className="flex items-center gap-2">
                  <span className="text-base font-medium">{option.label}</span>
                  <span className="text-xs text-zinc-500">
                    {option.description}
                  </span>
                </div>
                <p className="text-sm italic leading-relaxed text-zinc-400">
                  &ldquo;{option.preview}&rdquo;
                </p>
              </button>
            );
          })}
        </div>
      </div>

      <div className="space-y-3">
        <Label>Brand colors</Label>
        <p className="max-w-[65ch] text-sm leading-relaxed text-zinc-400">
          Pick up to {MAX_BRAND_COLORS} colors used in your branding. Optional
          — you can add these later. (Logo upload with automatic color
          detection is coming soon.)
        </p>
        <div className="flex flex-wrap items-center gap-3">
          {form.brandColors.map((color) => (
            <div
              key={color}
              className="group relative flex items-center gap-2 rounded-lg border border-zinc-800 bg-zinc-900/50 py-1.5 pl-2 pr-1"
            >
              <span
                className="h-6 w-6 rounded-md border border-zinc-700"
                style={{ backgroundColor: color }}
                aria-hidden
              />
              <span className="font-mono text-xs text-zinc-400">{color}</span>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-6 w-6 text-zinc-500 hover:text-red-400"
                onClick={() => removeColor(color)}
                aria-label={`Remove color ${color}`}
              >
                <X strokeWidth={1.5} className="h-3.5 w-3.5" />
              </Button>
            </div>
          ))}
          {form.brandColors.length < MAX_BRAND_COLORS && (
            <div className="relative">
              <input
                ref={colorInputRef}
                type="color"
                className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
                tabIndex={-1}
                aria-hidden="true"
                onChange={(e) => addColor(e.target.value)}
              />
              <Button
                type="button"
                variant="outline"
                className="relative z-10 rounded-lg"
                aria-label="Pick a brand color"
                onClick={() => colorInputRef.current?.click()}
              >
                <Plus strokeWidth={1.5} className="h-4 w-4" />
                Add color
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
