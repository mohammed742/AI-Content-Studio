import type { Metadata } from "next";
import { OnboardingWizard } from "@/components/onboarding/onboarding-wizard";

export const metadata: Metadata = {
  title: "Set up your business — AI Content Studio",
};

// Auth-dependent page (Clerk session) — render at request time.
export const dynamic = "force-dynamic";

/**
 * Full-screen onboarding per DESIGN.md §9.3 — no dashboard sidebar/header.
 * Moved from /dashboard/onboarding (DEV-10 deviation, resolved by human
 * decision 2026-07-05).
 */
export default function OnboardingPage() {
  return (
    <main className="flex min-h-[100dvh] items-start justify-center px-4 py-10 md:px-6 md:py-14">
      <OnboardingWizard />
    </main>
  );
}
