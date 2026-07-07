/**
 * DEV-12: Industry Template (CONTEXT.md) presets, one per Business Type
 * exposed in the onboarding wizard (`BUSINESS_TYPE_OPTIONS`). Selecting a
 * business type in Step 1 auto-populates Steps 2-5 with these defaults;
 * users can still override every field.
 *
 * Per plan-phase-1.md step 5, each template maps a business type to a
 * default brand tone, suggested content types, and a posting schedule —
 * plus starter products, sample target customers, and example hashtags to
 * seed the wizard. The content types + posting schedule are consumed later
 * by the Phase 2 ContentPlannerService (see CONTEXT.md "Industry Strategy").
 */
import type { InsertBusinessProfile } from "@/db/schema";
import type { ProductDraft } from "@/components/onboarding/onboarding-data";

/**
 * Content Type — see CONTEXT.md. The category of a single piece of content;
 * the same vocabulary the Content Calendar and Plan Steps use in Phase 2.
 */
export type ContentType =
  | "product_showcase"
  | "tip"
  | "behind_the_scenes"
  | "promo"
  | "testimonial"
  | "ugc_ad"
  | "seasonal"
  | "engagement";

/** Human-readable labels for the Content Type enum, for the onboarding UI. */
export const CONTENT_TYPE_LABELS: Record<ContentType, string> = {
  product_showcase: "Product showcase",
  tip: "Tips & how-tos",
  behind_the_scenes: "Behind the scenes",
  promo: "Promotions & offers",
  testimonial: "Customer testimonials",
  ugc_ad: "UGC-style video ads",
  seasonal: "Seasonal & holiday",
  engagement: "Engagement posts",
};

export type Weekday =
  | "monday"
  | "tuesday"
  | "wednesday"
  | "thursday"
  | "friday"
  | "saturday"
  | "sunday";

/** One slot in the weekly posting schedule: which content type on which day. */
export interface PostingSlot {
  day: Weekday;
  contentType: ContentType;
}

/**
 * Recommended posting cadence for a business type. `postsPerWeek` answers
 * "how often should I post"; `weeklyPlan` answers "what should I post on
 * which day" (CONTEXT.md "Industry Strategy").
 */
export interface PostingSchedule {
  postsPerWeek: number;
  weeklyPlan: PostingSlot[];
}

export interface IndustryTemplate {
  businessType: InsertBusinessProfile["businessType"];
  /** Step 2 defaults */
  suggestedProducts: ProductDraft[];
  /** Step 3 default (first entry) */
  sampleTargetCustomers: string[];
  /** Step 4 default (first entry) — the recommended brand tone */
  recommendedTones: InsertBusinessProfile["brandTone"][];
  /** Step 5 default */
  recommendedPlatforms: string[];
  /** Set of content ideas — reserved for the Phase 2 Content Calendar */
  suggestedContentTypes: ContentType[];
  /** How often + what to post — reserved for the Phase 2 Content Calendar */
  postingSchedule: PostingSchedule;
  exampleHashtags: string[];
}

export const INDUSTRY_TEMPLATES: Record<
  InsertBusinessProfile["businessType"],
  IndustryTemplate
