import { jsonb, pgTable, text, timestamp } from "drizzle-orm/pg-core";
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
