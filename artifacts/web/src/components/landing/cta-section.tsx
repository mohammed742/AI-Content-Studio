"use client";

import { motion } from "framer-motion";
import { SignUpButton } from "@clerk/nextjs";
import { ArrowRight, Sparkle } from "@phosphor-icons/react";

export function CtaSection() {
  return (
    <section className="relative overflow-hidden border-t border-zinc-800">
      <div className="absolute inset-0 bg-gradient-to-br from-emerald-500/5 via-transparent to-zinc-950" />
      <div className="max-w-7xl mx-auto px-6 py-24 md:py-32 relative">
        <div className="max-w-2xl mx-auto text-center space-y-8">
          <motion.div
            className="inline-flex items-center gap-2 rounded-full bg-emerald-500/10 px-3 py-1 text-xs font-medium text-emerald-400"
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5 }}
          >
            <Sparkle className="w-3 h-3" weight="fill" />
            Start generating today
          </motion.div>

          <motion.h2
            className="text-3xl md:text-4xl font-semibold tracking-tight text-zinc-50"
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5, delay: 0.1 }}
          >
            Ready to transform your social media?
          </motion.h2>

          <motion.p
            className="text-lg text-zinc-400 leading-relaxed"
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5, delay: 0.2 }}
          >
            Join small businesses already using AI Content Studio to create
            content that drives sales.
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5, delay: 0.3 }}
          >
            <SignUpButton mode="redirect" fallbackRedirectUrl="/dashboard">
              <button className="group inline-flex items-center gap-2 rounded-full bg-emerald-500 px-8 py-4 text-base font-medium text-zinc-950 hover:bg-emerald-400 transition-colors">
                Start Free
                <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
              </button>
            </SignUpButton>
          </motion.div>
        </div>
      </div>
    </section>
  );
}
