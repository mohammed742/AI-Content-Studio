/**
 * DEV-24: Content Plan page (DESIGN.md §9.5) — the user-facing Agent Loop.
 * Three states, all handled client-side by PlanFlow: no plan yet (create),
 * plan proposed (review/approve), generating/completed (progress + results).
 */
import { Metadata } from "next";
import { PlanFlow } from "@/components/plan/plan-flow";

export const metadata: Metadata = {
  title: "Content Plan",
  description: "Your agent-proposed weekly content plan.",
};

export const dynamic = "force-dynamic";

export default function PlanPage() {
  return (
    <div className="mx-auto w-full max-w-4xl">
      <PlanFlow />
    </div>
  );
}
