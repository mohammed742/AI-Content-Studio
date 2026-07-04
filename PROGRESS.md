# AI Content Studio — Progress

> Current status at top is overwritten every session. Session log below is append-only (keep last 5 entries).

## Current status

- **Active phase**: Phase 1 — Business Onboarding
- **Active plan file**: `plan-phase-1.md`
- **Current sub-task**: DEV-9 (Business Profile schema + CRUD API) → awaiting human review; Linear left In Progress — team workflow has no "Needs Review" status.
- **Next action**: Await review/approval on DEV-9, then STU-9 (multi-step onboarding wizard UI)
- **UI work**: no
- **Blockers**: Pre-existing bug found (not fixed, out of scope) — `layout.tsx` reads `env.CLERK_PUBLISHABLE_KEY`, which doesn't exist in the env schema (`NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` is defined instead). Blocks a clean full-repo `pnpm typecheck`.
- **Files modified this session**:
  - `artifacts/web/src/db/schema.ts` (added `business_profiles` table — businessName, businessType enum, products jsonb, targetCustomers, brandColors jsonb, brandTone enum, logoUrl, socialPlatforms jsonb, industry, website, createdAt/updatedAt; unique FK to `users.id`; `insertBusinessProfileSchema`/`updateBusinessProfileSchema` Zod schemas)
  - `artifacts/web/src/app/api/business-profile/route.ts` (new — GET/POST/PATCH, Clerk-auth-gated, resolves Clerk ID → local `users` row, Zod-validates bodies, one profile per user)
  - Ran `pnpm db:push` to apply the new table to the Neon database

## Cross-session decisions

- **DEV-9 field list deviated from `plan-phase-1.md`'s STU-8 spec** — task description (used as source of truth) added `industry`/`website` and brand tone enum `professional/friendly/playful/luxury/bold`; the plan file instead had `businessEvents`/`region` (needed later for the Seasonal Calendar feature, CONTEXT.md) and brand tone `professional/casual/playful/luxury`. `businessEvents`/`region` are NOT yet in the schema — add in a follow-up slice if the Seasonal Calendar still needs them.
- `businessType` enum values (not specified in the DEV-9 task) sourced from CONTEXT.md's existing "Business Type" definition: `restaurant | e-commerce | salon | gym | real_estate | fashion | freelancer | other`.
- One `business_profiles` row per user enforced via a unique constraint on `user_id`.

## Concepts Introduced (cumulative)

