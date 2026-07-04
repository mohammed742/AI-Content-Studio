/**
 * DEV-10: Static option data + shared form state types for the onboarding
 * wizard. UI labels map to the `business_profiles` enum values from
 * src/db/schema.ts (e.g. "Fitness" → "gym", "Real Estate" → "real_estate").
 */
import type { LucideIcon } from "lucide-react";
import {
  Dumbbell,
  Home,
  Instagram,
  Music2,
  Scissors,
  ShoppingBag,
  Store,
  UtensilsCrossed,
  Youtube,
} from "lucide-react";
import type { InsertBusinessProfile } from "@/db/schema";

export interface BusinessTypeOption {
  value: InsertBusinessProfile["businessType"];
  label: string;
  description: string;
  icon: LucideIcon;
}

export const BUSINESS_TYPE_OPTIONS: BusinessTypeOption[] = [
  {
    value: "restaurant",
    label: "Restaurant",
    description: "Cafés, bakeries, bars & food service",
    icon: UtensilsCrossed,
  },
  {
    value: "e-commerce",
    label: "E-commerce",
    description: "Online stores & product brands",
    icon: ShoppingBag,
  },
  {
    value: "salon",
    label: "Salon",
    description: "Hair, beauty, spa & wellness",
    icon: Scissors,
  },
  {
    value: "gym",
    label: "Fitness",
    description: "Gyms, studios & personal training",
    icon: Dumbbell,
  },
  {
    value: "real_estate",
    label: "Real Estate",
    description: "Agents, brokers & property firms",
    icon: Home,
  },
  {
    value: "other",
    label: "Other",
    description: "Any other local or online business",
    icon: Store,
  },
];

export interface BrandToneOption {
  value: InsertBusinessProfile["brandTone"];
  label: string;
  description: string;
  preview: string;
}

export const BRAND_TONE_OPTIONS: BrandToneOption[] = [
  {
    value: "professional",
    label: "Professional",
    description: "Polished, credible, expert",
    preview:
      "Discover the difference expertise makes. Book your consultation today.",
  },
  {
    value: "friendly",
    label: "Friendly",
    description: "Warm, welcoming, personal",
    preview:
      "We can't wait to see you again! Stop by and say hi this week 👋",
  },
  {
    value: "playful",
    label: "Playful",
    description: "Fun, energetic, cheeky",
    preview:
      "Warning: our new arrivals may cause spontaneous happy dances 💃",
  },
  {
    value: "luxury",
    label: "Luxury",
    description: "Elegant, exclusive, refined",
    preview:
      "Indulge in the extraordinary. Crafted for those who expect more.",
  },
  {
    value: "bold",
    label: "Bold",
    description: "Confident, daring, direct",
    preview: "Stop scrolling. This is the upgrade you've been waiting for.",
  },
];

export interface PlatformOption {
  value: string;
  label: string;
  description: string;
  icon: LucideIcon;
}

export const PLATFORM_OPTIONS: PlatformOption[] = [
  {
    value: "youtube",
    label: "YouTube",
    description: "Long-form video & Shorts",
    icon: Youtube,
  },
  {
    value: "tiktok",
    label: "TikTok",
    description: "Short-form vertical video",
    icon: Music2,
  },
  {
    value: "instagram",
    label: "Instagram",
    description: "Posts, Reels & Stories",
    icon: Instagram,
  },
];

export interface ProductDraft {
  name: string;
  description: string;
}

export interface OnboardingFormState {
  businessName: string;
  businessType: InsertBusinessProfile["businessType"] | null;
  products: ProductDraft[];
  targetCustomers: string;
  brandTone: InsertBusinessProfile["brandTone"] | null;
  brandColors: string[];
  socialPlatforms: string[];
}

export const INITIAL_FORM_STATE: OnboardingFormState = {
  businessName: "",
  businessType: null,
  products: [{ name: "", description: "" }],
  targetCustomers: "",
  brandTone: null,
  brandColors: [],
  socialPlatforms: [],
};

export const TOTAL_STEPS = 6;

export const STEP_TITLES = [
  "Business Type",
  "Products & Services",
  "Target Customers",
  "Brand Identity",
  "Social Platforms",
  "Review & Submit",
] as const;
