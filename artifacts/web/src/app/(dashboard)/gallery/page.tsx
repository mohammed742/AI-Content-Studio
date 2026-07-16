/**
 * DEV-26: Gallery page (DESIGN.md §9.7) — browse + manage generated Asset Kits.
 */
import { Metadata } from "next";
import { GalleryView } from "@/components/gallery/gallery-view";

export const metadata: Metadata = {
  title: "Gallery",
  description: "Browse and manage your generated content.",
};

export const dynamic = "force-dynamic";

export default function GalleryPage() {
  return (
    <div className="mx-auto w-full max-w-7xl">
      <GalleryView />
    </div>
  );
}
