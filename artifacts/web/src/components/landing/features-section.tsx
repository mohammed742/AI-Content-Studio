"use client";

import { motion } from "framer-motion";
import {
  Camera,
  Images,
  VideoCamera,
  Calendar,
  ArrowRight,
} from "@phosphor-icons/react";

const features = [
  {
    icon: Camera,
    title: "Product Photos",
    description:
      "Studio-quality product shots generated from your description. No photographer, no studio, no wait.",
  },
  {
    icon: Images,
    title: "Social Graphics",
    description:
      "Branded Instagram posts, stories, and banners that match your look and feel — automatically.",
  },
  {
    icon: VideoCamera,
    title: "UGC Video Ads",
    description:
      "AI-generated customer-style video reviews with voiceover, product shots, and platform-ready formats.",
  },
  {
    icon: Calendar,
    title: "Auto Calendar",
    description:
      "A full week of content planned and scheduled for you. Just review, approve, and publish.",
  },
];

export function FeaturesSection() {
  return (
    <section className="border-t border-zinc-800">
      <div className="max-w-7xl mx-auto px-6 py-24 md:py-32">
        <div className="text-center mb-16">
          <motion.h2
            className="text-3xl font-semibold tracking-tight text-zinc-50"
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5 }}
          >
            Everything you need to post with confidence
          </motion.h2>
          <motion.p
            className="mt-4 text-lg text-zinc-400 max-w-[65ch] mx-auto leading-relaxed"
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5, delay: 0.1 }}
          >
            No design skills. No copywriting. No missed posts. Just your
            business, turned into content.
          </motion.p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {features.map((feature, index) => (
            <motion.div
              key={feature.title}
              className="group rounded-xl border border-zinc-800 bg-zinc-900/30 p-6 hover:-translate-y-[2px] hover:shadow-lg hover:shadow-zinc-900/50 transition-all duration-300"
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.4, delay: index * 0.1 }}
            >
              <div className="flex items-start gap-4">
                <div className="rounded-lg bg-emerald-500/10 p-3 shrink-0">
                  <feature.icon
                    className="w-6 h-6 text-emerald-400"
                    weight="duotone"
                  />
                </div>
                <div className="space-y-2">
                  <h3 className="text-base font-medium text-zinc-50">
                    {feature.title}
                  </h3>
                  <p className="text-sm text-zinc-400 leading-relaxed">
                    {feature.description}
                  </p>
                  <div className="flex items-center gap-1 text-sm text-emerald-400 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                    Learn more
                    <ArrowRight className="w-3 h-3" />
                  </div>
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
