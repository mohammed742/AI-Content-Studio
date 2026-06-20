"use client";

import { useState } from "react";
import Link from "next/link";
import {
  SignedIn,
  SignedOut,
  UserButton,
  SignUpButton,
} from "@clerk/nextjs";
import { Sparkle, List, X } from "@phosphor-icons/react";

export function NavBar() {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <nav className="sticky top-0 z-50 border-b border-zinc-800 bg-zinc-950/80 backdrop-blur-md">
      <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-2">
          <Sparkle className="w-5 h-5 text-emerald-400" weight="duotone" />
          <span className="font-semibold text-zinc-50 tracking-tight">
            AI Content Studio
          </span>
        </Link>

        <div className="hidden md:flex items-center gap-6">
          <Link
            href="/"
            className="text-sm text-zinc-400 hover:text-zinc-200 transition-colors"
          >
            Home
          </Link>
          <Link
            href="/sign-in"
            className="text-sm text-zinc-400 hover:text-zinc-200 transition-colors"
          >
            Sign In
          </Link>
          <SignedOut>
            <SignUpButton mode="redirect" fallbackRedirectUrl="/dashboard">
              <button className="rounded-full bg-emerald-500 px-4 py-2 text-sm font-medium text-zinc-950 hover:bg-emerald-400 transition-colors">
                Start Free
              </button>
            </SignUpButton>
          </SignedOut>
          <SignedIn>
            <Link
              href="/dashboard"
              className="rounded-full bg-emerald-500 px-4 py-2 text-sm font-medium text-zinc-950 hover:bg-emerald-400 transition-colors"
            >
              Dashboard
            </Link>
            <UserButton />
          </SignedIn>
        </div>

        <button
          className="md:hidden text-zinc-400"
          onClick={() => setMobileOpen(!mobileOpen)}
          aria-label="Toggle menu"
        >
          {mobileOpen ? (
            <X className="w-6 h-6" />
          ) : (
            <List className="w-6 h-6" />
          )}
        </button>
      </div>

      {mobileOpen && (
        <div className="md:hidden border-t border-zinc-800 bg-zinc-950 px-6 py-4 space-y-4">
          <Link
            href="/"
            className="block text-sm text-zinc-400 hover:text-zinc-200 transition-colors"
            onClick={() => setMobileOpen(false)}
          >
            Home
          </Link>
          <Link
            href="/sign-in"
            className="block text-sm text-zinc-400 hover:text-zinc-200 transition-colors"
            onClick={() => setMobileOpen(false)}
          >
            Sign In
          </Link>
          <SignedOut>
            <SignUpButton mode="redirect" fallbackRedirectUrl="/dashboard">
              <button className="w-full rounded-full bg-emerald-500 px-4 py-2 text-sm font-medium text-zinc-950 hover:bg-emerald-400 transition-colors">
                Start Free
              </button>
            </SignUpButton>
          </SignedOut>
          <SignedIn>
            <Link
              href="/dashboard"
              className="block w-full rounded-full bg-emerald-500 px-4 py-2 text-center text-sm font-medium text-zinc-950 hover:bg-emerald-400 transition-colors"
            >
              Dashboard
            </Link>
          </SignedIn>
        </div>
      )}
    </nav>
  );
}
