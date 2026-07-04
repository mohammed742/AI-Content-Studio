# AI Content Studio — Progress

> Current status at top is overwritten every session. Session log below is append-only (keep last 5 entries).

## Current status

- **Active phase**: Phase 0.5 — Tracer Bullet
- **Active plan file**: `plan-phase-0-5.md`
- **Current sub-task**: DEV-8 (Muapi integration proof — generate product photo, parse cost, save to R2) → Needs Review (awaiting human review; Linear left In Progress — team workflow has no "Needs Review" status)
- **Next action**: Await review/approval on DEV-8, then next tracer slice (real Agent Loop wiring beyond the proof-of-concept)
- **UI work**: yes
- **Blockers**: Pre-existing bug found (not fixed, out of scope) — `layout.tsx` reads `env.CLERK_PUBLISHABLE_KEY`, which doesn't exist in the env schema (`NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` is defined instead). Blocks a clean full-repo `pnpm typecheck`.
- **Files modified this session**:
  - `artifacts/web/src/lib/muapi.ts` (new — `MuapiService.generate`, posts to Muapi, parses `X-MuAPI-Cost-USD` header)
  - `artifacts/web/src/lib/r2.ts` (new — `R2Service.upload` via `@aws-sdk/client-s3` against the R2 S3-compatible endpoint)
  - `artifacts/web/src/env.ts` (updated — added `R2_PUBLIC_URL` to Zod schema)
  - `artifacts/web/src/app/api/tracer/generate-image/route.ts` (new — auth-gated route: Muapi generate → download → R2 upload → `{data, error}` response)
  - `artifacts/web/src/app/dashboard/tracer/page.tsx` (updated — "Run Tracer" now calls the route and renders image/cost/duration/error states)
  - `artifacts/api-server/.replit-artifact/artifact.toml` (updated — moved API Server's proxy path/previewPath from `/api` to `/internal-api`; it was an unused health-check stub colliding with the web app's own `/api/*` routes)
  - `artifacts/api-server/src/app.ts` (updated — router mount moved from `/api` to `/internal-api` to match)
  - `lib/api-spec/orval.config.ts` (updated — codegen `baseUrl` moved from `/api` to `/internal-api`; ran codegen to regenerate the unused generated client)

## Concepts Introduced (cumulative)

