/**
 * DEV-14: Dashboard home.
 *
 * Fetches the caller's Business Profile server-side. Per plan-phase-1 step 8,
 * a signed-in user with no profile is redirected to onboarding; otherwise the
 * dashboard shows a welcome greeting and the business-profile summary card.
 */
import { redirect } from "next/navigation";
import { auth } from "@clerk/nextjs/server";
import { eq } from "drizzle-orm";
import { Sparkle } from "lucide-react";
import { db } from "@/db";
import { businessProfiles } from "@/db/schema";
import { ensureLocalUser } from "@/lib/local-user";
import { BusinessProfileCard } from "@/components/dashboard/business-profile-card";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const { userId: clerkId } = await auth();
  if (!clerkId) redirect("/sign-in");

  const user = await ensureLocalUser(clerkId);
  if (!user) redirect("/sign-in");

  const [profile] = await db
    .select()
    .from(businessProfiles)
    .where(eq(businessProfiles.userId, user.id))
    .limit(1);

  if (!profile) redirect("/onboarding");

  const firstName = user.name?.trim().split(/\s+/)[0] ?? "there";

  return (
    <div className="mx-auto max-w-5xl space-y-8">
      <div>
        <h2 className="text-2xl font-semibold tracking-tight">
          Welcome back, {firstName} 👋
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Here&apos;s your business at a glance.
        </p>
      </div>

      {/* Primary CTA (DESIGN §9.4) — content generation ships in Phase 2. */}
      <Card className="rounded-xl border-emerald-500/30 bg-emerald-500/5">
        <CardContent className="flex flex-col items-start gap-4 p-6 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-4">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-emerald-500/10">
              <Sparkle strokeWidth={1.5} className="h-6 w-6 text-emerald-400" />
            </div>
            <div className="space-y-1">
              <h3 className="text-lg font-medium">
                Generate this week&apos;s content
              </h3>
              <p className="text-sm text-muted-foreground">
                We&apos;ll turn your business profile into a week of posts,
                photos, and captions.
              </p>
            </div>
          </div>
          <Button disabled className="shrink-0 rounded-full px-6">
            Coming soon
          </Button>
        </CardContent>
      </Card>

      <BusinessProfileCard profile={profile} />
    </div>
  );
}
