import {
  boolean,
  doublePrecision,
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  vector,
} from "drizzle-orm/pg-core";
import { z } from "zod";

export const users = pgTable("users", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  clerkId: text("clerk_id").notNull().unique(),
  email: text("email").notNull(),
  name: text("name"),
  imageUrl: text("image_url"),
  role: text("role", { enum: ["user", "admin"] })
    .notNull()
    .default("user"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export const insertUserSchema = z.object({
  clerkId: z.string().min(1),
  email: z.string().email(),
  name: z.string().optional(),
  imageUrl: z.string().optional(),
  role: z.enum(["user", "admin"]).default("user"),
});

export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;

// Business Type — see CONTEXT.md "Business Type": industry category that
// determines content templates and recommended posting schedules.
export const BUSINESS_TYPES = [
  "restaurant",
  "e-commerce",
  "salon",
  "gym",
  "real_estate",
  "fashion",
  "freelancer",
  "other",
] as const;

// Brand Tone — see CONTEXT.md "Business Profile"; injected into every
// generation prompt via Brand Conditioning.
export const BRAND_TONES = [
  "professional",
  "friendly",
  "playful",
  "luxury",
  "bold",
] as const;

export const productSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  price: z.string().optional(),
});

export type Product = z.infer<typeof productSchema>;

