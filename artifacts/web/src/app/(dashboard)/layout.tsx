/**
 * DEV-24: (dashboard) route group — top-level app pages (/plan, and later
 * /gallery, /calendar, /social per DESIGN.md §5/§9) that live at root-level
 * URLs but render inside the dashboard chrome. Mirrors /dashboard/layout.tsx;
 * plan-phase-2.md's file list specifies this group for the Phase-2 pages.
 */
import { DashboardShell } from "@/components/dashboard/dashboard-shell";

export const dynamic = "force-dynamic";

export default function DashboardGroupLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <DashboardShell>{children}</DashboardShell>;
}
