# AI Content Studio — Progress

> Current status at top is overwritten every session. Session log below is append-only (keep last 5 entries).

## Current status

- **Active phase**: Phase 1 — Business Onboarding
- **Active plan file**: `plan-phase-1.md`
- **Current sub-task**: DEV-14 (Dashboard summary card) + DEV-10 §9.3 polish (dots/skip/persona pills) → done this session, awaiting human review. All phase-1 slices now implemented.
- **Next action**: Await review on DEV-14, DEV-12, DEV-59, DEV-10 (all left In Progress — no "Needs Review" status). Phase 1 is feature-complete; on approval, update README (last-slice-of-phase rule) and pick the next phase. Deferred: DEV-60 (PostHog onboarding events, Phase 8).
- **UI work**: yes (DESIGN.md consulted)
- **Blockers**: None. (Long-standing "layout.tsx reads `env.CLERK_PUBLISHABLE_KEY`" blocker verified **stale** during the 2026-07-05 phase-1 audit — the code uses `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` correctly and typecheck passes; removed.)
- **Files modified this session**:
  - `artifacts/web/src/lib/local-user.ts` (new — DEV-59 bug fix: `ensureLocalUser` JIT user provisioning when the Clerk webhook hasn't synced)
  - `artifacts/web/src/app/api/business-profile/route.ts` (DEV-59 — all three handlers use `ensureLocalUser` instead of lookup-only `getLocalUser`)
  - `artifacts/web/src/app/onboarding/page.tsx` (new — full-screen onboarding per DESIGN.md §9.3, human decision; replaces `src/app/dashboard/onboarding/`, which was deleted)
  - `artifacts/web/src/middleware.ts` (protected matcher now covers `/onboarding(.*)` in addition to `/dashboard(.*)`)
  - `artifacts/web/src/app/dashboard/page.tsx` (DEV-14 — now a Server Component: fetches profile, redirects to `/onboarding` if none, else renders greeting + CTA + summary card)
  - `artifacts/web/src/components/dashboard/business-profile-card.tsx` (new — DEV-14 summary card: logo, name, type, preset badge, tone, color swatches, products, platforms, target customers)
  - `artifacts/web/src/components/dashboard/empty-state.tsx` (DELETED — dead after the redirect supersedes it)
  - `artifacts/web/src/components/onboarding/onboarding-wizard.tsx` (DEV-10 §9.3: progress dots replace the bar; "Skip for now" + warning on optional steps 2/3/5)
  - `artifacts/web/src/components/onboarding/step-customers.tsx` (DEV-10 §9.3: AI-suggested persona pills from the industry preset, click-to-fill)
  - `artifacts/web/src/lib/industry-templates.ts` (new — `IndustryTemplate` per `businessType` enum value: suggested products, sample target-customer text, recommended tones/platforms, suggested content types (canonical Content Type enum), posting schedule (`postsPerWeek` + weekday→content-type `weeklyPlan`), example hashtags; also `CONTENT_TYPE_LABELS` map for UI — reconciled to plan-phase-1.md step 5)
  - `artifacts/web/src/components/onboarding/suggested-for-you.tsx` (new — "Suggested for you" panel: recommended tone pill + "filled in for you" note, content-idea pills, posting cadence; framer-motion fade-in, emerald/zinc per DESIGN.md)
  - `artifacts/web/src/components/onboarding/onboarding-wizard.tsx` (new `handleBusinessTypeSelect` — merges template defaults into empty fields only + always records `industryPreset`; `industryPreset` added to submit payload)
  - `artifacts/web/src/components/onboarding/step-business-type.tsx` (`onSelectBusinessType` prop replaces direct `onChange({businessType})` call; renders `SuggestedForYou` when a type is selected)
  - `artifacts/web/src/components/onboarding/onboarding-data.ts` (added `industryPreset` to `OnboardingFormState` + `INITIAL_FORM_STATE`)
  - `artifacts/web/src/db/schema.ts` (amended DEV-9's `business_profiles`: added nullable `industry_preset` column [enum: BUSINESS_TYPES] + `industryPreset` in insert Zod schema) — pushed to Neon via `db:push`
- **Files modified in prior session (DEV-11)**:
  - `artifacts/web/src/app/api/upload/logo/route.ts` (new — auth-gated multipart upload → R2, magic-byte + SVG active-content validation)
  - `artifacts/web/src/lib/extract-colors.ts` (new — client-side canvas dominant-color extraction, no external package)
  - `artifacts/web/src/lib/r2.ts` (upload now accepts optional `contentDisposition`)
  - `artifacts/web/src/components/onboarding/step-brand.tsx` (logo upload UI + auto color merge), `step-review.tsx` (logo thumbnail), `onboarding-data.ts` (logoUrl in form state)

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
- DEV-10: Single source of truth for multi-step forms (parent-owned state surviving navigation), two-layer validation (client UX checks + server safety checks), graceful conflict recovery (409 → route the user forward instead of erroring)
- DEV-11: Content-based file validation (magic bytes over client-claimed MIME), SVG-as-active-content risk (sanitize + Content-Disposition: attachment), functional state updates (merging async results against latest state, not captured state), client-side pixel analysis (canvas getImageData color quantization)
- DEV-12: Non-destructive defaults (auto-filling a form only where the user hasn't already typed something, so a preset never clobbers real input), exhaustiveness checking (TypeScript's `Record<enum, T>` forcing every enum value to have a corresponding data entry, catching an incomplete data file at compile time instead of at runtime), data provenance (recording which preset seeded a record so later features can build on the original choice)
- DEV-59: Just-in-time provisioning (creating a dependent record on first authenticated use instead of trusting an async webhook to have run), webhook-as-primary/JIT-as-fallback sync (eventual consistency between an external auth provider and the local DB), race-safe idempotent insert (`ON CONFLICT DO NOTHING` + re-select against a unique key)
- DEV-14: Redirect-as-control-flow (a server page deciding whether to render or reroute before any HTML is sent), server-side data fetching (querying the DB in the component instead of a client fetch + loading state), closing the onboarding loop (reflecting a user's own entered data back to them)

---

## Session log

### 2026-07-05 — DEV-14 dashboard summary card + DEV-10 §9.3 wizard polish

**Done:**
- **DEV-14 (Dashboard summary card):** `dashboard/page.tsx` is now a Server Component — fetches the caller's profile (via `ensureLocalUser` + Drizzle), redirects to `/onboarding` when there's none (plan step 8 / audit finding #3), else renders "Welcome back, {name}", a "Coming soon" primary CTA (DESIGN §9.4; generation is Phase 2), and the new `BusinessProfileCard` (logo, name, type, "Started from {preset}" badge, tone, brand-color swatches, products, platforms w/ icons, target customers). This fixes the reported "dashboard shows Welcome instead of business details." Deleted the now-dead `empty-state.tsx`
- **DEV-10 §9.3 polish (flag 1):** progress **dots** replace the segmented bar + step-counter; **"Skip for now"** + "Skipping reduces generation quality" warning on optional steps (2 Products, 3 Customers, 5 Platforms; not on required 1/4); **persona pills** in the Customers step (industry sample customers, click-to-fill, selected-state)
- **Deferred:** PostHog onboarding events (4th §9.3 item) — PostHog not wired + plan says Analytics is Phase 8. Filed as DEV-60 (Backlog)
- `typecheck ✅` · `lint ✅` · browser-verified card + persona pills + dots via temporary probe route (real "Muscle Max" gym data); probe + its middleware exclusion fully reverted (middleware diff = only the `/onboarding` protection)
- Linear: DEV-14 → In Progress + completion comment (incl. Portfolio Checkpoint); DEV-10 comment for the 3 §9.3 items; DEV-60 created

**Anything the reviewer should know:**
- DEV-14 scope = plan step-7 card + step-8 redirect only. Rest of DESIGN §9.4 (content status, stats row, recent, quick actions) is Phase 2+ — primary CTA is a disabled placeholder
- Dashboard couldn't be exercised signed-in in the preview (Clerk handshake); verified the card component in isolation with the real DB profile
- Phase 1 is now feature-complete → README update due on approval (last-slice-of-phase rule)

---

### 2026-07-05 — Onboarding path decision: full-screen `/onboarding` (DEV-10 rework)

**Done:**
- Human decision resolving the DEV-10 deviation: onboarding moves to full-screen `/onboarding` per DESIGN.md §9.3 (was `/dashboard/onboarding` inside the dashboard shell)
- New `src/app/onboarding/page.tsx` (own full-screen container, `force-dynamic`); deleted `src/app/dashboard/onboarding/`; middleware protected matcher extended with `/onboarding(.*)`
- Side effect: dashboard EmptyState CTA (`/onboarding`, dead link since DEV-6 — audit finding #2) now works with no code change
- Propagated: plan-phase-1.md files-to-touch updated; decision + QA checklist posted on DEV-10 in Linear
- `typecheck ✅` · `lint ✅` · signed-out `/onboarding` → sign-in redirect verified on live dev server

**Anything the reviewer should know:**
- Remaining DESIGN.md §9.3 gaps logged on DEV-10 (progress dots, per-step Skip, persona pills, PostHog events) — not built in this rework
- Audit finding #3 ("/dashboard with no profile should redirect to /onboarding") still open — belongs to DEV-14, awaiting go-ahead

---

### 2026-07-05 — DEV-59 bug fix: "User not found" on profile save + phase-1 audit

**Done:**
- **Phase-1 audit** (vs plan-phase-1.md, Linear, code): dashboard summary card (DEV-14/STU-12) never started — `dashboard/page.tsx` hardcodes `<EmptyState />` and never fetches the profile (this is why completed onboarding shows no business details); EmptyState CTA links to nonexistent `/onboarding` (wizard is at `/dashboard/onboarding`); "redirect to onboarding if no profile" (plan step 8) unimplemented; DEV-9/10/11/12 all stuck In Progress in Linear; plan file still says "Not started"; STU-vs-DEV id drift; the `env.CLERK_PUBLISHABLE_KEY` blocker in PROGRESS was verified stale and removed
- **DEV-59 (new bug issue, Linear):** onboarding submit failed with "Couldn't save your profile: User not found" for accounts signed up locally. Root cause confirmed against live Neon: `users` rows are created only by the Clerk webhook, which only reaches the deployed URL — the affected account (mak5825@gmail.com) had no row; the previously-working profile ("Sunset Cafe") belongs to a different, webhook-synced account
- Fix: new `src/lib/local-user.ts` → `ensureLocalUser(clerkId)` — JIT-provisions the local `users` row from the Clerk session (`currentUser()`) when missing; idempotent via `ON CONFLICT DO NOTHING` on unique `clerk_id` + re-select (race-safe vs webhook). All three `/api/business-profile` handlers switched to it; webhook remains primary sync path
- `typecheck ✅` · `lint ✅` · signed-out GET/POST still 401 on the live dev server
- Linear: DEV-59 created (bug label), completion comment + QA checklist posted; left In Progress (no "Needs Review" status)

**Anything the reviewer should know:**
- End-to-end confirmation requires a signed-in browser: re-run onboarding with the previously-failing account (QA checklist on DEV-59)
- Audit follow-ups deliberately NOT done this session (scope discipline): DEV-14 build, `/onboarding` link fix, no-profile redirect — awaiting human direction on the `/onboarding` vs `/dashboard/onboarding` path question first

---

### 2026-07-05 — DEV-12: Industry template engine → presets per business type

**Done:**
- New `src/lib/industry-templates.ts` — `INDUSTRY_TEMPLATES: Record<businessType, IndustryTemplate>` covering all 8 `businessType` enum values (restaurant, e-commerce, salon, gym, real_estate, fashion, freelancer, other); each entry has `suggestedProducts`, `sampleTargetCustomers`, `recommendedTones`, `recommendedPlatforms`, `suggestedContentTypes`, `postingSchedule`, `exampleHashtags`
- **Correction (same session):** first pass didn't match plan-phase-1.md step 5 (`businessType → default brandTone, suggested content types, posting schedule`). Replaced the freeform `contentStrategyHints` string with structured `suggestedContentTypes` using CONTEXT.md's canonical Content Type enum (`product_showcase`/`tip`/`behind_the_scenes`/`promo`/`testimonial`/`ugc_ad`/`seasonal`/`engagement`), and added `postingSchedule: { postsPerWeek, weeklyPlan: {day, contentType}[] }` (was missing entirely) — matches CONTEXT.md "Industry Strategy". New `ContentType`/`Weekday`/`PostingSlot`/`PostingSchedule` types exported from the same file.
- **Expansion (same session):** surfaced the preset as a visible "Suggested for you" panel in Step 1 (recommended tone / content ideas / how often to post; tone auto-applied + editable) via new `suggested-for-you.tsx` + `CONTENT_TYPE_LABELS`. Persisted preset provenance: new nullable `industry_preset` column on `business_profiles` (amends DEV-9 schema), wired through Zod + form state + submit payload, pushed to Neon. Reserved for Phase 2 content suggestions.
- **Browser-verified** the panel for the first time on an onboarding slice: temporary public probe route + middleware-matcher exclusion → clicked Restaurant → confirmed panel (tone Friendly, 5 content-idea pills, "About 5 posts a week") + screenshot; probe route and middleware change then fully reverted (middleware diff empty)
- **Env gotcha:** `db:push` needs esbuild's `@esbuild/darwin-x64` binary, which is missing from the install; ran push via locally-fetched binary + `ESBUILD_BINARY_PATH` (nothing committed). A `pnpm install` restoring optional deps would fix permanently. (Tech debt.)
- Wired Step 1 business-type selection (`onboarding-wizard.tsx`'s new `handleBusinessTypeSelect`, `step-business-type.tsx`'s new `onSelectBusinessType` prop) to auto-fill Steps 2 (products), 3 (target customers), 4 (brand tone), 5 (platforms) from the matching template — only into fields that are still empty/unset, so re-picking a business type never overwrites something the user already typed; confirmation toast shown
- `contentStrategyHints`/`exampleHashtags` are defined in the data model per the task spec but not consumed by any wizard step yet (no corresponding UI field) — reserved for Phase 2 content generation
- `pnpm --filter @workspace/web run typecheck` → 0 errors (the `Record<businessType, ...>` type forced templates for all 8 enum values, including `fashion`/`freelancer` which aren't in the wizard's `BUSINESS_TYPE_OPTIONS` UI list); lint → 0 warnings/errors
- Could not run an authenticated browser check (same limitation as DEV-9/10/11/13 — no test Clerk credentials, sandbox has no network path to Clerk's hosted sign-in); verified the merge logic by code review against `OnboardingFormState`'s exact shape and the existing functional-update pattern from DEV-11's logo color merge
- Linear: DEV-12 moved Backlog → In Progress, completion comment posted (5-section format); left In Progress — no "Needs Review" status

**Anything the reviewer should know:**
- `BUSINESS_TYPE_OPTIONS` (the actual wizard UI) only exposes 6 of the 8 `businessType` values — no cards for `fashion`/`freelancer`. Templates for those two exist for schema/type completeness but are currently unreachable from the UI. Out of scope to add UI cards for them here.
- No new API routes — pure client-side data + wiring, per the task.

---

### 2026-07-05 — DEV-11: Logo upload → auto-detect brand colors

**Done:**
- New `POST /api/upload/logo` — Clerk-auth-gated, multipart, PNG/JPG/SVG, 5 MB cap; verifies file content matches the claimed type (PNG/JPEG magic bytes; SVG must contain `<svg` and no scripts/event handlers/foreignObject/etc.); uploads to R2 under `logos/{clerkId}/{ts}.{ext}`; SVGs stored with `Content-Disposition: attachment` so direct navigation downloads instead of rendering (XSS defense); `{data:{url}}` 201
- New `src/lib/extract-colors.ts` — `extractDominantColors(file, maxColors)`: 100px offscreen canvas, `getImageData`, 32-step RGB quantization buckets with running average, skips alpha<128 pixels, dedupes by RGB distance 60; handles SVGs without intrinsic dimensions
- Step 4 UI: upload/replace/remove logo with preview, uploading spinner, detected colors auto-merged into brandColors (max 6, deduped, existing kept); extraction failure never blocks the upload (info toast instead)
- `logoUrl` added to wizard form state and included in the `/api/business-profile` POST payload; review step shows the logo thumbnail (plain `<img>` — R2 domain not in next/image allowlist)
- Architect review: 3 findings, all fixed — (1) stale-state race: color merge now applied via functional update against latest form state (`patchForm` accepts updater functions), (2) SVG active-content rejection + attachment disposition, (3) magic-byte validation instead of trusting client MIME
- `pnpm --filter @workspace/web run typecheck` → 0 errors; lint → 0 warnings/errors; curl `/api/upload/logo` signed out → 401
- Linear: DEV-11 moved to In Progress with approach note, completion comment posted (5-section format); left In Progress — no "Needs Review" status

**Anything the reviewer should know:**
- Replacing/removing a logo doesn't delete the old R2 object (orphans accumulate — tech debt if it matters)
- No test runner exists in the web package yet, so no automated route tests this slice
- Dashboard EmptyState `/onboarding` link mismatch (from DEV-6) still unfixed — out of scope again

---

### 2026-07-04 — DEV-10: Multi-step onboarding wizard UI

**Done:**
- Built the six-step onboarding wizard at `/dashboard/onboarding` (task path; note DESIGN.md §9.3 describes full-screen `/onboarding` — flagged in the Linear comment for the reviewer to decide)
- Components in `src/components/onboarding/`: `onboarding-wizard.tsx` (orchestrator — single form state object, progress bar + "Step X of 6", framer-motion slide transitions, Back/Next, per-step validation gating with toasts, submit → POST `/api/business-profile` → success toast → redirect `/dashboard`), plus one component per step and `onboarding-data.ts` (options/types/initial state)
- Step 1: business name input + business type card grid; Step 2: dynamic product list (add/remove, name + optional description); Step 3: target customers textarea; Step 4: brand tone cards with preview captions + color picker (max 6, hex); Step 5: platform toggle cards (YouTube/TikTok/Instagram); Step 6: review with per-section Edit buttons that jump back to the step
- API error handling parses both string errors and Zod `fieldErrors` objects into readable toasts; 409 (profile already exists) shows an info toast and redirects to `/dashboard` instead of erroring
- Created `input.tsx`/`textarea.tsx`/`label.tsx` shadcn primitives manually (CLI timed out); installed `@radix-ui/react-label`
- Architect code review run — fixed all 3 findings (fieldErrors parsing, 409 UX branch, color-picker keyboard accessibility: visible focusable button now triggers the hidden color input)
- `pnpm --filter @workspace/web run typecheck` → 0 errors; lint → 0 warnings/errors; `pnpm --filter @workspace/web run build` → success, `/dashboard/onboarding` in route list
- Verified route is auth-protected (unauthenticated browser request → 307 to sign-in); no signed-in browser run possible (no test Clerk credentials)
- Linear: DEV-10 moved Backlog → In Progress, completion comment posted (5-section format); left In Progress — no "Needs Review" status (known gap)

**Anything the reviewer should know:**
- Dashboard EmptyState CTA still links to `/onboarding` (from DEV-6), which doesn't match this slice's `/dashboard/onboarding` path — not changed (would be a drive-by edit outside the task); decide path question first
- Logo upload + auto color detection is a separate slice (STU-10), intentionally skipped
- Products/customers/colors/platforms optional client-side (API requires only name/type/tone); review step shows "not set" placeholders

---

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
