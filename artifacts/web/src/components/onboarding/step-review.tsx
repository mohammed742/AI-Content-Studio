"use client";

import { Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  BRAND_TONE_OPTIONS,
  BUSINESS_TYPE_OPTIONS,
  PLATFORM_OPTIONS,
  type OnboardingFormState,
} from "./onboarding-data";

interface StepReviewProps {
  form: OnboardingFormState;
  onEditStep: (step: number) => void;
}

interface ReviewSectionProps {
  title: string;
  step: number;
  onEditStep: (step: number) => void;
  children: React.ReactNode;
}

function ReviewSection({
  title,
  step,
  onEditStep,
  children,
}: ReviewSectionProps) {
  return (
    <div className="space-y-2 border-t border-zinc-800 py-4 first:border-t-0 first:pt-0">
      <div className="flex items-center justify-between">
        <h3 className="text-base font-medium">{title}</h3>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-8 gap-1.5 rounded-lg text-zinc-400 hover:text-zinc-50"
          onClick={() => onEditStep(step)}
        >
          <Pencil strokeWidth={1.5} className="h-3.5 w-3.5" />
          Edit
        </Button>
      </div>
      {children}
    </div>
  );
}

function Missing({ label }: { label: string }) {
  return <p className="text-sm italic text-zinc-500">{label}</p>;
}

export function StepReview({ form, onEditStep }: StepReviewProps) {
  const businessType = BUSINESS_TYPE_OPTIONS.find(
    (o) => o.value === form.businessType,
  );
  const brandTone = BRAND_TONE_OPTIONS.find((o) => o.value === form.brandTone);
  const platforms = PLATFORM_OPTIONS.filter((o) =>
    form.socialPlatforms.includes(o.value),
  );
  const products = form.products.filter((p) => p.name.trim().length > 0);

  return (
    <div className="space-y-2">
      <p className="max-w-[65ch] pb-4 text-sm leading-relaxed text-zinc-400">
        Here&apos;s everything we&apos;ll use to generate your content. Review
        and edit anything before submitting.
      </p>

      <ReviewSection title="Business" step={1} onEditStep={onEditStep}>
        <p className="text-sm text-zinc-300">
          {form.businessName || <Missing label="No name set" />}
        </p>
        <p className="text-sm text-zinc-400">
          {businessType ? businessType.label : "No type selected"}
        </p>
      </ReviewSection>

      <ReviewSection
        title="Products & Services"
        step={2}
        onEditStep={onEditStep}
      >
        {products.length > 0 ? (
          <ul className="space-y-1">
            {products.map((p, i) => (
              <li key={i} className="text-sm text-zinc-300">
                {p.name}
                {p.description.trim() && (
                  <span className="text-zinc-500"> — {p.description}</span>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <Missing label="No products added" />
        )}
      </ReviewSection>

      <ReviewSection title="Target Customers" step={3} onEditStep={onEditStep}>
        {form.targetCustomers.trim() ? (
          <p className="max-w-[65ch] text-sm leading-relaxed text-zinc-300">
            {form.targetCustomers}
          </p>
        ) : (
          <Missing label="Not described" />
        )}
      </ReviewSection>

      <ReviewSection title="Brand Identity" step={4} onEditStep={onEditStep}>
        {form.logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={form.logoUrl}
            alt="Business logo"
            className="h-14 w-14 rounded-lg border border-zinc-800 bg-zinc-900/50 object-contain p-1.5"
          />
        ) : (
          <Missing label="No logo uploaded" />
        )}
        <p className="text-sm text-zinc-300">
          Tone: {brandTone ? brandTone.label : "Not selected"}
        </p>
        {form.brandColors.length > 0 ? (
          <div className="flex flex-wrap items-center gap-2 pt-1">
            {form.brandColors.map((color) => (
              <span
                key={color}
                className="flex items-center gap-1.5 rounded-lg border border-zinc-800 px-2 py-1"
              >
                <span
                  className="h-4 w-4 rounded border border-zinc-700"
                  style={{ backgroundColor: color }}
                  aria-hidden
                />
                <span className="font-mono text-xs text-zinc-400">
                  {color}
                </span>
              </span>
            ))}
          </div>
        ) : (
          <Missing label="No colors picked" />
        )}
      </ReviewSection>

      <ReviewSection title="Social Platforms" step={5} onEditStep={onEditStep}>
        {platforms.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            {platforms.map((p) => {
              const Icon = p.icon;
              return (
                <span
                  key={p.value}
                  className="flex items-center gap-1.5 rounded-lg border border-zinc-800 px-2.5 py-1 text-sm text-zinc-300"
                >
                  <Icon strokeWidth={1.5} className="h-4 w-4 text-zinc-400" />
                  {p.label}
                </span>
              );
            })}
          </div>
        ) : (
          <Missing label="No platforms selected" />
        )}
      </ReviewSection>
    </div>
  );
}
