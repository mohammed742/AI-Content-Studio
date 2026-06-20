"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { SignUpButton } from "@clerk/nextjs";
import {
  ArrowRight,
  Sparkle,
  Camera,
  VideoCamera,
  Image as ImageIcon,
  Calendar,
} from "@phosphor-icons/react";

export function HeroSection() {
  return (
    <section className="relative overflow-hidden">
      <div className="max-w-7xl mx-auto px-6 py-24 md:py-32">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-12 items-center">
          {/* Left: Text */}
          <div className="space-y-8">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5 }}
            >
              <div className="inline-flex items-center gap-2 rounded-full bg-emerald-500/10 px-3 py-1 text-xs font-medium text-emerald-400">
                <Sparkle className="w-3 h-3" weight="fill" />
                AI-Powered Social Content
              </div>
            </motion.div>

            <motion.h1
              className="text-4xl md:text-6xl font-bold tracking-tighter leading-none text-zinc-50"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.1 }}
            >
              AI-Powered Social Content That Sells
            </motion.h1>

            <motion.p
              className="text-lg text-zinc-400 max-w-[65ch] leading-relaxed"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.2 }}
            >
              Generate product photos, video ads, captions, and a full content
              calendar — all tailored to your business.
            </motion.p>

            <motion.div
              className="flex items-center gap-4"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.3 }}
            >
              <SignUpButton mode="redirect" fallbackRedirectUrl="/dashboard">
                <button className="group inline-flex items-center gap-2 rounded-full bg-emerald-500 px-6 py-3 text-sm font-medium text-zinc-950 hover:bg-emerald-400 transition-colors">
                  Start Free
                  <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                </button>
              </SignUpButton>

              <Link
                href="/sign-up"
                className="inline-flex items-center gap-2 text-sm text-zinc-400 hover:text-zinc-200 transition-colors"
              >
                See Demo
              </Link>
            </motion.div>
          </div>

          {/* Right: Product Preview */}
          <motion.div
            className="relative"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.6, delay: 0.2 }}
          >
            <div className="relative rounded-xl border border-zinc-800 bg-zinc-900/50 p-6">
              <div className="absolute inset-0 rounded-xl bg-gradient-to-br from-emerald-500/5 to-transparent" />
              <div className="relative space-y-4">
                <div className="flex items-center gap-2">
                  <div className="h-2 w-2 rounded-full bg-emerald-500" />
                  <span className="text-xs text-zinc-500">Preview</span>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-lg bg-zinc-800/50 p-4 space-y-2">
                    <Camera
                      className="w-5 h-5 text-emerald-400"
                      weight="duotone"
                    />
                    <div className="h-2 w-16 rounded bg-zinc-700" />
                    <div className="h-2 w-12 rounded bg-zinc-700" />
                  </div>
                  <div className="rounded-lg bg-zinc-800/50 p-4 space-y-2">
                    <ImageIcon
                      className="w-5 h-5 text-emerald-400"
                      weight="duotone"
                    />
                    <div className="h-2 w-16 rounded bg-zinc-700" />
                    <div className="h-2 w-12 rounded bg-zinc-700" />
                  </div>
                  <div className="rounded-lg bg-zinc-800/50 p-4 space-y-2">
                    <VideoCamera
                      className="w-5 h-5 text-emerald-400"
                      weight="duotone"
                    />
                    <div className="h-2 w-16 rounded bg-zinc-700" />
                    <div className="h-2 w-12 rounded bg-zinc-700" />
                  </div>
                  <div className="rounded-lg bg-zinc-800/50 p-4 space-y-2">
                    <Calendar
                      className="w-5 h-5 text-emerald-400"
                      weight="duotone"
                    />
                    <div className="h-2 w-16 rounded bg-zinc-700" />
                    <div className="h-2 w-12 rounded bg-zinc-700" />
                  </div>
                </div>
              </div>
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  );
}
