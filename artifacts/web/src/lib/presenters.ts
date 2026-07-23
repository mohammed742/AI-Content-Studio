/**
 * STU-C7 (DEV-64): Presenter Library — the catalogue of stock presenters the
 * agent picks from when producing UGC-style video ads (Phase 3 lip-sync). See
 * CONTEXT.md → "Presenter", "Presenter Library", "Audience Tag" and DESIGN §9.6
 * (the agent pre-selects the best-matching presenter by brand audience).
 *
 * JSON-only MVP (no `presenters` DB table this slice): the data is a typed
 * const here, following the codebase's TS-data convention (seasonal.ts,
 * industry-templates.ts) rather than the plan's literal `data/presenters.json`
 * — types + testability with zero deps, and no `@/`-alias / JSON value-import
 * quirks in the Node test runner.
 *
 * Portraits: `imageUrl` points at self-contained SVG placeholders in
 * `public/presenters/` (reproducible via `scripts/seed-presenter-placeholders.mjs`).
 * Real, rights-cleared, lip-sync-ready portraits are a Phase-3 carryover — swap
 * the files (or repoint `imageUrl` at R2) without touching this module's shape.
 */

/** Presenter gender, used by the agent to match brand audience + variety. */
export type PresenterGender = "female" | "male" | "nonbinary";

/**
 * Audience Tag — a coarse brand-audience descriptor (CONTEXT.md). Presenters
 * carry the tags they read well for; the Presenter Library filters on them and
 * Phase 3 uses them to pre-select a presenter for the business's audience.
 */
export type AudienceTag =
  | "young-professionals"
  | "families"
  | "students"
  | "fitness-enthusiasts"
  | "beauty-wellness"
  | "luxury-shoppers"
  | "trend-followers"
  | "homeowners"
  | "entrepreneurs"
  | "foodies";

/** Catalog of audience tags with human-readable labels for the filter UI. */
export const AUDIENCE_TAGS: ReadonlyArray<{ value: AudienceTag; label: string }> = [
  { value: "young-professionals", label: "Young professionals" },
  { value: "families", label: "Families" },
  { value: "students", label: "Students" },
  { value: "fitness-enthusiasts", label: "Fitness enthusiasts" },
  { value: "beauty-wellness", label: "Beauty & wellness" },
  { value: "luxury-shoppers", label: "Luxury shoppers" },
  { value: "trend-followers", label: "Trend followers" },
  { value: "homeowners", label: "Homeowners" },
  { value: "entrepreneurs", label: "Entrepreneurs" },
  { value: "foodies", label: "Foodies" },
];

/** A stock presenter available to the UGC video pipeline. */
export interface Presenter {
  id: string;
  name: string;
  /** Portrait image (placeholder SVG in `public/presenters/` for now). */
  imageUrl: string;
  gender: PresenterGender;
  /** Human-readable age bracket, e.g. "25-34". */
  ageRange: string;
  /** Short on-camera style descriptor, e.g. "Warm & approachable". */
  style: string;
  /** Brand audiences this presenter reads well for. */
  targetAudienceTags: AudienceTag[];
}

/**
 * The presenter roster. Diverse across gender / age / style so the agent can
 * match most SMB audiences. 10 presenters, every AUDIENCE_TAG represented.
 */
export const PRESENTERS: readonly Presenter[] = [
  {
    id: "maya-chen",
    name: "Maya Chen",
    imageUrl: "/presenters/maya-chen.svg",
    gender: "female",
    ageRange: "25-34",
    style: "Warm & approachable",
    targetAudienceTags: ["young-professionals", "beauty-wellness", "foodies"],
  },
  {
    id: "jordan-ellis",
    name: "Jordan Ellis",
    imageUrl: "/presenters/jordan-ellis.svg",
    gender: "nonbinary",
    ageRange: "25-34",
    style: "Energetic & bold",
    targetAudienceTags: ["trend-followers", "fitness-enthusiasts", "students"],
  },
  {
    id: "sofia-ramirez",
    name: "Sofia Ramirez",
    imageUrl: "/presenters/sofia-ramirez.svg",
    gender: "female",
    ageRange: "35-44",
    style: "Confident & polished",
    targetAudienceTags: ["luxury-shoppers", "homeowners", "entrepreneurs"],
  },
  {
    id: "marcus-bell",
    name: "Marcus Bell",
    imageUrl: "/presenters/marcus-bell.svg",
    gender: "male",
    ageRange: "25-34",
    style: "Friendly & casual",
    targetAudienceTags: ["young-professionals", "foodies", "fitness-enthusiasts"],
  },
  {
    id: "aisha-khan",
    name: "Aisha Khan",
    imageUrl: "/presenters/aisha-khan.svg",
    gender: "female",
    ageRange: "18-24",
    style: "Upbeat & trendy",
    targetAudienceTags: ["students", "trend-followers", "beauty-wellness"],
  },
  {
    id: "david-park",
    name: "David Park",
    imageUrl: "/presenters/david-park.svg",
    gender: "male",
    ageRange: "45-54",
    style: "Trustworthy & authoritative",
    targetAudienceTags: ["homeowners", "entrepreneurs", "families"],
  },
  {
    id: "chloe-bennett",
    name: "Chloe Bennett",
    imageUrl: "/presenters/chloe-bennett.svg",
    gender: "female",
    ageRange: "25-34",
    style: "Calm & wellness-focused",
    targetAudienceTags: ["beauty-wellness", "fitness-enthusiasts", "young-professionals"],
  },
  {
    id: "liam-oconnor",
    name: "Liam O'Connor",
    imageUrl: "/presenters/liam-oconnor.svg",
    gender: "male",
    ageRange: "18-24",
    style: "Playful & relatable",
    targetAudienceTags: ["students", "trend-followers", "foodies"],
  },
  {
    id: "grace-adeyemi",
    name: "Grace Adeyemi",
    imageUrl: "/presenters/grace-adeyemi.svg",
    gender: "female",
    ageRange: "35-44",
    style: "Elegant & aspirational",
    targetAudienceTags: ["luxury-shoppers", "beauty-wellness", "homeowners"],
  },
  {
    id: "ethan-turner",
    name: "Ethan Turner",
    imageUrl: "/presenters/ethan-turner.svg",
    gender: "male",
    ageRange: "35-44",
    style: "Energetic & motivational",
    targetAudienceTags: ["fitness-enthusiasts", "entrepreneurs", "families"],
  },
];

/** All presenters, in catalogue order. */
export function listPresenters(): readonly Presenter[] {
  return PRESENTERS;
}

/**
 * Presenters matching the selected audience tags. An empty selection returns
 * everyone; otherwise a presenter matches if it carries ANY selected tag
 * (union) — broadening the filter surfaces more candidates, which is what the
 * "pick a presenter for my audience" flow wants.
 */
export function filterPresentersByTags(
  presenters: readonly Presenter[],
  tags: readonly AudienceTag[],
): Presenter[] {
  if (tags.length === 0) return [...presenters];
  return presenters.filter((p) =>
    tags.some((t) => p.targetAudienceTags.includes(t)),
  );
}

/** How many presenters carry each audience tag (for filter-pill counts). */
export function audienceTagCounts(
  presenters: readonly Presenter[] = PRESENTERS,
): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const p of presenters) {
    for (const tag of p.targetAudienceTags) {
      counts[tag] = (counts[tag] ?? 0) + 1;
    }
  }
  return counts;
}
