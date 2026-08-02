/**
 * DEV-35 (STU-31): Social Accounts page (DESIGN §9.9). Connect YouTube, TikTok,
 * and Instagram via Muapi's OAuth flow; connected accounts show read-only here.
 * Rename/disconnect is DEV-34; publishing history is DEV-39.
 *
 * Server component: auth + ensureLocalUser + list the user's connected accounts,
 * then hand a plain shape to the client card grid. In the (dashboard) group so
 * it reuses DashboardShell. Rename/disconnect (DEV-34) mutate via /api/social/
 * accounts and `router.refresh()` re-runs this list.
 */
import { Metadata } from "next";
import { redirect } from "next/navigation";
import { auth } from "@clerk/nextjs/server";
import { and, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { assetKits } from "@/db/schema";
import { ensureLocalUser } from "@/lib/local-user";
import { socialPublishingService } from "@/lib/social-publishing";
import { SocialConnections } from "@/components/social/social-connections";
import { SocialPublish } from "@/components/social/social-publish";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Social Accounts",
  description:
    "Connect YouTube, TikTok, and Instagram to publish content from AI Content Studio.",
};

export default async function SocialPage() {
  const { userId: clerkId } = await auth();
  if (!clerkId) {
    redirect("/sign-in");
  }
  const user = await ensureLocalUser(clerkId);
  if (!user) {
    redirect("/sign-in");
  }

  const allAccounts = await socialPublishingService.listAccounts(user.id);
  const accounts = allAccounts.map((account) => ({
    id: account.id,
    platform: account.platform,
    platformName: account.platformName,
    accountName: account.accountName,
    nickname: account.nickname,
  }));

  // Publish inputs: every connected account (YouTube + TikTok + Instagram),
  // ready video kits, and the user's publish jobs (listPublishJobs advances any
  // in-flight job on read). All three platforms are publishable as of DEV-38.
  const publishAccounts = allAccounts.map((a) => ({
    id: a.id,
    label: a.nickname?.trim() || a.accountName,
    platform: a.platform,
  }));

  const videoKits = (
    await db
      .select({ id: assetKits.id, title: assetKits.title })
      .from(assetKits)
      .where(and(eq(assetKits.userId, user.id), eq(assetKits.mediaType, "video")))
      .orderBy(desc(assetKits.createdAt))
  ).map((k) => ({ id: k.id, title: k.title }));

  const jobs = (await socialPublishingService.listPublishJobs(user.id)).map(
    (job) => ({
      id: job.id,
      status: job.status,
      title: job.title,
      platform: job.platform,
      resultUrl: job.resultUrl,
      error: job.error,
      createdAt: job.createdAt.toISOString(),
    }),
  );

  return (
    <div className="mx-auto w-full max-w-4xl space-y-10">
      <SocialConnections accounts={accounts} />
      <SocialPublish
        accounts={publishAccounts}
        videoKits={videoKits}
        initialJobs={jobs}
      />
    </div>
  );
}