export const businessProfiles = pgTable("business_profiles", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  userId: text("user_id")
    .notNull()
    .unique()
    .references(() => users.id, { onDelete: "cascade" }),
  businessName: text("business_name").notNull(),
  businessType: text("business_type", { enum: BUSINESS_TYPES }).notNull(),
  products: jsonb("products").$type<Product[]>().notNull().default([]),
  targetCustomers: text("target_customers"),
  brandColors: jsonb("brand_colors").$type<string[]>().notNull().default([]),
  brandTone: text("brand_tone", { enum: BRAND_TONES }).notNull(),
  logoUrl: text("logo_url"),
  socialPlatforms: jsonb("social_platforms")
    .$type<string[]>()
    .notNull()
    .default([]),
  industry: text("industry"),
  website: text("website"),
  // DEV-12: which Industry Template (CONTEXT.md) seeded this profile during
  // onboarding. Nullable — profiles created directly via the API (not the
  // wizard) have no preset. Phase 2 content suggestions build on it.
  industryPreset: text("industry_preset", { enum: BUSINESS_TYPES }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

const hexColor = z
  .string()
  .regex(/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/, "Must be a hex color");

export const insertBusinessProfileSchema = z.object({
  businessName: z.string().min(1, "businessName is required"),
  businessType: z.enum(BUSINESS_TYPES),
  products: z.array(productSchema).default([]),
  targetCustomers: z.string().optional(),
  brandColors: z.array(hexColor).default([]),
  brandTone: z.enum(BRAND_TONES),
  logoUrl: z.string().url().optional(),
  socialPlatforms: z.array(z.string().min(1)).default([]),
  industry: z.string().optional(),
  website: z.string().url().optional(),
  industryPreset: z.enum(BUSINESS_TYPES).optional(),
});

export const updateBusinessProfileSchema =
  insertBusinessProfileSchema.partial();

export type InsertBusinessProfile = z.infer<
  typeof insertBusinessProfileSchema
>;
export type UpdateBusinessProfile = z.infer<
  typeof updateBusinessProfileSchema
>;
export type BusinessProfile = typeof businessProfiles.$inferSelect;

// DEV-17: Brand Knowledge Base (CONTEXT.md → "Brand Knowledge Base").
// A per-user pgvector store of embedded brand data. Queried during the
// Retrieve step of the Agent Loop (DEV-16) to condition generations on the
// most relevant brand context. `kind` records what a chunk came from so a
// sync can replace only profile-derived rows without touching later
// generation/edit embeddings.
export const EMBEDDING_KINDS = [
  "product",
  "brand_guideline",
  "generation",
  "caption_edit",
] as const;

// OpenAI text-embedding-3-small output size (CONTEXT.md → "Embedding").
export const EMBEDDING_DIMENSIONS = 1536;

export const brandEmbeddings = pgTable(
  "brand_embeddings",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    kind: text("kind", { enum: EMBEDDING_KINDS }).notNull(),
    // The exact text that was embedded — kept for retrieval + debugging.
    content: text("content").notNull(),
    embedding: vector("embedding", {
      dimensions: EMBEDDING_DIMENSIONS,
    }).notNull(),
    // Optional pointer back to the source (e.g. a product name) for dedup.
    sourceId: text("source_id"),
    metadata: jsonb("metadata").$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    index("brand_embeddings_user_id_idx").on(table.userId),
    // Approximate-nearest-neighbour index for cosine similarity search.
    index("brand_embeddings_embedding_idx").using(
      "hnsw",
      table.embedding.op("vector_cosine_ops"),
    ),
  ],
);

export type BrandEmbedding = typeof brandEmbeddings.$inferSelect;
export type InsertBrandEmbedding = typeof brandEmbeddings.$inferInsert;

// DEV-23: Asset Kit (CONTEXT.md) — a complete, ready-to-publish content unit:
// media + caption + hashtags + platform metadata. The atomic output of the
// generation pipeline (Assemble step). Media lives in R2 (`mediaUrl`), never
// a third-party URL (DEV-8 lesson: Muapi URLs aren't trusted to stay alive).
export const CONTENT_TYPES = [
  "product_showcase",
  "tip",
  "behind_the_scenes",
  "promo",
  "testimonial",
  "ugc_ad",
  "seasonal",
  "engagement",
] as const;

export const MEDIA_TYPES = ["image", "video"] as const;
export type MediaType = (typeof MEDIA_TYPES)[number];

// STU-C5 (DEV-67): Carousel (CONTEXT.md → "Carousel") — an Asset Kit that
// carries an ordered array of media frames instead of a single image, sharing
// one caption/hashtag set (how-to guides, process breakdowns, style guides,
// lookbooks). One frame in the ordered `media` array below; the frame-count
// bounds live with the assembly service (`@/lib/carousel`).
export interface AssetKitMedia {
  /** Public R2 URL of this frame. */
  url: string;
  mediaType: MediaType;
  /**
   * Optional aspect-ratio label (e.g. "9:16"). Set by the UGC pipeline (DEV-33)
   * so a multi-format video kit's Result tabs know which variant is which;
   * unset for image carousels (STU-C5) / composites, which are order-only.
   */
  aspectRatio?: string;
}

// draft → ready now; published set by Social Publishing (Phase 4/5).
export const ASSET_KIT_STATUSES = ["draft", "ready", "published"] as const;

export const assetKits = pgTable(
  "asset_kits",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    contentType: text("content_type", { enum: CONTENT_TYPES }).notNull(),
    platform: text("platform").notNull(),
    mediaUrl: text("media_url").notNull(),
    mediaType: text("media_type", { enum: MEDIA_TYPES }).notNull(),
    // STU-C5: ordered carousel frames. Empty `[]` = single-image kit (use
    // `mediaUrl`/`mediaType` above). When populated, `mediaUrl`/`mediaType`
    // mirror frame 0 (the cover) so gallery thumbnails need no special-casing.
    media: jsonb("media").$type<AssetKitMedia[]>().notNull().default([]),
    caption: text("caption").notNull(),
    hashtags: jsonb("hashtags").$type<string[]>().notNull().default([]),
    // Aggregate COGS across every model call that produced this kit (USD).
    cost: doublePrecision("cost").notNull().default(0),
    status: text("status", { enum: ASSET_KIT_STATUSES })
      .notNull()
      .default("ready"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [index("asset_kits_user_id_idx").on(table.userId)],
);

export type AssetKit = typeof assetKits.$inferSelect;
export type InsertAssetKit = typeof assetKits.$inferInsert;

// STU-C3 (DEV-62): Media Library (CONTEXT.md) — a user's own uploaded business
// photos, so image-to-image pipelines (product photo, before/after) have real
// source material. `source` distinguishes user uploads from media the app
// generated back into the library.
export const MEDIA_LIBRARY_SOURCES = ["upload", "generated"] as const;
export type MediaLibrarySource = (typeof MEDIA_LIBRARY_SOURCES)[number];

export const mediaLibrary = pgTable(
  "media_library",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    // R2 object key (the durable storage location) + its public URL.
    r2Key: text("r2_key").notNull(),
    mediaUrl: text("media_url").notNull(),
    // MIME type of the stored file (e.g. image/png).
    contentType: text("content_type").notNull(),
    // Optional user-supplied caption/label for the photo.
    label: text("label"),
    source: text("source", { enum: MEDIA_LIBRARY_SOURCES })
      .notNull()
      .default("upload"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [index("media_library_user_id_idx").on(table.userId)],
);

export type MediaLibraryItem = typeof mediaLibrary.$inferSelect;
export type InsertMediaLibraryItem = typeof mediaLibrary.$inferInsert;

// DEV-24: Content Plan (CONTEXT.md) — a proposed set of 5-7 content items for
// a week. Items live as jsonb on the plan row (an item is meaningless outside
// its plan); each carries its own generation status + resulting Asset Kit id.
export const CONTENT_PLAN_STATUSES = [
  "draft",
  "approved",
  "generating",
  "completed",
] as const;

export const PLAN_ITEM_STATUSES = [
  "pending",
  "generating",
  "completed",
  "failed",
] as const;

export interface ContentPlanItemRecord {
  id: string;
  type: (typeof CONTENT_TYPES)[number];
  title: string;
  description: string;
  platform: string;
  scheduledDay: string;
  estimatedCredits: number;
  status: (typeof PLAN_ITEM_STATUSES)[number];
  assetKitId?: string;
  /** Public URL of the generated media (set when completed). */
  mediaUrl?: string;
  error?: string | null;
}

export const contentPlans = pgTable(
  "content_plans",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    weekStart: timestamp("week_start", { withTimezone: true }).notNull(),
    status: text("status", { enum: CONTENT_PLAN_STATUSES })
      .notNull()
      .default("draft"),
    items: jsonb("items")
      .$type<ContentPlanItemRecord[]>()
      .notNull()
      .default([]),
    // Aggregate COGS across all generated items (USD).
    totalCost: doublePrecision("total_cost").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [index("content_plans_user_id_idx").on(table.userId)],
);

export type ContentPlanRow = typeof contentPlans.$inferSelect;
export type InsertContentPlan = typeof contentPlans.$inferInsert;

// DEV-26: Generation Feedback — a user's thumbs up/down on an Asset Kit
// ("Did this match your brand?"). One rating per user per kit (a re-tap
// updates it). Feeds the Performance Feedback Loop (DEV-25) so the agent
// proposes more of what works. CONTEXT.md → "Agent Eval".
export const FEEDBACK_RATINGS = ["up", "down"] as const;

export const generationFeedback = pgTable(
  "generation_feedback",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    assetKitId: text("asset_kit_id")
      .notNull()
      .references(() => assetKits.id, { onDelete: "cascade" }),
    rating: text("rating", { enum: FEEDBACK_RATINGS }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    // One rating per user per kit — a re-tap updates the same row.
    uniqueIndex("generation_feedback_user_kit_idx").on(
      table.userId,
      table.assetKitId,
    ),
  ],
);

export type GenerationFeedback = typeof generationFeedback.$inferSelect;
export type InsertGenerationFeedback = typeof generationFeedback.$inferInsert;
export type FeedbackRating = (typeof FEEDBACK_RATINGS)[number];

// DEV-25: Pipeline Log (CONTEXT.md) — one row per Agent Loop step (each Muapi
// generation, embedding, retrieval, plan, caption). Powers
// AgentEvalsService.getPipelineReliability() and the Admin panel (Phase 7).
// Global (no userId) — reliability metrics are operational, not per-user.
export const pipelineLogs = pgTable(
  "pipeline_logs",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    step: text("step").notNull(),
    model: text("model").notNull(),
    durationMs: doublePrecision("duration_ms").notNull(),
    success: boolean("success").notNull(),
    cost: doublePrecision("cost").notNull().default(0),
    error: text("error"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [index("pipeline_logs_step_idx").on(table.step)],
);

export type PipelineLog = typeof pipelineLogs.$inferSelect;
export type InsertPipelineLog = typeof pipelineLogs.$inferInsert;

// DEV-33: UGC Job (CONTEXT.md → "UGC Pipeline") — one UGC-style video ad build.
// Mirrors `content_plans`: the agent proposes a script + pre-selects a presenter
// (a `draft` job); the user reviews/edits; then the pipeline runs step-by-step
// (`generating` → `completed`/`failed`). The per-step status list AND each
// step's intermediate output URL live on the row so a failed step *resumes*
// from where it stopped rather than restarting the whole (2–5 min) pipeline.
export const UGC_JOB_STATUSES = [
  "draft",
  "generating",
  "completed",
  "failed",
] as const;

export const UGC_STEP_STATUSES = [
  "pending",
  "generating",
  "completed",
  "failed",
] as const;

// Ordered pipeline step keys. A job's actual step list is fixed at propose time
// (B-roll + assembly only appear when a product image is available), so retry
// resumes against a stable list.
export const UGC_STEP_KEYS = [
  "voiceover",
  "talking_head",
  "broll",
  "assembly",
  "reframe",
  "finalize",
] as const;
export type UgcStepKey = (typeof UGC_STEP_KEYS)[number];

/** One pipeline step's user-facing status (DESIGN §9.6 step 4 progress list). */
export interface UgcStepRecord {
  key: UgcStepKey;
  /** Friendly, no-jargon label shown to the user, e.g. "Writing the voiceover…". */
  label: string;
  status: (typeof UGC_STEP_STATUSES)[number];
  error?: string | null;
}

/** The reviewed/edited script stored on the job (DEV-27 `UgcScript`, sans cost). */
export interface UgcScriptRecord {
  hook: string;
  body: string;
  cta: string;
  /** hook + body + cta, in order — the voiceover step's input. */
  spokenText: string;
  wordCount: number;
  estimatedSeconds: number;
}

/**
 * Intermediate pipeline outputs, persisted so a retry resumes from the failed
 * step instead of re-running completed ones. `variants` are the reframed
 * per-format clips (still on Muapi URLs until `finalize` moves them to R2).
 */
export interface UgcJobOutputs {
  audioUrl?: string;
  talkingHeadUrl?: string;
  brollUrl?: string;
  masterUrl?: string;
  variants?: AssetKitMedia[];
  /** The finalized Asset Kit id (also mirrored to the `assetKitId` column). */
  assetKitId?: string;
}

export const ugcJobs = pgTable(
  "ugc_jobs",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    status: text("status", { enum: UGC_JOB_STATUSES }).notNull().default("draft"),
    // The product the ad reviews (from the Business Profile).
    productName: text("product_name").notNull(),
    // B-roll source photo (Media Library upload). Null → talking-head-only build.
    productImageUrl: text("product_image_url"),
    // The agent-pre-selected presenter id (`src/lib/presenters.ts`).
    presenterId: text("presenter_id").notNull(),
    script: jsonb("script").$type<UgcScriptRecord>().notNull(),
    steps: jsonb("steps").$type<UgcStepRecord[]>().notNull().default([]),
    outputs: jsonb("outputs").$type<UgcJobOutputs>().notNull().default({}),
    // The final multi-format Asset Kit (set when the job completes).
    assetKitId: text("asset_kit_id"),
    // Aggregate COGS across every model call (USD, hidden from the user).
    totalCost: doublePrecision("total_cost").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [index("ugc_jobs_user_id_idx").on(table.userId)],
);

export type UgcJobRow = typeof ugcJobs.$inferSelect;
export type InsertUgcJob = typeof ugcJobs.$inferInsert;

// DEV-35: Social Account (CONTEXT.md) — a social platform account the user has
// connected via Muapi's OAuth connect flow. Muapi holds the OAuth tokens; we
// store only the handle (`muapiAccountId`) the publish endpoints address.
// NOTE: `platform` is a string enum (youtube|tiktok|instagram), not the plan's
// "1/2/3" magic numbers — matches every other schema enum and the Muapi slugs.
export const SOCIAL_PLATFORMS = ["youtube", "tiktok", "instagram"] as const;
export type SocialPlatform = (typeof SOCIAL_PLATFORMS)[number];

export const socialAccounts = pgTable(
  "social_accounts",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    platform: text("platform", { enum: SOCIAL_PLATFORMS }).notNull(),
    // Muapi's account id (the `id` from GET /social/ext/accounts) — the handle
    // the publish endpoints take as `account_id`. Stored as text for id parity.
    muapiAccountId: text("muapi_account_id").notNull(),
    // Human-facing labels from Muapi: the platform display name + connected handle.
    platformName: text("platform_name").notNull(),
    accountName: text("account_name").notNull(),
    // DEV-34: optional user-set friendly label. You can't rename a real platform
    // handle via API, so "rename" is a local nickname. Display = nickname ??
    // accountName. Nullable + preserved across re-sync (syncAccounts never writes it).
    nickname: text("nickname"),
    connectedAt: timestamp("connected_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("social_accounts_user_id_idx").on(table.userId),
    // One row per (user, Muapi account) — re-syncing is idempotent.
    uniqueIndex("social_accounts_user_muapi_idx").on(
      table.userId,
      table.muapiAccountId,
    ),
  ],
);

export type SocialAccount = typeof socialAccounts.$inferSelect;
export type InsertSocialAccount = typeof socialAccounts.$inferInsert;

// DEV-36: Publish Job (CONTEXT.md) — one attempt to publish an Asset Kit to a
// connected social account through Muapi's `{platform}-publish` endpoint. Publish
// is a Muapi model slug ($0.01) with the same submit→poll async shape as
// generation, so a job carries the async `muapiRequestId` and advances
// processing → completed/failed as we poll.
//
// History-friendly: `assetKitId`/`socialAccountId` are `onDelete: set null` (the
// FIRST set-null refs in this schema — every other ref cascades) so disconnecting
// an account or deleting a kit never erases the publish record. The denormalized
// `title`/`mediaUrl` + `params` snapshot keep a row self-describing on its own.
export const PUBLISH_JOB_STATUSES = [
  "pending",
  "processing",
  "completed",
  "failed",
] as const;
export type PublishJobStatus = (typeof PUBLISH_JOB_STATUSES)[number];

/**
 * The exact body sent to Muapi's `{platform}-publish` endpoint, snapshotted on
 * the job so Retry (AC #3) resubmits identical parameters and history shows
 * precisely what was published. `account_id` is an integer on every platform.
 *
 * One variant per platform because the field sets differ materially (verified
 * live against each `{platform}-publish` model schema): YouTube takes a required
 * title + description/tags/privacy; TikTok takes an optional caption +
 * privacy_level + interaction toggles.
 */
export interface YouTubePublishParams {
  account_id: number;
  media_url: string;
  title: string;
  description?: string;
  tags?: string[];
  privacy?: string;
  category_id?: string;
  made_for_kids?: boolean;
}

/** TikTok's `tiktok-publish` body (verified DEV-37): title is the caption (≤150). */
export interface TikTokPublishParams {
  account_id: number;
  media_url: string;
  title?: string;
  privacy_level?: string;
  allow_comment?: boolean;
  allow_duet?: boolean;
  allow_stitch?: boolean;
  is_ai_generated?: boolean;
}

/**
 * Instagram's `instagram-publish` body (verified DEV-38): caption optional
 * (≤2200); placement is reels/stories/timeline; share_to_feed mirrors a Reel to
 * the main feed. Requires a Business/Creator account (enforced at connect time).
 */
export interface InstagramPublishParams {
  account_id: number;
  media_url: string;
  caption?: string;
  placement?: string;
  share_to_feed?: boolean;
}

/** The publish body snapshot — a per-platform union (see each variant above). */
export type PublishJobParams =
  | YouTubePublishParams
  | TikTokPublishParams
  | InstagramPublishParams;

export const publishJobs = pgTable(
  "publish_jobs",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    // SET NULL (not cascade): a deleted kit / disconnected account must not
    // delete the publish record. Nullable is required for set-null.
    assetKitId: text("asset_kit_id").references(() => assetKits.id, {
      onDelete: "set null",
    }),
    socialAccountId: text("social_account_id").references(
      () => socialAccounts.id,
      { onDelete: "set null" },
    ),
    platform: text("platform", { enum: SOCIAL_PLATFORMS }).notNull(),
    // Muapi's async request id from the submit call; null only if submit failed.
    muapiRequestId: text("muapi_request_id"),
    status: text("status", { enum: PUBLISH_JOB_STATUSES })
      .notNull()
      .default("processing"),
    // Denormalized so a row is self-describing after set-null wipes the refs.
    title: text("title").notNull(),
    mediaUrl: text("media_url").notNull(),
    // Exact publish params for Retry + audit.
    params: jsonb("params").$type<PublishJobParams>().notNull(),
    // The live post URL once completed.
    resultUrl: text("result_url"),
    error: text("error"),
    cost: doublePrecision("cost").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
  },
  (table) => [index("publish_jobs_user_id_idx").on(table.userId)],
);

export type PublishJob = typeof publishJobs.$inferSelect;
export type InsertPublishJob = typeof publishJobs.$inferInsert;

// DEV-40: Calendar Entry (CONTEXT.md → "Calendar Entry") — one scheduled piece
// of content on the Content Calendar. Auto-created from a Content Plan's items
// when the plan is approved (each item → one entry, placed on its concrete date
// = the plan's week_start Monday + the item's scheduledDay weekday offset).
//
// Refs use SET NULL like `publish_jobs`: deleting the source plan or Asset Kit
// must not erase the calendar row (it lives on as a "standalone" entry). The
// denormalized `platform`/`contentType`/`title`/`date` keep a row self-describing
// after a set-null. `platform` is free text (not SOCIAL_PLATFORMS): plan items
// use broader strings (e.g. "linkedin"); publishing (DEV-42) filters later.
export const CALENDAR_ENTRY_STATUSES = [
  "planned",
  "generated",
  "scheduled",
  "published",
  "failed",
] as const;
export type CalendarEntryStatus = (typeof CALENDAR_ENTRY_STATUSES)[number];

export const calendarEntries = pgTable(
  "calendar_entries",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    // SET NULL (not cascade): a deleted plan / kit leaves the entry standing as
    // a self-describing standalone row. Nullable is required for set-null.
    contentPlanId: text("content_plan_id").references(() => contentPlans.id, {
      onDelete: "set null",
    }),
    assetKitId: text("asset_kit_id").references(() => assetKits.id, {
      onDelete: "set null",
    }),
    // The source ContentPlanItemRecord.id — the idempotency key for auto-create.
    planItemId: text("plan_item_id"),
    // Concrete scheduled date (week_start + weekday offset), and time-of-day as
    // "HH:MM" (plan items carry no time; default 09:00, refined by drag-drop).
    date: timestamp("date", { withTimezone: true }).notNull(),
    time: text("time").notNull().default("09:00"),
    // Denormalized from the plan item so the row survives a set-null.
    platform: text("platform").notNull(),
    contentType: text("content_type", { enum: CONTENT_TYPES }).notNull(),
    title: text("title").notNull(),
    status: text("status", { enum: CALENDAR_ENTRY_STATUSES })
      .notNull()
      .default("planned"),
    // DEV-42: the Publish Job the scheduler submitted for this entry. SET NULL
    // like the refs above — a pruned job must not erase the calendar row. Its
    // presence is also what distinguishes a `scheduled` entry that is waiting
    // for its time (null) from one already in flight (set).
    publishJobId: text("publish_job_id").references(() => publishJobs.id, {
      onDelete: "set null",
    }),
    // DEV-42: set by the scheduler's claim-before-submit UPDATE. Two overlapping
    // cron runs would otherwise both submit the same due entry — two real posts,
    // two charges. Claiming on this column (rather than flipping `status`, which
    // is already `scheduled` by the time we get here) makes the loser's
    // conditional update return no row, so it skips.
    publishAttemptedAt: timestamp("publish_attempted_at", {
      withTimezone: true,
    }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    index("calendar_entries_user_id_idx").on(table.userId),
    // DEV-42: the scheduler's due-entry scan is the first query in the codebase
    // that runs across all users rather than within one, so it needs its own
    // index — `user_id` doesn't help it.
    index("calendar_entries_status_date_idx").on(table.status, table.date),
    // Idempotent auto-create: one entry per plan item, so re-approving a plan
    // (retry) never duplicates. NULL content_plan_id rows (orphaned standalone)
    // are treated as distinct by Postgres, which is the intended behavior.
    uniqueIndex("calendar_entries_plan_item_idx").on(
      table.contentPlanId,
      table.planItemId,
    ),
  ],
);

export type CalendarEntry = typeof calendarEntries.$inferSelect;
export type InsertCalendarEntry = typeof calendarEntries.$inferInsert;
