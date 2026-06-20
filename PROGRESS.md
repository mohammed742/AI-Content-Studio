# AI Content Studio — Progress

> Current status at top is overwritten every session. Session log below is append-only (keep last 5 entries).

## Current status

- **Active phase**: Phase 0 — Scaffold + Auth + DB
- **Active plan file**: `plan-phase-0.md`
- **Current sub-task**: DEV-5 → Needs Review
- **Next action**: DEV-6a (Authenticated dashboard shell) — check blockers first
- **UI work**: yes
- **Blockers**: None
- **Files modified this session**:
  - `artifacts/web/src/app/page.tsx` (landing page — 3 sections)
  - `artifacts/web/src/app/layout.tsx` (SEO metadata, metadataBase)
  - `artifacts/web/src/app/opengraph-image.tsx` (dynamic OG image)
  - `artifacts/web/src/app/privacy/page.tsx` (new — privacy policy)
  - `artifacts/web/src/app/terms/page.tsx` (new — terms of service)
  - `artifacts/web/src/components/landing/nav-bar.tsx` (new — sticky nav)
  - `artifacts/web/src/components/landing/hero-section.tsx` (new — hero section)
  - `artifacts/web/src/components/landing/features-section.tsx` (new — features)
  - `artifacts/web/src/components/landing/cta-section.tsx` (new — final CTA)
  - `artifacts/web/src/components/landing/footer.tsx` (new — footer)
  - `artifacts/web/src/env.ts` (updated — build-phase env validation)

## Concepts Introduced (cumulative)

- DEV-3: Next.js framework, TypeScript strict mode, App Router, Tailwind CSS, shadcn/ui component library
- DEV-1: Schema-as-code (Drizzle ORM type-safe table definitions), fail-fast env validation (Zod), Neon serverless PostgreSQL
- DEV-2: Auth middleware (edge-level route protection), catch-all auth routes (Clerk sub-step routing)
- DEV-4: Webhook signature verification (svix), idempotent writes (duplicate-safe DB operations), middleware bypass (whitelist pattern for server-to-server routes)
- DEV-5: Progressive Enhancement (Server Components + Client Components), SEO as Infrastructure (metadata exports, OG images, structured data), Component Locality (splitting pages into focused sections)

---

## Session log

### 2026-06-20 — DEV-5: Landing page (3-section MVP + SEO + legal pages)

**Done:**
- Created landing page at `/` with 3 sections:
  - Hero: split-screen layout (headline + CTA left, product preview mockup right)
  - Feature Showcase: 4 feature cards (Product Photos, Social Graphics, UGC Videos, Auto Calendar)
  - Final CTA: gradient background with "Ready to transform your social media?"
- Created sticky nav bar with mobile hamburger menu, SignUpButton with fallbackRedirectUrl
- Created footer with Product + Legal links
- Created `/privacy` and `/terms` placeholder pages with Zinc+Emerald styling
- Updated `layout.tsx` with comprehensive SEO: title, description, OG tags, Twitter card, metadataBase, robots
- Created `/opengraph-image.tsx` (edge runtime, dynamic 1200x630 PNG)
- Added JSON-LD SoftwareApplication schema on landing page
- Updated `env.ts` to skip validation during build phase (NEXT_PHASE check)
- `pnpm --filter @workspace/web run typecheck` → 0 errors
- `pnpm --filter @workspace/web run lint` → 0 warnings, 0 errors
- Screenshot verification: landing page, privacy, terms all render correctly
- Linear: DEV-5 completion comment posted (all 6 sections)

---

### 2026-06-20 — DEV-4: Clerk webhook → create user record in DB

**Done:**
- Created `src/app/api/webhooks/clerk/route.ts` with POST handler
  - Verifies svix signature using `CLERK_WEBHOOK_SECRET` to prevent spoofed payloads
  - Handles `user.created` → inserts new row into `users` table (with duplicate-check)
  - Handles `user.updated` → updates existing row in `users` table
  - Returns 400 for missing svix headers or invalid signature, 200 on success
