"use client";

import { useRef, useState } from "react";
import { ImagePlus, Loader2, Plus, X } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { extractDominantColors } from "@/lib/extract-colors";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  BRAND_TONE_OPTIONS,
  type OnboardingFormState,
} from "./onboarding-data";

const MAX_BRAND_COLORS = 6;
const ACCEPTED_LOGO_TYPES = "image/png,image/jpeg,image/jpg,image/svg+xml";
const MAX_LOGO_BYTES = 5 * 1024 * 1024; // matches /api/upload/logo

interface StepBrandProps {
  form: OnboardingFormState;
  onChange: (
    patch:
      | Partial<OnboardingFormState>
      | ((prev: OnboardingFormState) => Partial<OnboardingFormState>),
  ) => void;
}

export function StepBrand({ form, onChange }: StepBrandProps) {
  const colorInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  const addColor = (color: string) => {
    const normalized = color.toLowerCase();
    if (form.brandColors.includes(normalized)) return;
    if (form.brandColors.length >= MAX_BRAND_COLORS) return;
    onChange({ brandColors: [...form.brandColors, normalized] });
  };

  const removeColor = (color: string) => {
    onChange({ brandColors: form.brandColors.filter((c) => c !== color) });
  };

  const handleLogoFile = async (file: File) => {
    if (!ACCEPTED_LOGO_TYPES.split(",").includes(file.type)) {
      toast.error("Logo must be a PNG, JPG, or SVG image");
      return;
    }
    if (file.size > MAX_LOGO_BYTES) {
      toast.error("Logo must be 5 MB or smaller");
      return;
    }

    setUploading(true);
    try {
      // Color extraction is local and independent of the upload — if it
      // fails (e.g. an unusual SVG), the upload still proceeds.
      const colorPromise = extractDominantColors(file, MAX_BRAND_COLORS).catch(
        () => null,
      );

      const body = new FormData();
      body.append("file", file);
      const res = await fetch("/api/upload/logo", { method: "POST", body });
      const json = (await res.json()) as {
        data: { url: string } | null;
        error: unknown;
      };
      if (!res.ok || !json.data) {
        throw new Error(
          typeof json.error === "string"
            ? json.error
            : "Upload failed. Please try again.",
        );
      }

      const logoUrl = json.data.url;
      const extracted = await colorPromise;

      // Merge against the LATEST form state (functional update) so any
      // colors the user added/removed while the upload was in flight
      // are preserved instead of being overwritten.
      onChange((prev) => {
        if (!extracted || extracted.length === 0) {
          return { logoUrl };
        }
        const merged = [...prev.brandColors];
        for (const color of extracted) {
          if (merged.length >= MAX_BRAND_COLORS) break;
          if (!merged.includes(color)) merged.push(color);
        }
        return { logoUrl, brandColors: merged };
      });

      if (extracted && extracted.length > 0) {
        toast.success(
          `Logo uploaded — found ${extracted.length} brand color${extracted.length === 1 ? "" : "s"}. Adjust them below.`,
        );
      } else {
        toast.success(
          "Logo uploaded. We couldn't detect colors automatically — add them below.",
        );
      }
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Something went wrong";
      toast.error(`Couldn't upload your logo: ${message}`);
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  return (
    <div className="space-y-8">
      <div className="space-y-3">
        <Label>Logo</Label>
        <p className="max-w-[65ch] text-sm leading-relaxed text-zinc-400">
          Upload your logo (PNG, JPG, or SVG — max 5 MB). We&apos;ll pull your
          brand colors from it automatically.
        </p>
        <input
          ref={fileInputRef}
          type="file"
          accept={ACCEPTED_LOGO_TYPES}
          className="hidden"
          tabIndex={-1}
          aria-hidden="true"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void handleLogoFile(file);
          }}
        />
        <div className="flex items-center gap-4">
          {form.logoUrl ? (
            <div className="group relative">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={form.logoUrl}
                alt="Uploaded logo"
                className="h-20 w-20 rounded-xl border border-zinc-800 bg-zinc-900/50 object-contain p-2"
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="absolute -right-2 -top-2 h-6 w-6 rounded-full border border-zinc-700 bg-zinc-900 text-zinc-400 hover:text-red-400"
                aria-label="Remove logo"
                onClick={() => onChange({ logoUrl: null })}
              >
                <X strokeWidth={1.5} className="h-3.5 w-3.5" />
              </Button>
            </div>
          ) : (
            <Button
              type="button"
              variant="outline"
              className="h-20 w-full max-w-xs rounded-xl border-dashed"
              disabled={uploading}
              onClick={() => fileInputRef.current?.click()}
            >
              {uploading ? (
                <>
                  <Loader2
                    strokeWidth={1.5}
                    className="h-4 w-4 animate-spin"
                  />
                  Uploading...
                </>
              ) : (
                <>
                  <ImagePlus strokeWidth={1.5} className="h-4 w-4" />
                  Upload logo
                </>
              )}
            </Button>
          )}
          {form.logoUrl && (
            <Button
              type="button"
              variant="outline"
              className="rounded-lg"
              disabled={uploading}
              onClick={() => fileInputRef.current?.click()}
            >
              {uploading ? (
                <Loader2 strokeWidth={1.5} className="h-4 w-4 animate-spin" />
              ) : (
                "Replace"
              )}
            </Button>
          )}
        </div>
      </div>

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
          Up to {MAX_BRAND_COLORS} colors used in your branding. Colors
          detected from your logo appear here — remove any that don&apos;t
          fit, or add your own.
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
