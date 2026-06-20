"use client";

import { useState } from "react";
import { Sidebar } from "./sidebar";
import { Header } from "./header";
import { MobileSidebar } from "./mobile-sidebar";

export function DashboardShell({
  children,
}: {
  children: React.ReactNode;
}) {
  const [isCollapsed, setIsCollapsed] = useState(false);

  return (
    <div className="flex min-h-[100dvh] bg-background">
      {/* Desktop sidebar */}
      <aside
        className="hidden lg:block fixed left-0 top-0 z-30 h-[100dvh] border-r border-border bg-card transition-all duration-300 ease-in-out"
        style={{ width: isCollapsed ? 64 : 280 }}
      >
        <Sidebar
          isCollapsed={isCollapsed}
          onToggle={() => setIsCollapsed(!isCollapsed)}
        />
      </aside>

      {/* Mobile sidebar */}
      <MobileSidebar />

      {/* Main content area */}
      <main
        className="flex-1 flex flex-col min-h-[100dvh] transition-all duration-300 ease-in-out"
        style={{ marginLeft: "var(--sidebar-width, 280px)" }}
      >
        {/* CSS variable for responsive margin */}
        <style jsx>{`
          main {
            --sidebar-width: 0px;
          }
          @media (min-width: 1024px) {
            main {
              --sidebar-width: ${isCollapsed ? "64px" : "280px"};
            }
          }
        `}</style>

        <Header />
        <div className="flex-1 px-4 py-6 md:px-6 lg:px-8">{children}</div>
      </main>
    </div>
  );
}