- DEV-3: Next.js framework, TypeScript strict mode, App Router, Tailwind CSS, shadcn/ui component library
- DEV-1: Schema-as-code (Drizzle ORM type-safe table definitions), fail-fast env validation (Zod), Neon serverless PostgreSQL
- DEV-2: Auth middleware (edge-level route protection), catch-all auth routes (Clerk sub-step routing)
- DEV-4: Webhook signature verification (svix), idempotent writes (duplicate-safe DB operations), middleware bypass (whitelist pattern for server-to-server routes)
- DEV-5: Progressive Enhancement (Server Components + Client Components), SEO as Infrastructure (metadata exports, OG images, structured data), Component Locality (splitting pages into focused sections)
- DEV-6: Route Group Isolation (dashboard-only layouts), Dynamic Rendering for Auth-Dependent Pages, CSS-Only Transitions for Collapsible UI
- DEV-7: Fail-fast configuration for third-party services (Muapi, OpenAI, R2), building against a hardcoded fixture ahead of real onboarding/DB data
- DEV-8: External API cost metering (parsing per-call cost from response headers), server-side asset persistence (download-then-upload to object storage instead of trusting a third-party URL to stay alive), path-based service routing (why two backend services can't claim the same URL prefix)

---

## Session log

### 2026-07-04 — DEV-8: Muapi integration proof (product photo → cost → R2)

**Done:**
- Created `src/lib/muapi.ts` — `MuapiService.generate(model, params)` posts to Muapi's generate endpoint with Bearer auth, parses `X-MuAPI-Cost-USD` from the response headers, returns `{ imageUrl, cost, model }`
- Created `src/lib/r2.ts` — `R2Service.upload(key, buffer, contentType)` using `@aws-sdk/client-s3` against R2's S3-compatible endpoint, returns the public URL
- Added `R2_PUBLIC_URL` to the Zod env schema
- Created `src/app/api/tracer/generate-image/route.ts` — auth-gated POST route: builds a prompt from the hardcoded fixture's first product → calls Muapi → downloads the returned image → uploads it to R2 → responds `{ data: { r2Url, cost, duration }, error: null }`
- Wired the tracer page's "Run Tracer" button to call the route and render the resulting image, cost, and duration, with an error state
- `pnpm --filter @workspace/web run typecheck` → 0 new errors from this slice's files (same 1 pre-existing unrelated error, see Blockers)
- `pnpm --filter @workspace/web run lint` → 0 warnings, 0 errors
- **Found and fixed a routing collision**: a separate, already-registered "API Server" artifact (an unused Express stub with only a health check) had claimed the entire `/api` path prefix at the shared proxy, silently swallowing every `/api/*` route in the Next.js app. Flagged to the user, got explicit approval, then moved the API Server's path to `/internal-api` (`artifact.toml`, its Express mount, and the orval codegen `baseUrl`) and reran codegen. Verified via curl that `/api/tracer/generate-image` now correctly reaches the Next.js route (401 when signed out, as expected) and `/internal-api/healthz` still serves the API Server.
- Full workspace `pnpm run typecheck` re-run after the routing fix — `api-server`, `mockup-sandbox`, and `scripts` all pass clean; `web` has only the same pre-existing unrelated error
- Linear: DEV-8 moved Backlog → In Progress, completion comment posted (5-section format); could not move to "Needs Review" — status doesn't exist in this team's workflow (same known gap as DEV-7)

**Found (not fixed, out of scope):**
- `src/app/layout.tsx` reads `env.CLERK_PUBLISHABLE_KEY`, still not added to the env schema — same pre-existing bug noted in DEV-7, unrelated to this slice.
- Muapi's actual response schema wasn't verified against official docs this session; the client tries several fallback keys (`output`/`url`/`image_url`/`imageUrl`) for the image URL. Worth confirming against real API docs/responses in a follow-up slice if the live call doesn't return the shape expected.

---

### 2026-07-04 — DEV-7: Hardcoded business profile + tracer page shell

**Done:**
- Added `MUAPI_API_KEY`, `OPENAI_API_KEY`, `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET_NAME` to the Zod env schema in `src/env.ts`
- Requested/confirmed all 6 secrets in Replit Secrets (only `MUAPI_API_KEY` was missing; user provided it)
- Created `src/lib/tracer-data.ts`: hardcoded Business Profile fixture for "Sunrise Café" (bakery, playful tone, 3 brand colors, 3 sample products)
- Created `/dashboard/tracer` page: profile summary card, "Run Tracer" button (local state only, no pipeline call yet), empty Results card
- `pnpm --filter @workspace/web run typecheck` → 0 new errors from this slice's files (1 pre-existing unrelated error remains, see Blockers)
- `pnpm --filter @workspace/web run lint` → 0 warnings, 0 errors
- Verified `/dashboard/tracer` correctly redirects unauthenticated users to sign-in
- Linear: DEV-7 moved Backlog → In Progress, completion comment posted (5-section format); could not move to "Needs Review" — status doesn't exist in this team's workflow

**Found (not fixed, out of scope):**
- `src/app/layout.tsx` reads `env.CLERK_PUBLISHABLE_KEY`, which was never added to the env schema (`NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` is what's defined). Breaks full-repo `pnpm typecheck`. Introduced in an earlier commit, unrelated to this slice.

---

### 2026-06-20 — DEV-6: Authenticated dashboard shell (sidebar + header + empty state)

**Done:**
- Created dashboard route group at `/app/dashboard/` with `layout.tsx`, `page.tsx`, `error.tsx`
- Created `DashboardShell` component with fixed sidebar + main content area, per DESIGN.md §9.4
- Created `Sidebar` component: 5 nav items (Dashboard, Content Plan, Calendar, Gallery, Settings), collapsible (280px↔64px), tooltips on collapsed icons, user avatar + email at bottom, sign-out button
- Created `Header` component: sticky top bar, mobile hamburger menu (Sheet), page title, breadcrumbs
- Created `EmptyState` component: centered card with Sparkle icon, welcome message, CTA to `/onboarding`
- Created `error.tsx` boundary: "Try again" reset + "Go to Dashboard" fallback
- Mobile responsive: sidebar hidden on <1024px, hamburger opens Sheet-based sidebar
- Added `dynamic: "force-dynamic"` to dashboard layout and root layout to prevent Clerk static-prerender failures
- Added `lucide-react` and `class-variance-authority` dependencies (missing from shadcn/ui setup)
- `pnpm --filter @workspace/web run typecheck` → 0 errors
- `pnpm --filter @workspace/web run lint` → 0 warnings, 0 errors
- `NEXT_PHASE=phase-production-build npx next build --no-lint` → completed (9 routes, all dynamic)
- Unauthenticated `/dashboard` → correctly redirects to Clerk sign-in
- Linear: DEV-6 completion comment posted (all 6 sections); moved → Needs Review

---

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
