"use client";

import { usePathname } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Menu, ChevronRight } from "lucide-react";
import { useState } from "react";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { Sidebar } from "./sidebar";

function getPageTitle(pathname: string): string {
  const segments = pathname.split("/").filter(Boolean);
  if (segments.length === 1 && segments[0] === "dashboard") {
    return "Dashboard";
  }
  const last = segments[segments.length - 1];
  return last.charAt(0).toUpperCase() + last.slice(1).replace(/-/g, " ");
}

function Breadcrumbs({ pathname }: { pathname: string }) {
  const segments = pathname.split("/").filter(Boolean);
  if (segments.length <= 1) return null;

  return (
    <nav aria-label="Breadcrumb" className="hidden sm:flex items-center gap-2">
      {segments.map((segment, index) => {
        const isLast = index === segments.length - 1;
        const label = segment.charAt(0).toUpperCase() + segment.slice(1);
        const href = "/" + segments.slice(0, index + 1).join("/");

        return (
          <div key={href} className="flex items-center gap-2">
            {index > 0 && (
              <ChevronRight className="h-4 w-4 text-muted-foreground" />
            )}
            {isLast ? (
              <span className="text-sm font-medium text-foreground">{label}</span>
            ) : (
              <a
                href={href}
                className="text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                {label}
              </a>
            )}
          </div>
        );
      })}
    </nav>
  );
}

export function Header() {
  const pathname = usePathname() || "/dashboard";
  const pageTitle = getPageTitle(pathname);
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <header className="sticky top-0 z-20 flex h-16 items-center gap-4 border-b border-border bg-card/50 backdrop-blur px-4 md:px-6">
      {/* Mobile hamburger */}
      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
        <SheetTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="lg:hidden"
            aria-label="Open menu"
          >
            <Menu className="h-5 w-5" />
          </Button>
        </SheetTrigger>
        <SheetContent side="left" className="w-[280px] p-0">
          <div className="h-full">
            <Sidebar isCollapsed={false} onToggle={() => {}} />
          </div>
        </SheetContent>
      </Sheet>

      {/* Page title */}
      <h1 className="text-xl font-semibold tracking-tight text-foreground">
        {pageTitle}
      </h1>

      <Separator orientation="vertical" className="hidden sm:block h-6" />

      {/* Breadcrumbs */}
      <Breadcrumbs pathname={pathname} />
    </header>
  );
}
