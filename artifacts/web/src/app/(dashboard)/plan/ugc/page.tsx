/**
 * DEV-33: UGC Video page (DESIGN.md §9.6) — the agent-driven UGC ad wizard.
 * All states are handled client-side by UgcFlow: no job yet (propose), draft
 * (review script + presenter → confirm), generating (step progress), completed
 * (video with per-format tabs), failed (retry from the failed step).
 */
import { Metadata } from "next";
import { UgcFlow } from "@/components/ugc/ugc-flow";

export const metadata: Metadata = {
  title: "UGC Video",
  description: "Your agent-made UGC-style video ad.",
};

export const dynamic = "force-dynamic";

export default function UgcPage() {
  return (
    <div className="mx-auto w-full max-w-4xl">
      <UgcFlow />
    </div>
  );
}