- Updated `src/env.ts` to validate `CLERK_WEBHOOK_SECRET` with Zod
- Updated `src/middleware.ts` to bypass Clerk auth for `/api/webhooks(.*)` routes
- Installed `svix` v1.96.0 as runtime dependency
- `pnpm --filter @workspace/web run typecheck` → 0 errors
- `pnpm --filter @workspace/web run lint` → 0 warnings, 0 errors
- Linear: DEV-4 completion comment posted (all 6 sections); moved → Needs Review

---

### 2026-06-20 — DEV-2: Clerk auth integration (sign-in, sign-up, middleware, protected routes)

**Done:**
- Added ClerkProvider wrapper in `src/app/layout.tsx` (children inside html body)
- Created `src/middleware.ts` with clerkMiddleware + createRouteMatcher protecting `/dashboard(.*)`
- Created `/sign-in/[[...sign-in]]/page.tsx` with Clerk SignIn component (Zinc/Emerald dark theme)
- Created `/sign-up/[[...sign-up]]/page.tsx` with Clerk SignUp component (matching dark theme)
- Updated `src/env.ts` with NEXT_PUBLIC_CLERK_SIGN_IN_URL and NEXT_PUBLIC_CLERK_SIGN_UP_URL (defaults to /sign-in and /sign-up)
- `pnpm --filter @workspace/web run typecheck` → 0 errors
- `pnpm --filter @workspace/web run lint` → 0 warnings, 0 errors
- Linear: DEV-2 completion comment posted (all 5 sections); moved → Needs Review

---

### 2026-06-20 — DEV-1: Drizzle ORM + Neon schema push (users table)

**Done:**
- Created `src/db/schema.ts` with `users` table (id/cuid, clerkId unique, email, name, imageUrl, role enum, createdAt/updatedAt)
- Created `src/db/index.ts` with Drizzle client using `@neondatabase/serverless` (Neon HTTP driver)
- Created `drizzle.config.ts` for Drizzle Kit schema push
- Updated `src/env.ts` to validate `DATABASE_URL`, `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY` with Zod
- Added `db:push` and `db:studio` scripts to `package.json`
- Created `.eslintrc.json` to resolve missing ESLint config from scaffold
- Used hand-written Zod insert schema instead of `drizzle-zod` (peer dependency mismatch with Zod v3)
- Full workspace `pnpm run typecheck` → 0 errors
- `pnpm --filter @workspace/web run lint` → 0 warnings, 0 errors
- Did NOT run `db:push` (no DATABASE_URL in env yet)
- Linear: DEV-1 completion comment posted (all 6 sections); moved → Needs Review

---

### 2026-06-19 — DEV-3: Scaffold Next.js 15 + Tailwind + shadcn/ui

**Done:**
- Created `artifacts/web/` via `createArtifact` (react-vite bootstrap) + replaced artifact.toml for Next.js on port 22333
- Next.js 15.5, TypeScript strict, Tailwind CSS 3, shadcn/ui (Zinc base, Emerald `--primary`, dark mode)
- Geist Sans + Geist Mono via `geist` npm package; Sonner Toaster in layout
- `src/env.ts` minimal Zod schema; expands in DEV-1/DEV-2/DEV-4
- All Phase 0 deps installed: `@clerk/nextjs`, `@neondatabase/serverless`, `drizzle-orm`, `geist`, `framer-motion`, `sonner`, `zod`, etc.
- `allowedDevOrigins` set in `next.config.ts` for Replit proxy
- Full workspace typecheck → 0 errors (all 4 packages)
- Dev server running; GET / 200; dark Zinc/Emerald theme confirmed in screenshot
- Linear: DEV-3 approach comment + completion comment posted; moved → Needs Review
- **Portfolio checkpoint**: `phase-0: scaffold Next.js 15 + Tailwind + shadcn/ui`
