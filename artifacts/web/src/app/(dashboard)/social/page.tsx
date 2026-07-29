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
import { ensureLocalUser } from "@/lib/local-user";
import { socialPublishingService } from "@/lib/social-publishing";
import { SocialConnections } from "@/components/social/social-connections";

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

  const accounts = (await socialPublishingService.listAccounts(user.id)).map(
    (account) => ({
      id: account.id,
      platform: account.platform,
      platformName: account.platformName,
      accountName: account.accountName,
      nickname: account.nickname,
    }),
  );

  return (
    <div className="mx-auto w-full max-w-4xl">
      <SocialConnections accounts={accounts} />
    </div>
  );
}