> = {
  restaurant: {
    businessType: "restaurant",
    suggestedProducts: [
      { name: "Signature Dish", description: "Your most-ordered menu item" },
      { name: "Daily Special", description: "Rotates based on availability" },
    ],
    sampleTargetCustomers: [
      "Local families and regulars aged 25-55 who want a reliable spot for weeknight dinners and weekend brunch.",
      "Young professionals nearby looking for a quick, quality lunch and coffee.",
    ],
    recommendedTones: ["friendly", "playful"],
    recommendedPlatforms: ["instagram", "tiktok"],
    suggestedContentTypes: [
      "product_showcase",
      "behind_the_scenes",
      "promo",
      "testimonial",
      "seasonal",
    ],
    postingSchedule: {
      postsPerWeek: 5,
      weeklyPlan: [
        { day: "monday", contentType: "product_showcase" },
        { day: "wednesday", contentType: "behind_the_scenes" },
        { day: "thursday", contentType: "promo" },
        { day: "friday", contentType: "testimonial" },
        { day: "saturday", contentType: "engagement" },
      ],
    },
    exampleHashtags: ["#foodie", "#eatlocal", "#dailyspecial", "#freshmade"],
  },
  "e-commerce": {
    businessType: "e-commerce",
    suggestedProducts: [
      { name: "Bestseller", description: "Your top-selling product" },
      { name: "New Arrival", description: "Recently launched item" },
    ],
    sampleTargetCustomers: [
      "Online shoppers aged 18-40 who discover products through social media and value fast shipping and easy returns.",
      "Repeat customers looking for new drops and limited releases.",
    ],
    recommendedTones: ["bold", "playful"],
    recommendedPlatforms: ["instagram", "tiktok", "youtube"],
    suggestedContentTypes: [
      "product_showcase",
      "ugc_ad",
      "promo",
      "testimonial",
      "tip",
    ],
    postingSchedule: {
      postsPerWeek: 5,
      weeklyPlan: [
        { day: "monday", contentType: "product_showcase" },
        { day: "tuesday", contentType: "ugc_ad" },
        { day: "wednesday", contentType: "tip" },
        { day: "thursday", contentType: "promo" },
        { day: "saturday", contentType: "testimonial" },
      ],
    },
    exampleHashtags: ["#shopsmall", "#newarrival", "#onlineshopping", "#musthave"],
  },
  salon: {
    businessType: "salon",
    suggestedProducts: [
      { name: "Signature Service", description: "Your most-booked treatment" },
      { name: "Seasonal Package", description: "A bundled promotional offer" },
    ],
    sampleTargetCustomers: [
      "Local clients aged 20-50 who book regular hair, beauty, or spa appointments and follow trends on social media.",
      "First-time visitors looking for a trusted stylist or therapist nearby.",
    ],
    recommendedTones: ["luxury", "friendly"],
    recommendedPlatforms: ["instagram", "tiktok"],
    suggestedContentTypes: [
      "product_showcase",
      "tip",
      "promo",
      "testimonial",
      "behind_the_scenes",
    ],
    postingSchedule: {
      postsPerWeek: 4,
      weeklyPlan: [
        { day: "monday", contentType: "product_showcase" },
        { day: "wednesday", contentType: "tip" },
        { day: "friday", contentType: "promo" },
        { day: "saturday", contentType: "testimonial" },
      ],
    },
    exampleHashtags: ["#hairtransformation", "#selfcare", "#bookNow", "#glowup"],
  },
  gym: {
    businessType: "gym",
    suggestedProducts: [
      { name: "Membership Plan", description: "Your core recurring offer" },
      { name: "Class Pack", description: "A themed class or training program" },
    ],
    sampleTargetCustomers: [
      "Local residents aged 18-45 focused on fitness goals, from beginners to experienced athletes.",
      "Busy professionals looking for flexible class schedules and personal training.",
    ],
    recommendedTones: ["bold", "friendly"],
    recommendedPlatforms: ["instagram", "youtube", "tiktok"],
    suggestedContentTypes: [
      "tip",
      "behind_the_scenes",
      "promo",
      "testimonial",
      "engagement",
    ],
    postingSchedule: {
      postsPerWeek: 5,
      weeklyPlan: [
        { day: "monday", contentType: "tip" },
        { day: "tuesday", contentType: "behind_the_scenes" },
        { day: "wednesday", contentType: "engagement" },
        { day: "friday", contentType: "promo" },
        { day: "sunday", contentType: "testimonial" },
      ],
    },
    exampleHashtags: ["#fitfam", "#getstronger", "#classpromo", "#transformation"],
  },
  real_estate: {
    businessType: "real_estate",
    suggestedProducts: [
      { name: "Featured Listing", description: "A current property for sale or rent" },
      { name: "Neighborhood Spotlight", description: "An area you specialize in" },
    ],
    sampleTargetCustomers: [
      "Prospective buyers and renters aged 25-55 researching neighborhoods and comparing listings online.",
      "Homeowners considering selling and looking for a trusted local agent.",
    ],
    recommendedTones: ["professional", "luxury"],
    recommendedPlatforms: ["instagram", "youtube"],
    suggestedContentTypes: [
      "product_showcase",
      "tip",
      "promo",
      "seasonal",
    ],
    postingSchedule: {
      postsPerWeek: 3,
      weeklyPlan: [
        { day: "tuesday", contentType: "product_showcase" },
        { day: "thursday", contentType: "tip" },
        { day: "saturday", contentType: "promo" },
      ],
    },
    exampleHashtags: ["#justlisted", "#dreamhome", "#openhouse", "#realestate"],
  },
  fashion: {
    businessType: "fashion",
    suggestedProducts: [
      { name: "Signature Piece", description: "Your most-recognized item" },
      { name: "New Collection", description: "A recently launched line" },
    ],
    sampleTargetCustomers: [
      "Fashion-conscious shoppers aged 18-35 who follow trends on social media and care about style and fit.",
      "Repeat customers looking for new seasonal collections.",
    ],
    recommendedTones: ["bold", "luxury"],
    recommendedPlatforms: ["instagram", "tiktok"],
    suggestedContentTypes: [
      "product_showcase",
      "tip",
      "ugc_ad",
      "promo",
      "seasonal",
    ],
    postingSchedule: {
      postsPerWeek: 5,
      weeklyPlan: [
        { day: "monday", contentType: "product_showcase" },
        { day: "tuesday", contentType: "tip" },
        { day: "wednesday", contentType: "ugc_ad" },
        { day: "friday", contentType: "promo" },
        { day: "saturday", contentType: "engagement" },
      ],
    },
    exampleHashtags: ["#ootd", "#newcollection", "#stylegoals", "#fashionfinds"],
  },
  freelancer: {
    businessType: "freelancer",
    suggestedProducts: [
      { name: "Core Service", description: "The main service you offer clients" },
      { name: "Package Deal", description: "A bundled offer for repeat clients" },
    ],
    sampleTargetCustomers: [
      "Small business owners and individuals aged 25-50 looking for a reliable freelancer with a proven portfolio.",
      "Clients who discover your work through referrals and social media.",
    ],
    recommendedTones: ["professional", "friendly"],
    recommendedPlatforms: ["instagram"],
    suggestedContentTypes: [
      "product_showcase",
      "testimonial",
      "tip",
      "behind_the_scenes",
    ],
    postingSchedule: {
      postsPerWeek: 3,
      weeklyPlan: [
        { day: "monday", contentType: "product_showcase" },
        { day: "wednesday", contentType: "testimonial" },
        { day: "friday", contentType: "tip" },
      ],
    },
    exampleHashtags: ["#freelancer", "#portfolio", "#clientwork"],
  },
  other: {
    businessType: "other",
    suggestedProducts: [
      { name: "Core Offer", description: "Your primary product or service" },
    ],
    sampleTargetCustomers: [
      "Local customers who discover your business through social media and word of mouth.",
    ],
    recommendedTones: ["professional", "friendly"],
    recommendedPlatforms: ["instagram"],
    suggestedContentTypes: [
      "product_showcase",
      "tip",
      "promo",
      "testimonial",
    ],
    postingSchedule: {
      postsPerWeek: 3,
      weeklyPlan: [
        { day: "monday", contentType: "product_showcase" },
        { day: "wednesday", contentType: "tip" },
        { day: "friday", contentType: "promo" },
      ],
    },
    exampleHashtags: ["#smallbusiness", "#supportlocal"],
  },
};
