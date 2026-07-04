/**
 * DEV-7: Hardcoded Business Profile for the Agent Loop tracer.
 *
 * This is placeholder data standing in for a real `business_profiles` row
 * until onboarding (Phase 1+) exists. It lets us exercise the Agent Loop
 * (Plan → Retrieve → Route → Execute → Assemble → Publish) end-to-end
 * against a realistic Business Profile shape before wiring up real
 * persistence.
 */

export type BrandTone = "professional" | "casual" | "playful" | "luxury";

export interface TracerProduct {
  name: string;
  description: string;
  price: string;
}

export interface TracerBusinessProfile {
  businessName: string;
  businessType: string;
  description: string;
  targetCustomers: string;
  brandKit: {
    colors: string[];
    tone: BrandTone;
    fontPreference: string;
  };
  products: TracerProduct[];
}

export const tracerBusinessProfile: TracerBusinessProfile = {
  businessName: "Sunrise Café",
  businessType: "bakery",
  description:
    "A cozy neighborhood bakery known for fresh-baked sourdough, pastries, and specialty coffee, serving the community since sunrise every day.",
  targetCustomers:
    "Local families, remote workers looking for a cozy spot, and coffee enthusiasts aged 25-45.",
  brandKit: {
    colors: ["#F4A261", "#E76F51", "#FFF3E0"],
    tone: "playful",
    fontPreference: "Poppins",
  },
  products: [
    {
      name: "Classic Sourdough Loaf",
      description: "Slow-fermented for 24 hours with a crackling crust.",
      price: "$8.50",
    },
    {
      name: "Cinnamon Swirl Croissant",
      description: "Buttery, flaky croissant laced with cinnamon sugar.",
      price: "$4.25",
    },
    {
      name: "Sunrise Latte",
      description: "House espresso blend with oat milk and honey drizzle.",
      price: "$5.00",
    },
  ],
};
