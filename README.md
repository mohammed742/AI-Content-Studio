# AI Content Studio

AI-powered social media content platform for small and medium businesses. Users describe their business; the agent generates product photos, graphics, video ads, captions, and hashtags — then publishes directly to YouTube, TikTok, and Instagram. No prompts, no model picking: users see credits and results, the agent handles every creative decision.

## Status

**Phase 2.5 — Coverage & Asset Foundation: complete.** ✅ (Phases 0–2 complete.) **Phase 3 — UGC Video Pipeline: all 7 slices built** (in review); live end-to-end video render is gated on two carryovers — real presenter portraits and the provider-verified assembly step. **Phase 4 — Social Publishing: all 6 slices built** — connect YouTube / TikTok / Instagram, publish a video Asset Kit, and track it in a live publishing-history view; live publish to real accounts is human-gated QA.

The full **Agent Loop** runs end to end: **Plan → Retrieve → Route → Execute → Assemble → Publish**. A user creates a content plan, approves it, and the agent generates and stores every item — no prompts, no model names, no dollar figures. Phase 2.5 then closed the gap between what onboarding promises and what the engine can deliver — text-heavy graphics, the user's own photos, before/after composites, multi-image carousels — and laid the foundations Phase 3 depends on (the presenter library).

**Phase 3 — UGC Video Pipeline** (talking-head product-review videos) is built end to end: the agent writes a short script, casts a presenter, and runs a resumable script → voiceover → talking-head → B-roll → assembly → reframe pipeline behind a review wizard. It's in review; a real rendered video awaits real presenter portraits and provider-side verification of the assembly step.

### What works today

- **Marketing landing page** — hero, features, CTA, footer, SEO metadata + OG image.
- **Auth** — Clerk sign-in/sign-up, edge middleware protecting the app routes, and a Clerk webhook that syncs users into the database (with just-in-time provisioning as a fallback).
- **Business onboarding wizard** (`/onboarding`) — business name & type, products, target customers, brand tone & colors, logo upload with automatic brand-color detection, and social platforms. Industry presets pre-fill sensible defaults; completing onboarding embeds the brand into the knowledge base.
- **Content Plan** (`/plan`) — "Create My Content Plan" proposes a week of 5–7 items (grounded in the industry playbook, the brand's own data via RAG, and upcoming holidays); review/edit/approve; "Approve & Generate All" runs every item through the pipelines in parallel with live per-item progress and retry.
- **Gallery** (`/gallery`) — browse generated Asset Kits in a filterable/sortable grid with a lightbox (editable caption, hashtags, download, delete) and thumbs up/down feedback. Carousels show an ordered slideshow.
- **Media Library** (`/library`) — upload and manage your own business photos (source material for the image-to-image pipelines).
- **Presenters** (`/presenters`) — browse the roster of presenters the agent uses for UGC-style video ads, filterable by audience tag (the foundation Phase 3's lip-sync pipeline consumes).
- **UGC Video** (`/plan/ugc`) — the agent-driven wizard for UGC-style video ads: it proposes a ~15s script and pre-selects a presenter for your audience; you review/edit and confirm; a resumable pipeline (voiceover → talking head → product B-roll → assembly → multi-format reframe) runs with friendly step progress and produces a video with per-platform format tabs (9:16 / 1:1 / 16:9), saved as one multi-format Asset Kit. No prompts, model names, or costs. *(Built + in review; a real rendered video is gated on the two Phase-3 carryovers above.)*
- **Social Accounts & Publishing** (`/social`) — connect YouTube, TikTok, and Instagram through Muapi's OAuth flow (rename / disconnect connected accounts), then publish a generated video Asset Kit straight to a platform with platform-specific fields (YouTube title/description/tags/privacy, TikTok caption/privacy/interaction toggles + AI disclosure, Instagram caption/placement/share-to-feed). A **Publishing History** section lists every publish newest-first with an asset thumbnail, status badge (Processing / Published / Failed), and an expandable row exposing the live post link, any error, and one-click Retry. Publishing is async (1–5 min) and status advances by polling. *(All 6 Phase-4 slices built; live publish to real accounts is human-gated QA.)*
- **Phase 2.5 coverage additions** — a **text-graphic** asset type for text-heavy posts (legible menus, specials, quotes), **before/after composites** from two library photos, **multi-image carousels**, a **live model catalog** that hardens the Model Router against price/model drift, and region-aware seasonal + per-industry strategy data feeding the planner.
- **The Agent Loop services** (`src/lib/`): Muapi generation (retry + cost tracking), Brand Knowledge Base (pgvector embeddings) + retrieval, Model Router + live catalog, Content Planner (with quality scoring + auto-regenerate), product-photo / social-graphic / text-graphic / before-after / carousel pipelines, the full UGC video pipeline (script / voiceover / talking-head / B-roll / assembly / reframe + the `ugc-pipeline` orchestrator), caption/ad-copy generation, Asset Kit assembly, Generation Queue, and Agent Evals (feedback loop + pipeline reliability).
- **Generation tracer** — the original internal proof-of-concept route (image + caption end to end), still available.

> **Runtime notes:** the current Muapi key is on the free/sandbox tier (generations return mock placeholder media at $0); image models are shimmed to `nano-banana-2` until the key is upgraded. Planning, captions, and embeddings require a valid `OPENAI_API_KEY` (verified active). Presenter portraits are placeholder SVGs pending real, rights-cleared portraits in Phase 3.

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
