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
