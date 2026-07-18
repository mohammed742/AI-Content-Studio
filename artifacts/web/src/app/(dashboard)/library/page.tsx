/**
 * STU-C3 (DEV-62): Media Library page — the user's uploaded business photos,
 * source material for the image-to-image pipelines (product photo, before/after).
 * Lives in the (dashboard) route group so it reuses DashboardShell, alongside
 * /plan and /gallery. See DESIGN.md §5 (dashboard layout). LibraryView fetches
 * its own data from /api/media-library on mount (same pattern as the Gallery).
 */
import { Metadata } from "next";
import { LibraryView } from "@/components/library/library-view";

export const metadata: Metadata = {
  title: "Media Library",
  description: "Upload and manage your own business photos.",
};

export const dynamic = "force-dynamic";

export default function LibraryPage() {
  return (
    <div className="mx-auto w-full max-w-7xl">
      <LibraryView />
    </div>
  );
}