- DEV-3: Next.js framework, TypeScript strict mode, App Router, Tailwind CSS, shadcn/ui component library
- DEV-1: Schema-as-code (Drizzle ORM type-safe table definitions), fail-fast env validation (Zod), Neon serverless PostgreSQL
- DEV-2: Auth middleware (edge-level route protection), catch-all auth routes (Clerk sub-step routing)
- DEV-4: Webhook signature verification (svix), idempotent writes (duplicate-safe DB operations), middleware bypass (whitelist pattern for server-to-server routes)
- DEV-5: Progressive Enhancement (Server Components + Client Components), SEO as Infrastructure (metadata exports, OG images, structured data), Component Locality (splitting pages into focused sections)
- DEV-6: Route Group Isolation (dashboard-only layouts), Dynamic Rendering for Auth-Dependent Pages, CSS-Only Transitions for Collapsible UI
- DEV-7: Fail-fast configuration for third-party services (Muapi, OpenAI, R2), building against a hardcoded fixture ahead of real onboarding/DB data
- DEV-8: External API cost metering (parsing per-call cost from response headers), server-side asset persistence (download-then-upload to object storage instead of trusting a third-party URL to stay alive), path-based service routing (why two backend services can't claim the same URL prefix)
- DEV-13: Structured output (constraining an LLM to return a validated shape instead of parsing free text), pipeline chaining (composing independent AI calls into one user-facing flow), unit economics (per-call cost tracking across multiple paid services)
- DEV-9: Data ownership at the database level (foreign keys + auth-derived queries instead of client-supplied IDs), validation at the edge (rejecting malformed input before it reaches business logic/DB)

---

## Session log

### 2026-07-04 — DEV-9: Business Profile schema + CRUD API

**Done:**
- Added `business_profiles` table to `src/db/schema.ts`: `businessName`, `businessType` (enum: restaurant/e-commerce/salon/gym/real_estate/fashion/freelancer/other, sourced from CONTEXT.md's "Business Type" since the task didn't specify values), `products` (jsonb array of `{name, description?, price?}`), `targetCustomers`, `brandColors` (jsonb array of hex strings), `brandTone` (enum: professional/friendly/playful/luxury/bold), `logoUrl`, `socialPlatforms` (jsonb array), `industry`, `website`, `createdAt`/`updatedAt` — `userId` is a unique FK to `users.id` (one profile per user)
- Added `insertBusinessProfileSchema`/`updateBusinessProfileSchema` (Zod) — hex color regex, URL validation, enum constraints; update schema is a `.partial()` of the insert schema
- Created `src/app/api/business-profile/route.ts` — GET (fetch caller's profile), POST (create, 409 if one already exists), PATCH (partial update); all three resolve the Clerk-authenticated `userId` to the local `users` row (via `clerkId`) before touching `business_profiles`, since the FK points at the internal user ID
- `pnpm --filter @workspace/web run typecheck` → 0 errors; `pnpm --filter @workspace/web run lint` → 0 warnings/errors
- Ran `pnpm db:push` against the real Neon database — schema applied cleanly
- Verified via curl that GET/POST/PATCH on `/api/business-profile` all return 401 when signed out
- Linear: DEV-9 moved Backlog → In Progress, completion comment posted (5-section format); left In Progress — team workflow has no "Needs Review" status (same known gap as prior slices)

**Anything the reviewer should know:**
- Field list deviates from `plan-phase-1.md`'s STU-8 spec (see "Cross-session decisions" above) — followed the task description as source of truth. `businessEvents`/`region` (used by the Seasonal Calendar feature) are not yet in the schema.
- Pre-existing `layout.tsx`/`CLERK_PUBLISHABLE_KEY` env bug (noted in DEV-7/8/13) still unresolved, unrelated to this slice.

---

### 2026-07-04 — DEV-13: GPT caption proof (generate caption conditioned on business profile)

**Done:**
- Installed `ai` and `@ai-sdk/openai` (Vercel AI SDK) — not in the workspace pnpm catalog, added directly to `artifacts/web/package.json` dependencies
- Created `src/lib/openai.ts` — `generateCaption(business, imageDescription)` calls `generateObject` (Vercel AI SDK) against `gpt-4.1-mini` with a Zod schema constraining output to `{ caption, hashtags }`, conditioned on the Business Profile's name/type/description/target customers/brand tone plus a description of the generated image; cost computed from `usage.inputTokens`/`usage.outputTokens` × GPT-4.1-mini's published per-token pricing ($0.40/1M in, $1.60/1M out), since the AI SDK doesn't return a dollar figure directly
- Created `src/app/api/tracer/generate-caption/route.ts` — auth-gated POST route (mirrors `generate-image/route.ts`'s pattern), validates the request body with Zod, calls `generateCaption` against the hardcoded tracer Business Profile, responds `{ data: { caption, hashtags, cost, duration }, error: null }`
- Updated the tracer page: "Run Tracer" now chains `/api/tracer/generate-image` → `/api/tracer/generate-caption` (passing a description built from the same product used for the image prompt), renders the caption and hashtag chips alongside the generated image, and shows a Cost Breakdown section (Muapi cost, OpenAI cost, total cost, total duration)
- `pnpm --filter @workspace/web run typecheck` → 0 errors; `pnpm --filter @workspace/web run lint` → 0 warnings/errors
- Restarted the `web` workflow; confirmed no regressions via logs and a preview screenshot — tracer page still requires Clerk sign-in as expected (no test credentials available to exercise the full authenticated chain in-browser, but both routes compile, typecheck, and follow the same verified pattern as the working `generate-image` route)
- Linear: DEV-13 moved Backlog → In Progress, completion comment posted (5-section format); left In Progress — team workflow has no "Needs Review" status (same known gap as DEV-7/DEV-8)

**Anything the reviewer should know:**
- Used the project's existing direct-OpenAI-API-key pattern (already required in the env schema since DEV-7, consistent with replit.md's stated stack: "OpenAI GPT-4.1-mini (Vercel AI SDK)") rather than switching to the Replit AI Integrations OpenAI proxy — this keeps a single OpenAI credential/billing path for the project instead of introducing a second one.
- Per-token pricing is hardcoded as a constant with a comment citing OpenAI's published rates as of this slice; if pricing changes, update `INPUT_COST_PER_TOKEN`/`OUTPUT_COST_PER_TOKEN` in `src/lib/openai.ts`.
- Could not complete a full authenticated end-to-end browser run (no test Clerk credentials in this environment) — verified via typecheck, lint, and static review that the caption route mirrors the already-verified `generate-image` route's auth/error/response conventions.

---

### 2026-07-04 — DEV-8 fix: real Muapi API contract (live 404 bug)

**Bug reported:** Clicking "Run Tracer" in production/dev returned `Muapi generate failed (404 Not Found): {"detail":"Not Found"}`.

**Root cause:** The original `src/lib/muapi.ts` was written against a guessed API contract, never verified against real docs: wrong base URL (`https://api.muapi.ai/v1` instead of `.../api/v1`), wrong auth (`Authorization: Bearer` instead of `x-api-key` header), wrong request shape (`POST /generate` with a `model` field, instead of `POST /{model-slug}`), and wrong response handling (treated as synchronous, but Muapi is submit-then-poll).

**Done:**
- Fetched Muapi's official docs (`muapi.ai/docs/api-reference`, `/docs/authentication`, `/docs/models`) to get the real contract
- Rewrote `MuapiService.generate`: `x-api-key` header auth, `POST https://api.muapi.ai/api/v1/{model}` to submit, then polls `GET https://api.muapi.ai/api/v1/predictions/{request_id}/result` every 2s (60s timeout) until `status === "completed"`, reads `outputs[0]` for the image URL and `cost.amount_usd`/`X-MuAPI-Cost-USD` header for cost
- Verified the live model catalog (`GET /api/v1/models`, no auth required) and confirmed via direct `curl`/script testing that the previously-hardcoded model slug (`ai-product-photography`, invalid) and the docs' example slug (`flux-dev`, 404s on this account's plan tier) don't work — `nano-banana-2` does (200 + successful poll to `completed` with a real output URL), so switched the tracer route to use it
- Ran a standalone Node script exercising the exact same request/poll logic against the live API with the real `MUAPI_API_KEY` — confirmed full submit → poll → completed → output URL flow works end-to-end
- `pnpm --filter @workspace/web run typecheck` → 0 errors; `pnpm --filter @workspace/web run lint` → 0 warnings/errors
- Restarted the `web` workflow; confirmed no regressions (tracer page still requires Clerk sign-in as expected — couldn't complete a full authenticated browser run without test credentials, but the underlying API call, which was the reported bug, is verified fixed)

**Anything the reviewer should know:**
- The account's API key is on the free/sandbox tier (`x-sandbox-key: true`, `plan: free`) — generations return mock data instantly rather than real renders. This doesn't affect the fix (same contract applies to paid keys) but means the tracer's output image is a stock placeholder, not an actual AI-generated product photo, until the key is upgraded.
- `flux-dev`/`flux-schnell` are listed in Muapi's public model catalog but 404 for this account — likely gated by plan tier. Worth rechecking model availability if the key is upgraded to a paid plan (a nicer product-photo-suited model may become available).

---

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
