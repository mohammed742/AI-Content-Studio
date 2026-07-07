"use client";

/**
 * DEV-12: "Suggested for you" panel. Appears in Step 1 as soon as a business
 * type is picked, showing the matching Industry Template's recommended brand
 * tone (auto-applied to Step 4, still editable), a set of content ideas, and
 * how often to post.
 */
import { motion } from "framer-motion";
import { Sparkles } from "lucide-react";
import {
  CONTENT_TYPE_LABELS,
  INDUSTRY_TEMPLATES,
} from "@/lib/industry-templates";
import type { InsertBusinessProfile } from "@/db/schema";
import { BRAND_TONE_OPTIONS } from "./onboarding-data";

interface SuggestedForYouProps {
  businessType: InsertBusinessProfile["businessType"];
}

export function SuggestedForYou({ businessType }: SuggestedForYouProps) {
  const template = INDUSTRY_TEMPLATES[businessType];
  const recommendedTone = template.recommendedTones[0];
  const toneLabel =
    BRAND_TONE_OPTIONS.find((t) => t.value === recommendedTone)?.label ??
    recommendedTone;
  const { postsPerWeek } = template.postingSchedule;

  return (
    <motion.div
      key={businessType}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2, ease: "easeOut" }}
      className="space-y-4 rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-4"
      aria-live="polite"
    >
      <div className="flex items-center gap-2">
        <Sparkles strokeWidth={1.5} className="h-4 w-4 text-emerald-400" />
        <span className="text-sm font-medium text-emerald-300">
          Suggested for you
        </span>
      </div>

      <div className="space-y-1.5">
        <p className="text-xs uppercase tracking-wide text-zinc-500">
          Recommended brand tone
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-full border border-emerald-500/40 bg-emerald-500/10 px-3 py-1 text-sm font-medium text-emerald-200">
            {toneLabel}
          </span>
          <span className="text-xs text-zinc-500">
            Filled in for you — change it any time in the Brand step.
          </span>
        </div>
      </div>

      <div className="space-y-1.5">
        <p className="text-xs uppercase tracking-wide text-zinc-500">
          Content ideas
        </p>
        <div className="flex flex-wrap gap-2">
          {template.suggestedContentTypes.map((contentType) => (
            <span
              key={contentType}
              className="rounded-full border border-zinc-700 bg-zinc-900/60 px-3 py-1 text-xs text-zinc-300"
            >
              {CONTENT_TYPE_LABELS[contentType]}
            </span>
          ))}
        </div>
      </div>

      <div className="space-y-1.5">
        <p className="text-xs uppercase tracking-wide text-zinc-500">
          How often to post
        </p>
        <p className="text-sm text-zinc-300">
          About{" "}
          <span className="font-medium text-zinc-100">
            {postsPerWeek} posts
          </span>{" "}
          a week to stay consistent.
        </p>
      </div>
    </motion.div>
  );
}
