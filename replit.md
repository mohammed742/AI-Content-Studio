# AI Content Studio — Agent Instructions

> **Read this fully, then: PROGRESS.md → active phase file → CONTEXT.md. Read DESIGN.md only if the slice involves UI.**

## Project

**AI Content Studio** — AI-powered social media content platform for SMBs. Users describe their business; the agent generates product photos, graphics, video ads, captions, hashtags, and publishes to YouTube/TikTok/Instagram. Pricing: $19–99/month.

## Tech Stack

| Layer | Tech | Purpose |
|-------|------|---------|
| Framework | Next.js 15 + TypeScript | Full-stack, App Router, API routes |
| Styling | Tailwind CSS + shadcn/ui | Rapid UI, Radix components |
| Auth | Clerk | Managed auth, webhooks, user sync |
| Database | Neon (PostgreSQL) + Drizzle ORM | Serverless DB, type-safe schema |
| RAG | pgvector + OpenAI `text-embedding-3-small` | Brand Knowledge Base |
| Visual AI | Muapi.ai | 50+ models, single API key, social publishing |
| Text AI | OpenAI GPT-4.1-mini (Vercel AI SDK) | Captions, scripts, calendar, hashtags |
| Payments | Stripe | Subscriptions, webhooks, metering |
| Storage | Cloudflare R2 | Generated media assets |
| Analytics | GA4 + PostHog | Traffic + product analytics |
| Errors | Sentry | Server + client error tracking |
| Email | Brevo | Transactional + lifecycle emails |
| Deployment | Replit | Dev + hosting |
| PM | Linear (`STU-xxx`) | Slices, DAG, statuses |

## Files

| File | Purpose | Load when |
|------|---------|-----------|
| `replit.md` | This file — master instructions | Every session (auto) |
| `PROGRESS.md` | Current status + session logs | Every session |
| `plan-phase-N.md` | Active phase plan + acceptance criteria | Every session (only active phase) |
| `CONTEXT.md` | Domain glossary (70+ terms) | Every session |
| `DESIGN.md` | UI/UX specs, color system, page specs | **UI slices only** |
| `ARCHITECTURE.md` | System arch, Agent Loop, DB schema, API routes | On demand |
| `WORKFLOW.md` | Session lifecycle, done definitions, rules | Every session |
| `workflow-protocols.md` | Grill-me, diagnose, code review, QA fix loop | **On demand** (when triggered) |
| `README.md` | Living project README | Updated at phase end |
| `docs/adr/` | Architecture Decision Records | On demand |

## Session Protocol

### Start
1. Read this file → PROGRESS.md (current status only) → active `plan-phase-N.md` → CONTEXT.md
2. If UI slice: also read DESIGN.md
3. Check Linear for next **Todo** issue with all blockers **Done** → move to **In Progress**

### During
- **One slice per session.** Never start the next.
- **Feedback loop:** `pnpm typecheck && pnpm lint` after every change. Full `pnpm test` at milestones and before completion only.
- **TDD scope:** Strict TDD for `src/lib/` services, API routes, webhooks. UI components get smoke test + human visual QA.
- Use CONTEXT.md vocabulary everywhere. No drive-by refactors (log as tech debt).
- After completing a slice, scan your code for domain terms. If any term is used inconsistently with CONTEXT.md, fix the code or update CONTEXT.md.
- Update the "Concepts Introduced" list in PROGRESS.md with any new concepts from this slice.

### End
1. `pnpm build` to confirm no regressions
2. Post **one completion comment** on Linear issue with these sections:
   - **What was built** — plain English, no jargon
   - **What was tested** — which checks passed (typecheck, lint, test, build)
   - **🎓 What You Learned** — identify the 2-3 most important concepts introduced by this slice. Follow these rules strictly:
     (1) Name concepts, not tools. Say "type safety" not "TypeScript", "authentication" not "Clerk", "schema-as-code" not "Drizzle". The concept transfers; the tool name doesn't.
     (2) Do NOT explain technologies like a documentation page. Explain the specific problem that was solved and why the decision mattered for THIS project.
     (3) For each concept use this format:
         ### [Concept Name]
         [One sentence: what real-world problem this solves.]
         **Without it:** [what goes wrong — be specific to this project]
         **With it:** [what improves — be specific to this project]
         → [Link to official docs from RESOURCES.md]
     (4) No jargon without immediate explanation. No code snippets. No overused analogies (restaurants, kitchens, cooking, recipes, filing cabinets, etc.).
     (5) Check PROGRESS.md "Concepts Introduced" — don't re-explain concepts from earlier slices.
     (6) Every explanation must answer: "Why should I care?"
     (7) The entire 🎓 section must take under 2 minutes to read. If it's longer, cut it.
   - **💬 Explain It Yourself** — two questions that force the reader to recall what they learned without looking back:
     (1) **Client question:** "If a client asked 'Why did you build it this way instead of the simpler approach?' — what would you say?"
     (2) **Interview question:** "Explain [the main concept from this slice] in 30 seconds as if the interviewer has never heard of it."
   - **QA Checklist** — a markdown checklist (`- [ ]`) of specific steps the reviewer should follow to verify the work. Keep it concrete and actionable (e.g. "Sign up with a test account and confirm a user row appears in the database"). No vague items like "verify it works."
   - **Anything the reviewer should know** — gotchas, deviations from the plan, decisions made
3. Move issue → **Needs Review**
4. Update PROGRESS.md (overwrite current status + append session log)
5. Last slice of a phase → also update README.md

### QA Fix Loop
Review findings → fix blockers first → re-test → post fix comment → re-submit. See `workflow-protocols.md § QA Fix Loop`.

## Linear
- **Statuses:** Backlog → Todo → In Progress → Needs Review → Done
- **Labels:** `phase-0` through `phase-6`, `slice`, `bug`, `tech-debt`, `adr`
- **Two writes per slice:** approach note at start, completion comment at end
- **DAG:** check `blockedBy` before picking next issue. Fallback: PROGRESS.md

## Hard Rules

- Do not start next phase until active one is verified
- One checkpoint per completed slice — title: `phase-N: <verb> <thing>`
- Never push to remote — Replit checkpoints only
- No `.env.local`, `node_modules`, or generated media commits
- Always update PROGRESS.md at session end and sync Linear
- Use CONTEXT.md terms — add undefined terms as they emerge
- No silent direction changes — surface or log in PROGRESS.md

## Coding Standards

- **TypeScript:** strict mode, no `any`, Zod for all validation
- **Next.js:** Server Components default, `'use client'` only when needed, `{ data, error }` API shape, error boundaries on every page
- **DB:** Drizzle ORM only (no raw SQL), `createdAt`/`updatedAt` on all tables, schema push for dev
- **Env:** `.env.local` validated at startup via Zod (`src/env.ts`), no `NEXT_PUBLIC_` for secrets

## Architecture Reference

For detailed architecture (Agent Loop pipeline, social publishing OAuth flow, UGC video pipeline, RAG/pgvector setup, model routing, DB schema), see **ARCHITECTURE.md**.

## When in Doubt

Ask before guessing. The human unblocks; the agent does not fabricate.
