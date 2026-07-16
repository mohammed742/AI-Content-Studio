# AI Content Studio

AI-powered social media content platform for small and medium businesses. Users describe their business; the agent generates product photos, graphics, video ads, captions, and hashtags — then publishes directly to YouTube, TikTok, and Instagram. No prompts, no model picking: users see credits and results, the agent handles every creative decision.

## Status

**Phase 2 — Visual Generation Core: complete.** ✅ (Phases 0–1 complete.)

The full **Agent Loop** now runs end to end: **Plan → Retrieve → Route → Execute → Assemble → Publish**. A user creates a content plan, approves it, and the agent generates and stores every item — no prompts, no model names, no dollar figures.

Next up: **Phase 3 — UGC Video Pipeline** (talking-head product-review videos).

### What works today

- **Marketing landing page** — hero, features, CTA, footer, SEO metadata + OG image.
- **Auth** — Clerk sign-in/sign-up, edge middleware protecting the app routes, and a Clerk webhook that syncs users into the database (with just-in-time provisioning as a fallback).
- **Business onboarding wizard** (`/onboarding`) — business name & type, products, target customers, brand tone & colors, logo upload with automatic brand-color detection, and social platforms. Industry presets pre-fill sensible defaults; completing onboarding embeds the brand into the knowledge base.
- **Content Plan** (`/plan`) — "Create My Content Plan" proposes a week of 5–7 items (grounded in the industry playbook, the brand's own data via RAG, and upcoming holidays); review/edit/approve; "Approve & Generate All" runs every item through the pipelines in parallel with live per-item progress and retry.
- **Gallery** (`/gallery`) — browse generated Asset Kits in a filterable/sortable grid with a lightbox (editable caption, hashtags, download, delete) and thumbs up/down feedback.
- **The Agent Loop services** (`src/lib/`): Muapi generation (retry + cost tracking), Brand Knowledge Base (pgvector embeddings) + retrieval, Model Router, Content Planner (with quality scoring + auto-regenerate), product-photo & social-graphic pipelines, caption/ad-copy generation, Asset Kit assembly, Generation Queue, and Agent Evals (feedback loop + pipeline reliability).
- **Generation tracer** — the original internal proof-of-concept route (image + caption end to end), still available.

> **Runtime notes:** the current Muapi key is on the free/sandbox tier (generations return mock placeholder media at $0); image models are shimmed to `nano-banana-2` until the key is upgraded. A valid `OPENAI_API_KEY` is required for planning, captions, and embeddings.

## Tech Stack

| Layer | Tech |
|-------|------|
| Framework | Next.js 15 (App Router) + TypeScript (strict) |
| Styling | Tailwind CSS + shadcn/ui + Phosphor icons + Geist + motion/react |
| Auth | Clerk (middleware + webhooks) |
| Database | Neon (PostgreSQL) + Drizzle ORM + drizzle-zod |
| Visual AI | Muapi.ai (single gateway) |
| Text AI | OpenAI GPT-4.1-mini (Vercel AI SDK) |
| RAG | pgvector + OpenAI `text-embedding-3-small` |
| Storage | Cloudflare R2 (S3-compatible) |
| Payments | Stripe *(Phase 6)* |
| Deployment | Replit |

## Monorepo layout

pnpm workspace. The Next.js app lives at `artifacts/web`.

```
artifacts/web/src/
  app/            Routes: landing, dashboard, onboarding, /plan, /gallery, sign-in/up, API routes, webhooks
  components/     landing/, dashboard/, onboarding/, plan/, gallery/, ui/ (shadcn primitives)
  db/             Drizzle schema (users, business_profiles, brand_embeddings, asset_kits,
                  content_plans, generation_feedback, pipeline_logs) + client
  lib/            Agent Loop services: muapi, embeddings, retrieval, model-router,
                  content-planner, product-photo, social-graphic, text-generation,
                  asset-kit, generation-queue, agent-evals, seasonal, r2, industry-templates
  env.ts          Zod-validated environment variables (fail-fast at startup)
  middleware.ts   Clerk route protection
```

## Getting started

Requires **pnpm** (the repo refuses npm/yarn) and Node.

```bash
pnpm install

# From the web app:
cd artifacts/web
# Create .env.local with Clerk, Neon, Muapi, OpenAI, and R2 keys
# (see the required variables in src/env.ts)
pnpm db:push   # apply the Drizzle schema to Neon
pnpm dev       # start the dev server
```

Environment variables are validated at startup via Zod (`src/env.ts`) — missing keys fail fast with a clear message, so that file is the source of truth for what's required.

### Common scripts

Run from the repo root:

```bash
pnpm typecheck    # type-check all workspace packages
pnpm build        # typecheck + build every package
```

From `artifacts/web`:

```bash
pnpm dev          # Next.js dev server
pnpm lint         # ESLint
pnpm build        # production build
pnpm db:push      # push Drizzle schema to Neon
pnpm db:studio    # open Drizzle Studio
```

## Working in this repo

This is a structured human + AI project. Any agent must follow the workflow before making changes — start with **`AGENTS.md`** / **`CLAUDE.md`**, then `WORKFLOW.md`, `PROGRESS.md` (current status), the active `plan-phase-N.md`, and `CONTEXT.md` (domain glossary). Read `DESIGN.md` before writing any UI. Work is tracked as slices in Linear (`DEV-xxx`), one slice per session.
