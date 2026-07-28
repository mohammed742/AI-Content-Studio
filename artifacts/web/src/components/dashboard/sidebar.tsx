"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from "@/components/ui/tooltip";
import { useUser } from "@clerk/nextjs";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Sparkle,
  LayoutDashboard,
  Calendar,
  Image,
  FolderOpen,
  Users,
  Settings,
  ListChecks,
  Video,
  ChevronLeft,
  ChevronRight,
  LogOut,
  UserCircle,
} from "lucide-react";

const navItems = [
  {
    label: "Dashboard",
    href: "/dashboard",
    icon: LayoutDashboard,
  },
  {
    label: "Content Plan",
    href: "/plan",
    icon: ListChecks,
  },
  {
    label: "UGC Video",
    href: "/plan/ugc",
    icon: Video,
  },
  {
    label: "Calendar",
    href: "/dashboard/calendar",
    icon: Calendar,
  },
  {
    label: "Gallery",
    href: "/gallery",
    icon: Image,
  },
  {
    label: "Media Library",
    href: "/library",
    icon: FolderOpen,
  },
  {
    label: "Presenters",
    href: "/presenters",
    icon: Users,
  },
  {
    label: "Settings",
    href: "/dashboard/settings",
    icon: Settings,
  },
];

export function Sidebar({
  isCollapsed,
  onToggle,
}: {
  isCollapsed: boolean;
  onToggle: () => void;
}) {
  const pathname = usePathname();
  const { user, isLoaded } = useUser();

  return (
    <TooltipProvider delayDuration={0}>
    <div className="flex flex-col h-full">
      {/* Logo area */}
      <div className="flex items-center h-16 px-4 border-b border-border">
        <Link
          href="/dashboard"
          className="flex items-center gap-2.5 text-foreground"
        >
          <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-primary text-primary-foreground shrink-0">
            <Sparkle className="h-4 w-4" />
          </div>
          {!isCollapsed && (
            <span className="font-semibold text-sm tracking-tight whitespace-nowrap">
              AI Content Studio
            </span>
          )}
        </Link>
        <Button
          variant="ghost"
          size="icon"
          onClick={onToggle}
          className={cn(
            "ml-auto h-8 w-8 shrink-0",
            isCollapsed && "mx-auto ml-0"
          )}
          aria-label={isCollapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          {isCollapsed ? (
            <ChevronRight className="h-4 w-4" />
          ) : (
            <ChevronLeft className="h-4 w-4" />
          )}
        </Button>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 py-4 space-y-1">
        {navItems.map((item) => {
          const isActive = pathname === item.href || pathname?.startsWith(item.href + "/");
          const Icon = item.icon;

          const linkContent = (
            <Link
              href={item.href}
              className={cn(
                "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                isActive
                  ? "bg-primary/10 text-primary"
                  : "text-muted-foreground hover:bg-accent hover:text-foreground"
              )}
            >
              <Icon className="h-5 w-5 shrink-0" strokeWidth={1.5} />
              {!isCollapsed && <span className="whitespace-nowrap">{item.label}</span>}
            </Link>
          );

          if (isCollapsed) {
            return (
              <Tooltip key={item.href} delayDuration={0}>
                <TooltipTrigger asChild>
                  <div>{linkContent}</div>
                </TooltipTrigger>
                <TooltipContent side="right">{item.label}</TooltipContent>
              </Tooltip>
            );
          }

          return <div key={item.href}>{linkContent}</div>;
        })}
      </nav>

      {/* Bottom section */}
      <div className="border-t border-border p-3 space-y-3">
        {/* User avatar */}
        <div className="flex items-center gap-3">
          <Tooltip delayDuration={0}>
            <TooltipTrigger asChild>
              <div className="shrink-0">
                <Avatar className="h-9 w-9">
                  <AvatarImage
                    src={isLoaded && user ? user.imageUrl : undefined}
                    alt={isLoaded && user ? user.fullName || "User" : "User"}
                  />
                  <AvatarFallback className="bg-primary/10 text-primary text-xs font-medium">
                    <UserCircle className="h-5 w-5" />
                  </AvatarFallback>
                </Avatar>
              </div>
            </TooltipTrigger>
            <TooltipContent side="right">
              {isLoaded && user ? user.fullName || "User" : "User"}
            </TooltipContent>
          </Tooltip>
          {!isCollapsed && isLoaded && user && (
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">
                {user.fullName || "User"}
              </p>
              <p className="text-xs text-muted-foreground truncate">
                {user.primaryEmailAddress?.emailAddress || ""}
              </p>
            </div>
          )}
        </div>

        {/* Logout button */}
        <Button
          variant="ghost"
          className={cn(
            "w-full justify-start gap-3 text-muted-foreground hover:text-foreground",
            isCollapsed && "justify-center px-0"
          )}
          asChild
        >
          <Link href="/">
            <LogOut className="h-5 w-5 shrink-0" strokeWidth={1.5} />
            {!isCollapsed && <span className="text-sm">Sign out</span>}
          </Link>
        </Button>
      </div>
    </div>
    </TooltipProvider>
  );
}
