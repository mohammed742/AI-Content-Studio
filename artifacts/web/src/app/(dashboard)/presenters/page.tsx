/**
 * STU-C7 (DEV-64): Presenter Library page — the catalogue of stock presenters
 * the agent picks from for UGC-style video ads (DESIGN §9.6). Lives in the
 * (dashboard) route group so it reuses DashboardShell, alongside /plan,
 * /gallery, /library.
 *
 * The roster is static data (src/lib/presenters.ts), so the server component
 * hands it straight to the client filter view — no API route or DB round-trip.
 */
import { Metadata } from "next";
import { AUDIENCE_TAGS, listPresenters } from "@/lib/presenters";
import { PresenterLibrary } from "@/components/presenters/presenter-library";

export const metadata: Metadata = {
  title: "Presenters",
  description: "Browse the presenters the agent can use for UGC-style video ads.",
};

export default function PresentersPage() {
  return (
    <div className="mx-auto w-full max-w-7xl">
      <PresenterLibrary presenters={listPresenters()} tags={AUDIENCE_TAGS} />
    </div>
  );
}
