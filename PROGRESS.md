# AI Content Studio — Progress

> Current status at top is overwritten every session. Session log below is append-only (keep last 5 entries).

## Current status

- **Active phase**: **Phase 2.5 — Coverage & Asset Foundation** (`plan-phase-2-5.md`) — new phase inserted between Phase 2 and Phase 3 at human request (2026-07-17). **Phase 2 (Visual Generation Core) fully COMPLETE — all 13 slices Done** (human approved DEV-24/25/26 → Done on 2026-07-17).
- **Active plan file**: `plan-phase-2-5.md` (Phase 3 = `plan-phase-3.md` after 2.5).
- **Linear (new 2026-07-17)**: created milestone **"Phase 2.5 — Coverage & Asset Foundation"** + all 7 slices with DAG: **DEV-61 STU-C1** (catalog+router hardening, no blockers), DEV-62 STU-C3 (media library), DEV-63 STU-C6 (seasonal/industry data), DEV-64 STU-C7 (presenter library) — all blocker-free; DEV-65 STU-C2 (text-graphic ⭐, blocked by C1); DEV-66 STU-C4 (before/after composite, blocked by C3); DEV-67 STU-C5 (carousel kits, blocked by C2). New `phase-2.5` Linear label.
- **Current sub-task**: **STU-C4 (DEV-66) — Before/After Composite — DONE + human-verified + committed `cc2c4f3` (2026-07-18)**. Human ran `POST /api/composite` in-browser → `201` Asset Kit with a labelled before/after image; DEV-66 → Done. New `src/lib/composite.ts` (`CompositeService`: fetch two Media Library photos → `sharp` side-by-side composite w/ SVG "BEFORE"/"AFTER" label bands → R2 → save Asset Kit; **$0, no model call**; pure `compositeLayout`/`buildLabelSvg`; injectable compositor/fetch/upload/save seams) + `POST /api/composite` route (ownership-scoped id resolution) + `MediaLibraryService.getOwned` (additive). Added `sharp ^0.35.3` (web dep — install + composite + SVG-label rendering all live-verified here first). `typecheck ✅ · tests 133/133 ✅ · lint ✅ · build ✅`; real compositor output visually verified (labelled side-by-side PNG). Left **In Progress** (board has no Needs Review). Prior: STU-C1, STU-C2, STU-C3 Done.
- **Next action**: STU-C4 committed (`cc2c4f3`) + DEV-66 Done. Pick the next slice. Next unblocked slices (all Backlog): **STU-C5 (DEV-67)** carousel kits (C2 Done), **STU-C6 (DEV-63)** seasonal/industry data (no blockers, $0/no-key — safest), **STU-C7 (DEV-64)** presenter library (no blockers, but portrait generation is key-gated). ⚠️ **Completion-gated carryover**: text-graphic premium legibility (`nano-banana-pro`) + the STU-C4 `nano-banana-edit` enhancement pass are both blocked by the free-tier shim (only `nano-banana-2` completes). ⚠️ Confirm STU-C1 `social_graphic.premium`→`flux-krea-dev` repoint. Carried: replace revoked `OPENAI_API_KEY` if still 401. Phase 3 first slice = DEV-27. Deferred: DEV-60 (PostHog onboarding events, Phase 8).
- **STU-C1 decisions (flag for reviewer)**: repointed two dead `social_graphic` models — `standard` `flux-schnell`→`nano-banana-2` (flux-schnell POST-404 **dead** per canary though still catalog-listed) and `premium` `seedream-v4`→**`flux-krea-dev`** ($0.015, canary-live 2026-07-17 — FLUX variant tuned for photographic aesthetics, cheaper than nano-banana-pro; supersedes the earlier `nano-banana-pro` repoint, seedream-v4 was **absent from catalog**). Both are product-ish choices made to clear real drift; confirm. Refreshed all hard-coded fallback costs to live catalog values (were badly stale, e.g. `creatify-lipsync` $0.30→$0.04). ⚠️ **Liveness ≠ completion**: the canary shows all 11 routed models "LIVE" (endpoint 422), but only `nano-banana-2` is *completion*-verified; STU-C2 must submit+poll-test `ideogram-v3-t2i`/`flux-krea-dev` before trusting them. Free-tier `resolveAvailableModel`→`nano-banana-2` shim untouched (kept).
- **UI work**: **no** (STU-C4 — service + API route only; on-screen two-photo picker deferred to the generation UI, flagged out of scope). Prior slice STU-C3 was UI (`/library`).
- **Files modified this session (STU-C4, 2026-07-18)**:
  - `artifacts/web/src/lib/composite.ts` (new — `CompositeService.generate`: fetch both Media Library photos → `defaultCompositor` (sharp: resize both to a common height, side-by-side on a white canvas w/ divider, burn in SVG label bands via librsvg) → R2 upload under `asset-kits/{userId}/{ts}-before-after.png` → save `asset_kits` row; pure `compositeLayout` (aspect-correct scaling, `maxHeight` cap, divider) + `buildLabelSvg` (XML-escaped, zinc band); injectable `compositor`/`fetchImage`/`upload`/`save` seams; `cost` 0; `contentType` default `testimonial`; optional `nano-banana-edit` enhancement left as an unwired seam)
  - `artifacts/web/src/lib/composite.test.ts` (new — 8 tests: layout scaling + maxHeight cap, label SVG structure + XML-escape, orchestration order fetch→composite→upload→save, custom labels/contentType/hashtags, fetch-failure aborts before upload/save, **real-sharp integration** producing a valid labelled side-by-side PNG)
  - `artifacts/web/src/app/api/composite/route.ts` (new — POST; `auth()` + `ensureLocalUser`; Zod body `{beforeId, afterId, labels?, title?, platform?, caption?, hashtags?, contentType?}`; resolves the two ids via `getOwned` (ownership-scoped → 404 on foreign/bogus id); `runtime = "nodejs"` for sharp; masked 500 on failure)
  - `artifacts/web/src/lib/media-library.ts` (amended — added `MediaOwnedGetter` seam + `MediaLibraryService.getOwned(userId, ids)`: ownership-scoped `inArray` fetch, empty-ids short-circuit; used by the composite route to resolve photo ids → URLs)
  - `artifacts/web/src/lib/media-library.test.ts` (amended — +1 test: `getOwned` ownership scoping + empty-ids short-circuit; now 11 tests)
  - `artifacts/web/package.json` (added `sharp ^0.35.3` — web dep; install + composite + SVG-label render live-verified on this platform before use)
  - `CONTEXT.md` (added **Before/After Composite** glossary term)
- **Files modified this session (STU-C3, 2026-07-18)**:
  - `artifacts/web/src/db/schema.ts` (amended — added `media_library` table [id, userId FK cascade, r2Key, mediaUrl, contentType, label nullable, `source` enum `upload`/`generated` default upload, createdAt, userId index] + `MEDIA_LIBRARY_SOURCES`/`MediaLibrarySource`/`MediaLibraryItem`/`InsertMediaLibraryItem`) — applied to Neon via direct DDL + column/index round-trip
  - `artifacts/web/src/lib/media-library.ts` (new — pure `detectImageType` (PNG/JPEG/WEBP magic bytes) / `validateMediaUpload` (size then content) / `mediaObjectKey`; `MediaLibraryService.uploadFromBuffer`/`list`/`remove` with injectable upload/save/list/remove seams; ownership-scoped delete; `MAX_MEDIA_BYTES` 10 MB; default seams lazy-load R2/Drizzle)
  - `artifacts/web/src/lib/media-library.test.ts` (new — 10 tests: magic-byte detect, validation accept/empty/oversize/bad-type, key builder, upload validate→upload→save ordering, reject-before-upload, list passthrough, ownership-scoped remove)
  - `artifacts/web/src/app/api/media-library/route.ts` (new — GET list + POST multipart upload; `auth()` + `ensureLocalUser`-gated; delegates to `MediaLibraryService`; user-safe error masking. Replaced the initial Server-Actions approach — see QA log)
  - `artifacts/web/src/app/api/media-library/[id]/route.ts` (new — DELETE, ownership-scoped)
  - ~~`(dashboard)/library/actions.ts`~~ (created then **removed** — Server Actions replaced by the `/api` routes above during QA)
  - `artifacts/web/src/app/(dashboard)/library/page.tsx` (new — server page, force-dynamic, renders `<LibraryView />`; `/library` in the `(dashboard)` group, NOT plan's literal `/dashboard/library`)
  - `artifacts/web/src/components/library/library-view.tsx` (new — client grid 3/2/1; fetches list on mount from `/api/media-library` (like GalleryView); multi-file upload via `fetch`; **transparent `<input type=file>` overlay** on the button so the OS picker opens natively; optimistic add/in-flight tiles/optimistic delete; empty + skeleton states; sonner toasts)
  - `artifacts/web/src/components/library/library-card.tsx` (new — square thumbnail + hover overlay: delete button + optional label)
  - `artifacts/web/src/middleware.ts` (amended — protected matcher += `/library(.*)`)
  - `artifacts/web/src/components/dashboard/sidebar.tsx` (amended — Media Library nav item → `/library`, `FolderOpen` icon)
  - `artifacts/web/next.config.ts` (touched then **reverted** — the `serverActions.bodySizeLimit` was a wrong-theory change; no Server Actions remain)
  - `CONTEXT.md` (added **Media Library** glossary term)
- **Files modified this session (STU-C2, 2026-07-18)**:
  - `artifacts/web/src/lib/model-router.ts` (amended — added `text_graphic` Asset Type + routing entry: standard `ideogram-v3-t2i` $0.02, premium `nano-banana-pro` $0.12, `inputType: "text"`; costs match the live catalog verified this session)
  - `artifacts/web/src/lib/model-router.test.ts` (amended — +1 test: `text_graphic` resolves to the text specialists + `text` inputType)
  - `artifacts/web/src/lib/text-graphic.ts` (new — `TextGraphicService.generate`: RAG retrieve → prompt that quotes the **exact** display text with legibility/layout guidance → route `text_graphic` → Muapi at format aspect ratio; reuses social-graphic's shared graphic types [`GraphicBusinessContext`/`GraphicFormat`/`FORMAT_ASPECT_RATIOS`/`MuapiGenerate`/`GraphicRetriever`] to keep aspect ratios single-sourced; pure `buildTextGraphicQuery`/`buildTextGraphicPrompt`; injectable Muapi/retriever/resolveModel seams; free-tier shim collapses to `nano-banana-2` like the siblings)
  - `artifacts/web/src/lib/text-graphic.test.ts` (new — 7 tests: query/prompt builders [exact text quoted + legibility guidance], default+per-format aspect ratio, free-tier override→nano-banana-2, premium→nano-banana-pro pre-shim, RAG context injection, failure propagation)
  - `CONTEXT.md` (added **Text-Graphic** glossary term; added `text_graphic` to the **Asset Type** canonical values)
- **Files modified this session (STU-C1, 2026-07-17)**:
  - `artifacts/web/src/lib/muapi-catalog.ts` (new — `MuapiCatalog`: injectable fetch/clock/ttl, ~1h in-memory cache, single-flight, stale-on-error; `tryLoad()` returns `null` on unreachable so callers distinguish offline from absent; `getModel`, `estimateCost` (lazy env key), pure `inputTypeForCategory`; `CatalogPort` seam; default `muapiCatalog` singleton)
  - `artifacts/web/src/lib/muapi-catalog.test.ts` (new — 7 tests: inputType mapping, parse, cache-within-TTL/refetch-after, stale-on-error, null-when-unreachable, getModel present/absent)
  - `artifacts/web/src/lib/model-router.ts` (amended — added `inputType` per routing entry; new async `resolveWithCatalog` = live cost override + live inputType + **fail-loud on catalog-absent**, silent static fallback offline; `route()` kept pure/sync for the hot path; `ResolvedRoute`; constructor takes injectable `CatalogPort`; repointed `social_graphic` standard→`nano-banana-2`, premium→`flux-krea-dev` (post-review update, superseded `nano-banana-pro`); refreshed stale fallback costs)
  - `artifacts/web/src/lib/model-router.test.ts` (amended — +4 tests: inputType-per-entry, resolveWithCatalog override/fail-loud/offline-fallback; updated seedream-v4/flux-schnell/cost assertions; stub `CatalogPort`)
  - `artifacts/web/src/lib/social-graphic.test.ts` (comment only — flux-schnell→nano-banana-2 note)
  - `artifacts/web/scripts/muapi-canary.ts` (new — `pnpm canary:muapi`: POST-probes every routed model, cross-checks catalog presence, `404` dead/`422`/`400` live, exits non-zero on drift/dead)
  - `artifacts/web/package.json` (added `canary:muapi` script)
  - `CONTEXT.md` (added **Model Catalog**, **Input Type**, **Liveness Canary** glossary entries; refreshed **Model Router** example slugs)
  - `.agents/memory/muapi-api-contract.md` (added STU-C1 note: canary + the three availability tiers — catalog presence ≠ endpoint liveness ≠ completion)
- **UI work**: no this slice (services); README updated (last-slice-of-phase rule)
- **Phase-2 complete**: Plan (DEV-20) → Retrieve (DEV-16/17) → Route (DEV-18) → Execute (DEV-19/21/22) → Assemble (DEV-23) → UI+Queue (DEV-24) → Gallery (DEV-26) → **Evals/feedback loops (DEV-25)**. The full Agent Loop runs end to end (mock media on free tier / pending OpenAI key).
- **🔑 BLOCKER — OpenAI key revoked (found 2026-07-13):** `OPENAI_API_KEY` in `artifacts/web/.env.local` returns 401 directly from OpenAI's API (it worked 2026-07-09 for the DEV-17/DEV-20 live smokes). Until replaced: onboarding auto-embedding fails (non-fatal, logged), and the content planner / retrieval / text generation fail at runtime. DEV-22's live smoke was blocked by this — its logic is fully unit-tested and uses the exact `generateObject` pattern verified live in DEV-20. **Human action: issue a new key and update `.env.local`.**
- **✅ Muapi free-tier shim RESTORED (2026-07-16, reverted a bad change):** a prior working-tree change had DELETED `muapi-availability.ts` / `resolveAvailableModel` and the `resolveModel` seams, on the false claim the key was "upgraded and all models verified." **Live re-testing proved that false** — only `nano-banana-2` completes; `sdxl-image` and `google-imagen4-fast` return `failed`/`Model not found`, `flux-schnell` 404s, and `ai-product-shot` is Image-to-Image (422 without an input image). This made every content-plan item show **failed**. Fix: restored the shim + call sites + routing table to committed HEAD (`git checkout HEAD -- …`). Verified end-to-end: `ProductPhotoService` + `SocialGraphicService` both complete live via `nano-banana-2` → real CDN URLs. Shim must stay until slugs are individually live-verified. See `.agents/memory/muapi-api-contract.md`.
- **ℹ️ Tracer route note:** `src/app/api/tracer/generate-image/route.ts` still hardcodes `nano-banana-2` (DEV-13 standalone tracer, not part of the routed Agent Loop) — intentionally left as-is.
- **⚠️ Dev-server cache gotcha (hit 2026-07-13):** running `pnpm build` while the dev server is up corrupts `.next` (vendor-chunk "Cannot find module" errors, e.g. on Clerk routes). Fix: stop server → `rm -rf artifacts/web/.next` → restart. Avoid by stopping the dev server before builds.
- **Blockers**: None.
- **DB note (new this session)**: pgvector **enabled on Neon** (`CREATE EXTENSION vector`, v0.8.1) and `brand_embeddings` table created **via direct DDL** (drizzle-kit push needs the stripped esbuild binary — DEV-12 gap). DDL matches drizzle's generated SQL exactly (table/column/index/FK names), so a future `db:push` is a no-op. `schema.ts` remains source of truth.
- **Test harness note (new this session)**: Vitest is unusable in this workspace (pnpm-workspace overrides strip the native esbuild/rollup binaries it needs — same root cause as the DEV-12 `db:push` esbuild gap). Adopted **Node 24's built-in test runner + native TS type-stripping** instead — zero new deps. `pnpm test` is wired at the web package (`node --test "src/**/*.test.ts"`) and repo root (`pnpm -r ... run test`). Test files: `src/**/*.test.ts`.
- **Files modified this session (DEV-25)**:
  - `artifacts/web/src/db/schema.ts` (added `pipeline_logs` table — step/model/durationMs/success/cost/error, step index; `boolean` import) — direct DDL + round-trip on Neon
  - `artifacts/web/src/lib/pipeline-log.ts` (new — `persistentPipelineLogger`: console + fire-and-forget insert into `pipeline_logs`, lazy db, self-swallowing)
  - `artifacts/web/src/lib/muapi.ts` · `embeddings.ts` · `retrieval.ts` · `content-planner.ts` · `text-generation.ts` (each: singleton default logger swapped to `persistentPipelineLogger`; removed now-unused inline console loggers)
  - `artifacts/web/src/lib/agent-evals.ts` (new — pure `scorePlanQuality` (0-100), `aggregateFeedback`/`summarizeInsights`, `aggregateReliability`; `AgentEvalsService.getPerformanceInsights`/`getPipelineReliability` with injectable fetch seams, default lazy Drizzle)
  - `artifacts/web/src/lib/agent-evals.test.ts` (new — 10 tests: scoring, feedback + reliability aggregation, service composition)
  - `artifacts/web/src/lib/content-planner.ts` (proposePlan now scores + **auto-regenerates below 60** (max 2 attempts, keep best, returns `score`); `buildPlannerPrompt` injects `performanceInsights`; imports `scorePlanQuality`/`MIN_PLAN_SCORE`)
  - `artifacts/web/src/lib/content-planner.test.ts` (+4 tests — accept-good / regenerate-and-keep-best / stop-at-cap / insights-in-prompt)
  - `artifacts/web/src/app/api/plan/route.ts` (POST fetches `getPerformanceInsights` (non-fatal) → passes to proposePlan)
  - `README.md` (Phase 2 complete — Agent Loop end to end)
- **Files modified this session (DEV-26)**:
  - `artifacts/web/src/db/schema.ts` (added `generation_feedback` table — user+kit FKs cascade, `rating` up/down, unique (user, kit) index; `FEEDBACK_RATINGS`/types; also exported `MediaType` from `MEDIA_TYPES`) — direct DDL + upsert/cascade round-trip on Neon
  - `artifacts/web/src/lib/gallery.ts` (new — pure `parseGalleryQuery`/`pageOffset`/`toggleRating` + `GalleryItem`/`GALLERY_PAGE_SIZE`)
  - `artifacts/web/src/lib/gallery.test.ts` (new — 6 tests: query defaults/clamp/enum-reject, platform blank, offset, toggle)
  - `artifacts/web/src/app/api/gallery/route.ts` (new — GET paginated 12/page, type+platform filter, sort, LEFT JOIN feedback rating, lookahead `hasMore`)
  - `artifacts/web/src/app/api/gallery/feedback/route.ts` (new — POST toggle rating, ownership-scoped, `onConflictDoUpdate`)
  - `artifacts/web/src/app/api/gallery/[id]/route.ts` (new — PATCH caption, DELETE kit; ownership-scoped)
  - `artifacts/web/src/app/(dashboard)/gallery/page.tsx` (new — server page → GalleryView, max-w-7xl)
  - `artifacts/web/src/components/gallery/gallery-view.tsx` (new — filter/sort bar, grid 3/2/1, load-more, empty+skeleton states, optimistic rating, lightbox host)
  - `artifacts/web/src/components/gallery/gallery-card.tsx` (new — thumbnail + hover overlay: type/platform/date + one-tap thumbs)
  - `artifacts/web/src/components/gallery/gallery-lightbox.tsx` (new — Dialog: media, editable caption, hashtag pills, prominent thumbs, download, delete)
  - `artifacts/web/src/components/ui/dialog.tsx` (new — Radix Dialog shadcn primitive for the lightbox)
  - `artifacts/web/src/middleware.ts` (protected matcher += `/gallery(.*)`)
  - `artifacts/web/src/components/dashboard/sidebar.tsx` (Gallery link → `/gallery`)
- **Files modified 2026-07-14 (DEV-24 path decision — `/plan`)**:
  - `artifacts/web/src/app/(dashboard)/layout.tsx` (new — route group layout reusing `DashboardShell`; future `/gallery`/`/calendar`/`/social` join this group)
  - `artifacts/web/src/app/(dashboard)/plan/page.tsx` (moved from `src/app/dashboard/plan/page.tsx`; old dir deleted)
  - `artifacts/web/src/middleware.ts` (protected matcher += `/plan(.*)`)
  - `artifacts/web/src/components/dashboard/sidebar.tsx` (Content Plan link → `/plan`)
- **Files modified this session (DEV-24)**:
  - `artifacts/web/src/db/schema.ts` (added `content_plans` table — user FK, weekStart, status draft/approved/generating/completed, `items` jsonb of `ContentPlanItemRecord` [per-item status pending/generating/completed/failed, assetKitId, mediaUrl, error], totalCost; `CONTENT_PLAN_STATUSES`/`PLAN_ITEM_STATUSES` consts) — applied to Neon via direct DDL + round-trip
  - `artifacts/web/src/lib/generation-queue.ts` (new — `GenerationQueueService.processPlan`: routes items by content type [product_showcase→photo pipeline w/ `matchProduct`, else→graphic; ugc_ad→graphic until Phase 3], caption → Asset Kit assembly per item, `Promise.allSettled` parallelism + failure isolation, per-item status writes via injectable `ItemUpdater`; retry = re-process pending+failed only)
  - `artifacts/web/src/lib/generation-queue.test.ts` (new — 6 tests: product matching, routing, completion+cost, failure isolation, retry semantics, no-products fallback)
  - `artifacts/web/src/app/api/plan/route.ts` (new — GET latest plan; POST propose via DEV-20 planner → draft [replaces prior draft, 409 while generating]; PATCH draft items w/ Zod)
  - `artifacts/web/src/app/api/plan/approve/route.ts` (new — POST: claim draft/completed → generating → run queue inline → completed + totalCost; failed-item retry via re-approve)
  - `artifacts/web/src/app/dashboard/plan/page.tsx` (new — server page rendering PlanFlow, max-w-4xl per DESIGN §9.5)
  - `artifacts/web/src/components/plan/plan-flow.tsx` (new — 3-state client orchestrator: create hero + staged loading, review + optimistic PATCH edits + add-item + sticky approve footer ["N items · Will use N credits"], generating/completed progress w/ 2.5s polling + retry + completion banner; skeleton loading state)
  - `artifacts/web/src/components/plan/plan-item-card.tsx` (new — review card [type icon/platform badge/day/inline description edit/remove] + progress card [waiting dim, shimmer, thumbnail+View, Failed+Retry]; lucide icons per codebase convention)
- **Files modified this session (DEV-23)**:
  - `artifacts/web/src/db/schema.ts` (added `asset_kits` table — user FK cascade, title, `contentType` [new `CONTENT_TYPES` enum const], platform, `mediaUrl` (R2), `mediaType` [`image`/`video`], caption, hashtags jsonb, `cost` double precision, `status` [`draft`/`ready`/`published`], timestamps, user_id index; added `doublePrecision` import) — applied to Neon via direct DDL + round-trip verified
  - `artifacts/web/src/lib/asset-kit.ts` (new — `AssetKitService.assemble`: download media → R2 upload under `asset-kits/{userId}/{ts}.{ext}` → insert kit row → non-fatal `generation`-kind embed-back of title+caption; injectable download/upload/save/embed seams; `extensionFor` content-type→extension mapping)
  - `artifacts/web/src/lib/asset-kit.test.ts` (new — 6 tests: extension mapping, assembly order + R2-owned mediaUrl, embed-back content, embed failure non-fatal, download failure fatal, video extension)
- **Files modified this session (DEV-22)**:
  - `artifacts/web/src/lib/text-generation.ts` (new — `TextGenerationService`: `generateCaption` (caption + normalized hashtags) and `generateAdCopy` (headline/body/cta), both RAG-conditioned via injectable `CaptionLLM`/`AdCopyLLM`/`TextRetriever` seams; `normalizeHashtags` (strip `#`, dedupe case-insensitively, cap 10); pure `buildCaptionPrompt`/`buildAdCopyPrompt`; GPT-4.1-mini cost from token usage; reuses DEV-15 `PipelineLogger` (steps `execute:caption`/`execute:ad_copy`). DEV-13 tracer `openai.ts` untouched)
  - `artifacts/web/src/lib/text-generation.test.ts` (new — 6 tests: hashtag normalization, both prompt builders, caption flow w/ retrieval, ad-copy flow, per-op logging, failure propagation)
- **Files modified this session (DEV-21)**:
  - `artifacts/web/src/lib/social-graphic.ts` (new — `SocialGraphicService.generate`: RAG retrieve → brand-conditioned prompt (tone/brand colors/audience/content-type) → route `social_graphic` → Muapi at format aspect ratio; `FORMAT_ASPECT_RATIOS` lookup (post 1:1 / story 9:16 / banner 16:9); pure `buildGraphicQuery`/`buildGraphicPrompt`; injectable Muapi/retriever seams)
  - `artifacts/web/src/lib/social-graphic.test.ts` (new — 6 tests: builders, default+per-format aspect ratio, override→nano-banana-2, RAG context injection, failure propagation)
  - `artifacts/web/src/lib/muapi-availability.ts` (new — extracted the free-tier `resolveAvailableModel` shim, shared by both generation pipelines; TODO-marked for removal on key upgrade)
  - `artifacts/web/src/lib/product-photo.ts` (amended — now imports + re-exports `resolveAvailableModel` from the shared module; no behavior change, DEV-19 tests unaffected)
- **Files modified this session (DEV-19)**:
  - `artifacts/web/src/lib/product-photo.ts` (new — `ProductPhotoService.generate`: RAG retrieve → optional bg-removal (when `sourceImageUrl`) → scene generation → optional reframe (per aspect ratio), via Model Router + injectable Muapi/retriever seams; aggregates cost + per-step records; pure `buildPhotoQuery`/`buildScenePrompt`; `resolveAvailableModel` free-tier shim mapping intended slugs → `nano-banana-2`, TODO-marked for removal on key upgrade)
  - `artifacts/web/src/lib/product-photo.test.ts` (new — 6 tests: shim mapping, prompt/query builders, minimal + full pipeline w/ cost aggregation, bg-removal skip, failure propagation)
- **Files modified this session (DEV-20)**:
  - `artifacts/web/src/lib/content-planner.ts` (new — `ContentPlannerService.proposePlan`: strategy lookup (reuses DEV-12 `INDUSTRY_TEMPLATES`) + RAG retrieve + upcoming holidays → GPT-4.1-mini `generateObject` → normalize to 5-7 `ContentPlanItem`s; injectable `PlanGenerator`+`PlanRetriever`; pure `buildRetrievalQuery`/`buildPlannerPrompt`/`normalizeItems` exports; `performanceInsights` seam reserved for DEV-25; reuses DEV-15 `PipelineLogger`)
  - `artifacts/web/src/lib/content-planner.test.ts` (new — 8 tests: query/prompt builders, proposePlan orchestration, item cap/type-filter/platform-snap, success + failure logging)
  - `artifacts/web/src/lib/seasonal.ts` (new — fixed-date US `HOLIDAYS` + `upcomingHolidays(now, windowDays)` with year rollover; TS-data convention, not the plan's `data/holidays.json`)
  - `artifacts/web/src/lib/seasonal.test.ts` (new — 5 tests: Valentine's-in-5-days, window exclusion, sorting, rollover, same-day)
- **Files modified this session (DEV-18)**:
  - `artifacts/web/src/lib/model-router.ts` (new — Model Router: `AssetType`/`Quality` types, `ROUTING_TABLE: Record<AssetType, {standard, premium?}>` transcribed from ARCHITECTURE.md §Route, `ModelRouter.route`/`getModel` with default-standard + premium-fallback + caller-param merge + unknown-type guard; pure config, no external deps)
  - `artifacts/web/src/lib/model-router.test.ts` (new — 8 tests: exhaustive resolution, default/premium/fallback, cost values, param merge + override, unknown-type throw)
  - `CONTEXT.md` (added **Asset Type** + **Quality (Route Tier)** glossary entries; annotated **Model Router** with the impl path)
- **Files modified this session (DEV-16)**:
  - `artifacts/web/src/lib/retrieval.ts` (new — Retrieval service: injectable `RetrievalService.retrieve`/`retrieveContext` with `QueryEmbedder`+`VectorSearch` seams, default top-k=8, optional `kind` filter, blank-query short-circuit, `formatRetrievedContext`; default search = Drizzle `cosineDistance` over `brand_embeddings` ordered by distance; default query embedder reuses `openAIEmbedder`; reuses DEV-15 `PipelineLogger`)
  - `artifacts/web/src/lib/retrieval.test.ts` (new — 7 tests: formatting, top-k default, custom k + kind passthrough, blank-query short-circuit, retrieveContext, success + failure logging)
  - `artifacts/web/src/lib/embeddings.ts` (amended — exported `defaultEmbedder` as `openAIEmbedder` for reuse by retrieval; no behavior change)
- **Files modified in prior session (DEV-17)**:
  - `artifacts/web/src/db/schema.ts` (added `brandEmbeddings` table — `vector(1536)` embedding, `kind` enum, HNSW cosine index, user FK; `EMBEDDING_KINDS`/`EMBEDDING_DIMENSIONS` consts; `BrandEmbedding`/`InsertBrandEmbedding` types; imports `index`/`vector`)
  - `artifacts/web/src/lib/embeddings.ts` (new — Brand Knowledge Base pipeline: pure `businessProfileToChunks`, injectable `BrandKnowledgeBase.syncBusinessProfile` with `Embedder`+`EmbeddingStore` seams, replace-on-sync, reuses DEV-15 `PipelineLogger` type; default embedder = OpenAI `text-embedding-3-small` via AI SDK `embedMany`, default store = Drizzle delete+insert; all `@/…`/AI-SDK value imports lazy so the module is test-loadable)
  - `artifacts/web/src/lib/embeddings.test.ts` (new — 6 tests: chunking, blank/absent handling, embed+store replace semantics, cost, success + failure logging)
  - `artifacts/web/src/app/api/business-profile/route.ts` (non-fatal `syncKnowledgeBase` helper called after POST create + PATCH update; GET untouched)
  - Live DB: `CREATE EXTENSION vector` + `brand_embeddings` table/index applied to Neon via direct DDL (nothing committed for the DDL — schema.ts is the source of truth)
- **Files modified in prior session (DEV-15)**:
  - `artifacts/web/src/lib/muapi.ts` (rewritten — DEV-8's minimal tracer client → full service: injectable `fetch`/`sleep`/clock/apiKey/logger, `fetchWithRetry` with exponential backoff on network err/429/5xx (max 3), `MuapiError` typed errors w/ `status`+`retryable`, cost from `X-MuAPI-Cost-USD` w/ body fallback, injectable `PipelineLogger` hook, generalized return `{ outputs, imageUrl, cost, model, requestId }` — `imageUrl` kept for the tracer; lazy `import("@/env")` so the module is test-loadable without a validated env)
  - `artifacts/web/src/lib/muapi.test.ts` (new — 12 unit tests: happy path, cost header/body, retry 429/500, no-retry 400, exhaustion, backoff timing, failed status, timeout, empty outputs, success/failure logging)
  - `artifacts/web/tsconfig.json` (added `allowImportingTsExtensions: true` so the test can import `./muapi.ts`)
  - `artifacts/web/package.json` (added `test` script)
  - `package.json` (root — added `test` script: `pnpm -r --if-present run test`)
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
- DEV-15: Retry with exponential backoff (surviving transient third-party failures — network/429/5xx — by waiting progressively longer instead of failing the user on the first hiccup), dependency injection for testability (swapping fetch/sleep/clock/key from outside so retry/backoff/timeout paths test instantly and offline), typed domain errors (a `MuapiError` carrying HTTP status + a `retryable` flag so callers branch on failure kind), environment-agnostic test harness (Node's built-in runner + native TS type-stripping when the toolchain's usual runner can't run in the sandbox)
- DEV-17: Vector embeddings + semantic memory (representing brand text as 1536-dim vectors so "most relevant to this generation" becomes a distance query instead of stuffing the whole profile into every prompt), pgvector as a first-class column type (storing/indexing vectors in Postgres with an HNSW cosine index for approximate-nearest-neighbour search), replace-on-sync idempotency (re-deriving a user's profile embeddings on every edit instead of accumulating stale chunks, scoped by `kind` so later generation embeddings survive), fault isolation for secondary effects (a non-fatal auto-embedding step that can never fail the primary profile save)
- DEV-16: Retrieval-augmented generation (fetching only the top-k relevant brand chunks per request instead of injecting the whole profile — cost + relevance scale with data), cosine similarity ranking (ordering stored vectors by angular closeness to a query vector so semantically related text surfaces even with no shared keywords), service composition via reuse (retrieval's query embedder reuses the KB's `openAIEmbedder` so the embedding model + cost stay single-sourced)
- DEV-18: Configuration over hard-coding (model choices live in one data table, not scattered through pipeline code, so swapping a model or tier is a one-line change), compile-time exhaustiveness (`Record<AssetType, …>` forces a route for every asset type — a missing one fails to build instead of at generation time), infrastructure hiding (model slugs never reach user-facing code — "invisible to users", credits only), graceful capability fallback (premium quality degrades to the standard model when no premium exists rather than erroring)
- DEV-20: Service composition / orchestration (the planner does little itself — it wires retrieval + industry strategy + LLM together, keeping each part independently testable), trust-but-verify LLM output (a schema constrains shape but not meaning, so structured output is still validated/normalized — item cap, type filter, platform snap — before use), grounding to fight generic output (feeding the model business-specific inputs — industry rhythm, RAG-retrieved brand facts, real upcoming holidays — so proposals are about *this* business and *this* week), forward-compatible seams (an unused `performanceInsights` arg lets DEV-25 wire the feedback loop in without a signature change)
- DEV-19: Pipeline orchestration with optional stages (a multi-step generation flow where bg-removal/reframe run only when they apply, with per-step cost aggregation), isolating a temporary workaround (a single named `resolveAvailableModel` boundary + TODO contains the free-tier model shim so the rest of the code stays written against the real Model Router — a one-line deletion later), passthrough observability (passing step labels into the Muapi service so each generation self-logs without the pipeline needing its own logger)
- DEV-21: DRY for a shared invariant (extracting the free-tier model shim to one module the moment a second pipeline needed it — because "which model this key can call" is a single decision that must stay consistent, unlike incidental look-alike code), data-encoded configuration (format→aspect-ratio as a lookup table, not scattered conditionals, so a new format is a one-line change), knowing when NOT to over-share (photo vs graphic keep separate focused services — they share the real machinery but differ for different reasons-to-change)
- DEV-22: One conditioning pattern, many outputs (captions/ad copy/plans/photos/graphics all follow retrieve → grounded prompt → model → clean up, so brand consistency is structural and improving retrieval improves everything), sanitizing at the boundary (hashtags normalized once in the producing service — strip `#`, dedupe, cap — so every consumer receives one canonical form), distinguishing env failures from code failures (a dead API key verified independently against the provider, so the slice isn't blocked on a phantom bug)
- DEV-23: Owning your outputs (copying generated media into app-controlled storage at creation time, because vendor URLs make no liveness promise — dead-link galleries destroy trust), ordering side effects by what must not fail (critical path download→store→save completes before the optional embed-back runs, so a soft failure can never lose paid work), closing the learning loop (each completed generation is embedded back into the Brand Knowledge Base, so future plans/captions retrieve what was already made)
- DEV-24: Status as a state machine (plan + per-item states persisted in the DB so any client renders exact progress from stored truth — survives refresh/crash), optimistic UI with reconciliation (edits/approve update the screen instantly, sync to the server, roll back on rejection; polling reconciles during generation), batch failure isolation (Promise.allSettled + per-item status so one failed generation never sinks the plan, and retry re-runs only what failed), inline-vs-background job trade-off (queue runs inline in the approve request — fine for free-tier/mock latency, flagged as tech debt for real model latency)
- DEV-26: Lookahead pagination (fetch page-size+1 rows to derive `hasMore` without a second count query on the hot path), optimistic interactions with rollback (thumbs tap updates instantly, reverts on server rejection), idempotent per-user rating (unique (user, kit) + `onConflictDoUpdate` so a re-tap updates one row rather than accumulating), feedback as a first-class learning signal (ratings stored to later bias the planner via the Performance Feedback Loop)
- DEV-25: Self-evaluation control loop (the agent scores its own plans and auto-regenerates below a threshold — bounded retries — so weak output never ships), the feedback loop closes (aggregated thumbs up/down become a planner prompt hint, so the product compounds in quality with use), observability as data (every pipeline step emits a structured `pipeline_logs` row → reliability/cost are a query, not a guess), safe circular type-imports (muapi ↔ pipeline-log cycle resolved because the back-reference is type-only and erased at runtime)
- STU-C3 (DEV-62): Trust the bytes, not the label (validate uploads by sniffing magic bytes server-side because the client-supplied MIME type is attacker-controlled — same lesson as DEV-11's logo route, now generalized to a photo library), thin adapter over a testable core (Server Actions stay a bare auth + FormData shell while all validation/storage lives in an injectable-seam service that unit-tests with no network/DB), authorization at the query (ownership-scoped delete matches `id` AND `userId` so a guessed id can't touch another user's row), source material vs output (the Media Library — a user's own uploads — is a distinct concept from the Gallery of generated Asset Kits, and is what unblocks image-to-image pipelines)

---

## Session log

### 2026-07-18 — STU-C4 (DEV-66): Before/After composite pipeline

**Done:**
- **New `src/lib/composite.ts`** — `CompositeService.generate`: fetch two Media Library photos → composite into one side-by-side before/after image with "BEFORE"/"AFTER" label bands → R2 → save as an Asset Kit. Pure, unit-tested core: `compositeLayout` (scale both to a common height = min(h1,h2,maxHeight), aspect-correct widths, divider, positions) + `buildLabelSvg` (XML-escaped zinc band, centered white text). Default compositor = **sharp** (decode/resize/stitch/burn-in labels via librsvg). Every side effect (compositor, source fetch, R2 upload, kit save) is an injectable seam. **$0 — no model call.** Optional `nano-banana-edit` enhancement left as an unwired, off-by-default seam (key-gated).
- **`POST /api/composite`** — auth + `ensureLocalUser`; Zod body; resolves the two photo ids via the new `MediaLibraryService.getOwned` (ownership-scoped → 404 on foreign/bogus id, no SSRF); `runtime = "nodejs"` (sharp). `/api` + fetch per app convention.
- **`MediaLibraryService.getOwned(userId, ids)`** (additive to STU-C3's service) — ownership-scoped `inArray` fetch with empty-ids short-circuit.
- **Reuses `asset_kits`** — no schema change. `cost` 0, `contentType` default `testimonial` (overridable), `mediaType` image.
- **`sharp ^0.35.3`** added to the web workspace. It was absent and this workspace has native-binary fragility, so I live-verified **install + resize + side-by-side composite + SVG-label rendering** on this platform *before* building on it. Also visually verified the real compositor output (a correct labelled side-by-side PNG).
- **TDD:** composite.test (8) + media-library.test (+1 → 11). Feedback loop: `typecheck ✅ · tests 133/133 ✅ · lint ✅ · build ✅` (`/api/composite` registers as a dynamic route).
- Docs: CONTEXT.md (**Before/After Composite** term). Linear: DEV-66 → In Progress, approach note + completion comment posted.

**Decisions (flag for reviewer):**
- **File at `src/lib/composite.ts`**, not the plan's `src/lib/pipelines/composite.ts` — matches the existing flat `src/lib/` pipeline convention (product-photo/social-graphic/text-graphic).
- **No UI this slice** — delivered as service + API; the on-screen two-photo picker lands with the generation UI (same boundary STU-C3 flagged for the product-photo picker). Out of scope.
- **Enhancement pass deferred** — `nano-banana-edit` is image-to-image, unconfirmed on the current key (free-tier shim serves only `nano-banana-2`); the composite is complete at $0 without it. Seam in place.
- **Human-verified + Done + committed `cc2c4f3`** — user ran `POST /api/composite` in-browser → `201` Asset Kit with a labelled before/after image; DEV-66 → Done.

**Tech debt observed:** none new. Carryover: OpenAI key still 401 (embed-back/text paths); free-tier Muapi shim still gates premium/enhancement completion.

### 2026-07-18 — STU-C3 QA (final): root cause was a browser file-dialog block; refactored to /api + overlay; DEV-62 → Done

**Resolution:** the upload "did nothing" was **not an app bug** — the user's Chrome was blocking file-selection dialogs (extension or managed `AllowFileSelectionDialogs` policy). Confirmed by the user's own console diagnostic (`topAtInputCenter: "INPUT[file]"`, button hydrated, no overlay) and finally by **uploading working in a different browser**. No web page can open a file dialog when the browser blocks it.

**Along the way the upload was hardened / re-architected (all kept):**
- **Switched Media Library from Server Actions → `/api` routes + browser `fetch`**, matching the Gallery page (the app's proven-working pattern; the whole app uses `/api` routes). New `src/app/api/media-library/route.ts` (GET list + POST multipart upload) and `.../[id]/route.ts` (DELETE). Removed `(dashboard)/library/actions.ts`. Route handlers also aren't subject to the Server Action body-size limit, so large photos upload cleanly. **Deviation from the plan/CLAUDE.md "Server Actions" note — flag for human**: done to match the rest of the app; revisit if a Replit deploy needs Server Actions (note CLAUDE.md says `/api/*` is proxy-intercepted on Replit, but gallery/plan already rely on `/api`).
- **Upload trigger is a transparent `<input type=file>` overlay** (opacity-0, absolute inset-0) over the styled button — a real click lands on the input so the OS picker opens natively (no `input.click()` on a `display:none` input, which silently fails to open the picker in some browsers).
- `LibraryView` now fetches its list on mount (like `GalleryView`); `page.tsx` simplified to render `<LibraryView />` (no server-side seeding).
- Reverted the earlier (wrong-theory) `next.config.ts` `serverActions.bodySizeLimit` — no Server Actions remain in the app.
- Live-verified the storage path end-to-end (R2 upload → public URL → fetch-back 200 → DB insert/delete) via a temporary diagnostic route inside the Next runtime.

**Verified:** `typecheck ✅ · tests 124/124 ✅ · lint ✅ · build ✅`. Media Library API returns clean 401 unauth (like Gallery); authenticated `GET /api/media-library` → 200 in the user's browser.

**DEV-62 → Done.** Files (final): `src/app/api/media-library/route.ts` (new), `src/app/api/media-library/[id]/route.ts` (new), `src/components/library/library-view.tsx` (rewritten — fetch + overlay), `(dashboard)/library/page.tsx` (simplified), `next.config.ts` (reverted). Removed: `(dashboard)/library/actions.ts`.

### 2026-07-18 — STU-C3 QA (superseded): upload button inert → native <label> trigger + clean-rebuild

**Symptom:** user: "unable to upload photos" — **the file dialog never opens** when clicking Upload (confirmed via AskUserQuestion: "file dialog won't open").
**Diagnosis (real reproduction, not theory this time):**
- Ran the **full R2+DB upload path live inside the Next runtime** (temporary diag route calling the real `mediaLibraryService.uploadFromBuffer` for a real user) → **works end to end**: R2 upload → public URL → fetch-back 200/image-png → DB insert + delete. So storage/env/service are all fine.
- Rendered the real `LibraryView` on a temp unauth page in a controlled browser: the component **hydrates and the button click reaches the file input** in a *clean* build (`clickReachedInput: true`, no console errors). So the component logic is correct.
- ⇒ The user's failure is a **stale/corrupted client bundle** on the long-running dev server. Tell-tale: `webpack.cache … invalid stored block lengths` in the logs — `.next` cache corruption from **multiple `next dev` processes sharing one `.next`** (the other chat's server + the diagnostic servers I spun up in this folder). A broken client chunk = `LibraryView` never hydrates = inert button = dialog won't open.
- ⚠️ My earlier "1 MB Server Action body limit" diagnosis was **wrong** (superseded). The body limit was never the cause; the config change is still a reasonable safeguard and stays.
**Fix (defense in depth):**
- **Upload trigger is now a native `<label htmlFor>`** (rendered via `Button asChild`), not `inputRef.click()`. A label opens the file dialog through pure HTML — works even before/without hydration and isn't subject to browsers blocking programmatic clicks on a `display:none` input. Verified in-browser: 2 labels wired to one input, click reaches it.
- Kept the client-side size/type pre-check + louder error toasts from the prior pass.
**Action for the user:** the running server's `.next` is corrupted — **stop all dev servers, `rm -rf artifacts/web/.next`, start ONE dev server** (avoid running multiple dev servers in this folder at once — they corrupt the shared `.next`). Then the label fix guarantees the dialog opens.
**Verified:** `typecheck ✅ · tests 124/124 ✅ · lint ✅`; label trigger confirmed working in a clean browser.
**Files:** `artifacts/web/src/components/library/library-view.tsx` (native-label trigger; earlier client-side validation retained), `artifacts/web/next.config.ts` (10 MB Server Action limit — kept as a safeguard).

### 2026-07-18 — STU-C3 (DEV-62): Media Library — business photo uploads

**Done:**
- **New `media_library` table** (schema.ts): id, userId (FK→users, cascade), r2Key, mediaUrl, contentType, label (nullable), `source` enum (`upload`/`generated`, default upload), createdAt, userId index. Applied to Neon via **direct DDL** (drizzle-kit push still broken — esbuild gap) + column/index round-trip verified.
- **`media-library.ts` service** — pure, unit-tested core: magic-byte `detectImageType` (PNG/JPEG/WEBP), `validateMediaUpload` (size → then sniffed content, so oversize/empty reject before any content work), `mediaObjectKey`. `MediaLibraryService.uploadFromBuffer`/`list`/`remove` with injectable upload/save/list/remove seams; delete is ownership-scoped (`id` AND `userId`). Mirrors `asset-kit.ts` seam pattern; defaults lazy-load R2/Drizzle so the module loads under the bare Node runner.
- **Server Actions** (`(dashboard)/library/actions.ts`) — upload/list/delete, each `auth()` + `ensureLocalUser`-gated; validation errors surface user-safe messages, everything else is masked + logged. Project convention (no browser `/api` routes).
- **UI** — `/library` page (server, force-dynamic) → `library-view` (client grid 3/2/1, multi-file upload w/ in-flight tiles, optimistic add + optimistic-delete-with-rollback, empty state, sonner toasts) + `library-card` (thumbnail + hover delete/label). Sidebar nav item (`FolderOpen`), `/library(.*)` protected, `serverActions.bodySizeLimit` → 10mb.
- **TDD:** media-library.test (10). Feedback loop: `typecheck ✅ · tests 124/124 ✅ · lint ✅` (web workspace).
- Docs: CONTEXT.md (**Media Library** term). Linear: DEV-62 → In Progress, approach note + completion comment posted.

**Decisions (flag for reviewer):**
- **Route `/library` in the `(dashboard)` group**, not the plan's literal `/dashboard/library` — matches the DEV-24/26 placement of `/plan` + `/gallery` so it reuses `DashboardShell` (smallest-reversible).
- **"Selectable in the product-photo pipeline":** exposed `listMedia` as the reusable selection source; `ProductPhotoService` already accepts `sourceImageUrl`. No product-photo *UI* exists yet, so the on-screen picker wiring lands when that UI is built — flagged the boundary rather than building it (out of scope).
- Supported types PNG/JPEG/WEBP; validated by magic bytes server-side (client MIME untrusted).
- **Build deferred:** another chat's dev server is running in-folder; `pnpm build` would corrupt its `.next` (known gotcha). Run once that server is stopped. typecheck/lint/tests are green.
- **Left In Progress** for review — this board has no "Needs Review" state (same as STU-C1/C2).

**Tech debt observed:** none new. Server-action file lives under the route group (`(dashboard)/library/actions.ts`) — first Server Actions in the codebase (all prior server-side work was `/api` routes); fine per convention, just noting the codebase now has both patterns. Carried: free-tier `nano-banana-2` shim, OpenAI key (if still 401), esbuild `db:push` gap, `MODULE_TYPELESS_PACKAGE_JSON` cosmetic warning, STU-C1 `flux-krea-dev` repoint pending human confirm.

**Next:** STU-C4 (DEV-66) unblocks once C3 → Done; STU-C6/C7 blocker-free; STU-C5 available.

### 2026-07-18 — STU-C2 (DEV-65): text-graphic asset type + pipeline

**Done:**
- **New `text_graphic` Asset Type** in the Model Router (snake_case, matching `social_graphic`): standard `ideogram-v3-t2i` ($0.02, text-rendering specialist), premium `nano-banana-pro` ($0.12, best-in-class text), `inputType: "text"`. Fetched the live catalog first — both models present, category "Text to Image", costs match exactly.
- **Blocker-risk gate cleared:** ran `pnpm canary:muapi` — all 13 routed models (incl. the two new text specialists) present + LIVE (422). Endpoint liveness confirmed *before* wiring the pipeline to them.
- **`text-graphic.ts` pipeline** (`TextGraphicService`): RAG brand context → prompt that quotes the **exact** display text (offer/schedule/quote) with legibility + layout guidance → route → generate at the format's aspect ratio. Close sibling of social-graphic; **reuses** its shared graphic types so aspect ratios stay single-sourced. Generation-only (assembly stays in the Assemble path).
- **TDD:** text-graphic.test (7) + model-router (+1). Feedback loop: `typecheck ✅ · tests 114/114 ✅ · lint ✅` (web workspace; no dev server running).
- Docs: CONTEXT.md (**Text-Graphic** term + `text_graphic` added to Asset Type canonical list).
- Linear: DEV-65 → In Progress, approach note + completion comment posted; left In Progress for review.

**Decisions (flag for reviewer):**
- **File path deviation:** plan lists `src/lib/pipelines/text-graphic.ts` but no `pipelines/` dir exists — every sibling pipeline is flat in `src/lib/`. Used `src/lib/text-graphic.ts` to match convention (smallest-reversible).
- **Legibility acceptance is completion-gated:** the "all words legible at premium tier" criterion needs a real completion on `nano-banana-pro`. Endpoints are LIVE, but the free-tier shim still collapses `text_graphic` → `nano-banana-2` at generation time, so true legibility is unverifiable until the key is upgraded. Routing/prompt/tests are all in place for when it is.
- Kept the pipeline generation-only (no reframe/asset-kit inside it) to match social-graphic; the plan's "→ reframe → asset kit" wording is handled by the existing Assemble path / Generation Queue, not the pipeline.

**Tech debt observed:** none new. Carried: free-tier `nano-banana-2` shim (blocks completion verification of all non-nano-banana-2 models incl. the new text specialists), OpenAI key (if still 401), esbuild `db:push` gap, `MODULE_TYPELESS_PACKAGE_JSON` cosmetic warning. STU-C1 `flux-krea-dev` repoint still pending human confirm.

**Next:** STU-C3/C6/C7 blocker-free; STU-C5 (DEV-67) unblocks when C2 is marked Done.

### 2026-07-18 — Review + sign-off: STU-C1 (DEV-61) → Done

**Reviewed (fresh session, did not build it):**
- Turned the STU-C1 acceptance criteria into a QA checklist and verified each against the **current** code (not the session-log claims):
  - **Fail-loud on catalog drift** — `resolveWithCatalog` throws when the catalog is reachable but the routed model is absent (`model-router.ts`); tested. ✅
  - **Live price override + offline fallback** — live cost overrides the static value when reachable, silent static fallback (`live:false`) when unreachable; both paths tested. ✅
  - **`inputType` on every routing entry** — all 6 entries; enforced by `Record<AssetType,…>`. ✅ (UI consumption is STU-C2's scope.)
- **Independent verification:** `tests 106/106 ✅ · typecheck ✅` run locally. Fetched the **live** `GET /api/v1/models` (476 models) and confirmed: the parser's `{ models: [...] }` shape is correct; `seedream-v4` is genuinely ABSENT (justifies the `nano-banana-pro` repoint); `nano-banana-2`/`nano-banana-pro`/`ai-product-shot`/`ai-product-photography` all present with categories + costs **matching** the routing table's fallbacks and inputTypes. The two flagged repoint decisions check out.
- **No code changed** — nothing failed or was broken (review rule: fix only what's broken).

**Observations logged (non-blocking, by-design — not fixed):**
- `resolveWithCatalog` is built + tested but **not yet wired** into any pipeline/API — AC #1/#2 provide capability, not live enforcement yet. Natural follow-up: wire into `/api/plan` cost estimates.
- "Catalog up but empty" (`{models:[]}`) would fail loud like "model absent" rather than falling back — harmless today (nothing on a live path); add a guard when wiring in.
- Canary POSTs `{}` with the API key — for a submit-then-poll API a model accepting `{}` could start a billable job; by-design per the plan (models require params → 422).

**Linear:** DEV-61 → **Done** (`completedAt` 2026-07-18). Unblocks **STU-C2 (DEV-65)**.

**Next:** STU-C2/C3/C6/C7 all available (C2 unblocked by this sign-off; C3/C6/C7 blocker-free).

### 2026-07-17 — Phase 2.5 kickoff + STU-C1: live model catalog service + Model Router hardening

**Setup:**
- Human directed: do the new `plan-phase-2-5.md` (Coverage & Asset Foundation) **before** Phase 3. Plan file was already in the repo (identical to the human's copy). Created Linear milestone + all 7 slices (DEV-61…67) with the blockedBy DAG and a `phase-2.5` label. Started STU-C1 (DEV-61).

**Done (STU-C1):**
- **Live catalog service** (`muapi-catalog.ts`): fetches `GET /api/v1/models` (public), ~1h cache, single-flight, stale-on-error, never blocks generation. `tryLoad()`→`null` on unreachable so callers separate "offline" (silent fallback) from "model absent" (fail loud). `inputTypeForCategory` maps `category`→`text`/`image`.
- **Router hardening** (`model-router.ts`): `inputType` on every entry; `route()` stays pure/sync (hot path); new async `resolveWithCatalog()` overrides stale cost with live price, refreshes inputType, and **throws when the catalog is reachable but the routed model is gone** (the `seedream-v4` class of bug). Injectable `CatalogPort` seam.
- **Fixed real drift found via the canary:** `social_graphic.premium` `seedream-v4` (absent from catalog) → `nano-banana-pro`; `social_graphic.standard` `flux-schnell` (POST-404 dead, still catalog-listed) → `nano-banana-2`. Refreshed all stale fallback costs to live values.
- **Liveness canary** (`scripts/muapi-canary.ts`, `pnpm canary:muapi`): POST-probes every routed model. Final run: **all 11 routed models present + live (422)**, canary exits 0.
- **TDD:** muapi-catalog.test (7) + model-router (+4). Feedback loop: `typecheck ✅ · lint ✅ · tests 106/106 ✅ · build ✅` (web workspace; no dev server running).
- Docs: CONTEXT.md (3 new terms) + `.agents/memory/muapi-api-contract.md` (canary + 3 availability tiers).
- Linear: DEV-61 → In Progress, approach note + completion comment posted; left In Progress for review.

**Decisions (flag for reviewer):**
- The two `social_graphic` model repoints are product-ish calls made to clear genuine drift (dead/absent models) — confirm the choices.
- **Liveness ≠ completion:** canary "LIVE" = endpoint accepts requests (422), NOT that a full request completes. Only `nano-banana-2` is completion-verified on this key. STU-C2 (text-graphic) must submit+poll-test `ideogram-v3-t2i`/`nano-banana-pro` before trusting them — its "legible at premium tier" criterion depends on it.
- `resolveWithCatalog` is added but **not yet wired into the generation pipelines** (they still call the pure `route()` + shim). Wiring the live cost/fail-loud into `/api/plan` estimates is a natural follow-up; kept out of STU-C1 to stay in scope.

**Tech debt observed:** routing table still lists intended slugs behind the `nano-banana-2` shim; `MODULE_TYPELESS_PACKAGE_JSON` warning on `node --test`/canary (cosmetic — no `"type":"module"`). Carried: OpenAI key (if still 401), esbuild `db:push` gap, free-tier shim.

**Next:** STU-C3/C6/C7 are blocker-free; STU-C2 unblocks when C1 is marked Done.

### 2026-07-16 — Bugfix: content-plan items showing "failed" → restored the Muapi `nano-banana-2` shim
- **Symptom:** user reported generated items in the content plan showing **failed**. Pipeline logs showed two distinct Muapi errors: `product_photo`/`ai-product-shot` → **422** (`scene_description` + `image_url` required), and `social_graphic`/`sdxl-image` → prediction **failed** `"Model not found."`.
- **Root cause:** an uncommitted working-tree change (this session) had deleted `muapi-availability.ts` and the `resolveModel` seams in `product-photo.ts`/`social-graphic.ts`, and repointed `social_graphic` to `sdxl-image`/`google-imagen4-fast` — all on the claim the key was "upgraded 2026-07-16 and every model live-POST-verified." **That claim was false.**
- **Diagnosis:** fetched the live catalog (`GET /api/v1/models`, 474 models) and live submit+poll–probed the text-to-image candidates. Result: **only `nano-banana-2` completes.** `sdxl-image` → `Model not found`; `google-imagen4-fast` → `Internal Error`; `flux-schnell` → POST 404; `ai-product-shot` is Image-to-Image (needs an input image). Catalog presence ≠ availability.
- **Fix:** backed up the bad diff to scratchpad, then `git checkout HEAD --` on `model-router.ts` + `.test.ts`, `product-photo.ts` + `.test.ts`, `social-graphic.ts` + `.test.ts`, and restored deleted `muapi-availability.ts`. The shim routes every model → `nano-banana-2`.
- **Verified:** `tsc --noEmit` clean; 20 unit tests pass (router/product-photo/social-graphic); **live end-to-end** — ran the real `ProductPhotoService` + `SocialGraphicService` against the live API with a stubbed retriever: both completed via `nano-banana-2` → real `cdn.muapi.ai` URLs. Dev server restarted, no route errors.
- **Also:** unrelated `.next` vendor-chunk error on `/sign-in` earlier this session — cleared `artifacts/web/.next` and restarted (same known cache gotcha).
- **Memory:** updated `.agents/memory/muapi-api-contract.md` with the live-verified served-model list and a "do not delete the shim without live-testing slugs" warning.
- **Tech debt observed:** `model-router.ts` header comment + the deleted-in-error edits referenced a memory file `muapi-dead-catalog-endpoints.md` that never existed. Routing table still lists aspirational slugs (intended design) — fine, since the shim collapses them; revisit only when the key genuinely serves more models.

### 2026-07-16 — Maintenance: Muapi key upgraded → deleted the free-tier `nano-banana-2` shim (⚠️ REVERTED — see entry above; the premise was false)

**Done:**
- **Human upgraded the Muapi key.** Confirmed the new key is in `artifacts/web/.env.local` (ends `…f134dc`, was `…868441`) and re-POST-probed all 12 routing-table slugs on it — all live (422).
- **Executed the long-standing `TODO(muapi-key)`:** deleted `src/lib/muapi-availability.ts` (`resolveAvailableModel`, the shim that forced every routed model to `nano-banana-2` for $0 mock output) and removed the `resolveModel` injectable seam it fed — config option, field, constructor default, and all `this.resolveModel(...)` call sites — from `product-photo.ts` (3 sites) and `social-graphic.ts` (1 site). The Model Router's real models now flow through untouched.
- Updated the `model-router.ts` header caveat, and both test files (removed the shim-specific test + `resolveAvailableModel` import; the "override → nano-banana-2" assertions now expect the real routed models: `ai-product-shot` for product_photo/standard, `sdxl-image` for social_graphic/standard).
- Left the DEV-13 tracer route (`api/tracer/generate-image`) hardcoding `nano-banana-2` alone — it's a standalone tracer, not part of the routed Agent Loop.

**Result:** `typecheck ✅` · `lint ✅ (web)` · `tests ✅ (95/95 — was 96, one shim test removed)` · `build ✅ (web workspace)`. Root `pnpm build` still fails only in the unrelated `mockup-sandbox` workspace (missing `@rollup/rollup-darwin-x64` native binary — pre-existing env issue).

**Reviewer note — behavioral change:** generations no longer return $0 mock output; they now call the real paid Muapi models per the routing table. Product-photo → `ai-product-shot`/`ai-product-photography`; social-graphic → `sdxl-image`/`google-imagen4-fast`; plus the kling/creatify/reframe models. Worth a live end-to-end generation to confirm real media comes back (not done here — empty-body probes prove the endpoints are live, not that full-param generation succeeds).

**Files modified:** deleted `artifacts/web/src/lib/muapi-availability.ts`; edited `artifacts/web/src/lib/product-photo.ts`, `social-graphic.ts`, `model-router.ts`, `product-photo.test.ts`, `social-graphic.test.ts`.

---

### 2026-07-16 — Maintenance: repoint dead Muapi social-graphic models (live POST-probe)

**Done:**
- **Audited every Muapi model slug the code names** (11 in `ROUTING_TABLE` + `nano-banana-2` in the tracer route / availability shim) by POST-probing each with an empty `{}` body against `https://api.muapi.ai/api/v1/<model>` (x-api-key header). Convention: `404` = dead, `422`/`400` = live (missing params, endpoint exists).
- **Result — 2 dead, both in the `social_graphic` entry:** `flux-schnell` (standard) and `seedream-v4` (premium) → 404. The other 10 (`ai-product-shot`, `ai-product-photography`, `kling-v2.1-standard-i2v`, `kling-v2.1-pro-i2v`, `creatify-lipsync`, `kling-v1-avatar-pro`, `ai-background-remover`, `ideogram-v3-reframe`, `luma-flash-reframe`, `nano-banana-2`) all live (422).
- **Note:** the other dead slugs in the hotfix mapping (`hidream-i1-full`, `mmaudio-v2-text-to-audio`, `bytedance-seedream-v4-edit`) are **not present in code** — only in `ARCHITECTURE.md`/plan docs — so no code change needed for them.
- **Fix:** `model-router.ts` → `social_graphic.standard` = `sdxl-image` ($0.004, was flux-schnell $0.03); `social_graphic.premium` = `google-imagen4-fast` ($0.02, was seedream-v4 $0.05). Both replacements POST-probed live (422). `seedream-v4` wasn't in the supplied mapping (that mapping's `bytedance-seedream-v4-edit → nano-banana-edit` is a different image-*edit* slug) — human chose `google-imagen4-fast` for the premium slot.
- Updated `model-router.test.ts` (slug + cost assertions) and the stale example comment in `muapi-availability.ts`.

**Result:** `typecheck ✅` · `lint ✅ (web)` · `model-router tests ✅ (8/8)` · `build ✅ (web workspace)`. Root `pnpm build` fails only in the unrelated `mockup-sandbox` workspace (missing `@rollup/rollup-darwin-x64` native binary — pre-existing machine/env issue, untouched by this change).

**Reviewer note:** the free-tier `resolveAvailableModel` shim still maps everything to `nano-banana-2`, so these new slugs only take effect once the Muapi key is upgraded. The routing table now reflects live endpoints regardless.

**Files modified:** `artifacts/web/src/lib/model-router.ts`, `artifacts/web/src/lib/model-router.test.ts`, `artifacts/web/src/lib/muapi-availability.ts` (comment only).

---

### 2026-07-16 — QA fix (DEV-24): Generation Queue lost-update race + OpenAI key live

**Done:**
- **OpenAI key** replaced by human and account funded — live embeddings + GPT plan verified working (was 401 revoked → then 429 no-quota → now 200 + real output). Dev server restarted so it loads the new key.
- **Bug found in live testing (DEV-24):** content-plan items stuck on "Waiting…" (pending) after generation — plan showed "ready" but e.g. 3/5 complete. **Root cause:** `defaultUpdateItem` (generation-queue.ts) did read-modify-write of the whole `items` jsonb array in JS; parallel item generation → concurrent writers clobber each other (lost updates). Unit test used an in-memory fake updater so it never caught the DB race.
- **Fix:** rewrote `defaultUpdateItem` as a single **atomic SQL** merge into only the matching element (`jsonb_agg` + `jsonb_array_elements ... WITH ORDINALITY` + `elem || patch`); Postgres row-locking serializes concurrent updates. "generating" transition now clears prior error with `null` (not `undefined`). `ContentPlanItemRecord.error` → `string | null`.
- **Proof (live vs Neon):** 5 concurrent updates — old way **2/5** completed (reproduces bug), new atomic way **5/5**. `tests ✅ (96/96)` · `typecheck ✅` · `lint ✅`.
- Linear: QA-fix comment on DEV-24.

**Anything the reviewer should know:**
- The already-stuck plan can't be recovered from the UI (pending items on a completed plan show no Retry — only failed do); their Asset Kits likely exist in the Gallery. Create a fresh plan to verify. Possible defensive follow-up: retry affordance for non-terminal items on a completed plan (not done — the race is fixed).
- DEV-24/25/26 still In Progress for review; full signed-in E2E now unblocked (working key + fix).

**DEV-24 QA checklist run (same day):** exercised the real service singletons end-to-end via a temporary dev-only route (`/api/qa-temp`, since reverted → 404) for the Sunrise Cafe account:
- Create → 5 items, quality score 95, real GPT titles, diverse types ✓
- Approve & Generate All → **5/5 completed, 0 stuck pending**, all have media+kit (race fix proven live) ✓
- Failure→retry → 1 failed then retry reprocessed only-failed → all completed ✓
- Signed-out /plan → sign-in redirect; /api/plan* → 401 ✓ · feedback-loop wiring runs ✓ · Gallery has 10 kits ✓
- **UX gap found + fixed:** State 3 (completed plan) had no path back to create. Added a **"Start a new plan"** button + made staged-loading render regardless of prior state (`plan-flow.tsx`). Signed-in *UI gestures* (inline edit/remove/add, hover thumbs, lightbox) still need a human browser (no test Clerk creds).
- Files: `artifacts/web/src/lib/generation-queue.ts` (atomic updateItem), `src/db/schema.ts` (`ContentPlanItemRecord.error: string|null`), `src/components/plan/plan-flow.tsx` ("Start a new plan" + loading guard). `tests 96/96 ✅ · typecheck ✅ · lint ✅ · build ✅`.

---

### 2026-07-14 — DEV-25: Agent Evals (final Phase-2 slice → Phase 2 COMPLETE)

**Done:**
- **Three loops** (CONTEXT.md → Agent Eval / Plan Quality Score / Performance Feedback Loop / Pipeline Log):
  - **Quality gate:** pure `scorePlanQuality` (0-100: platform coverage / type diversity / title rotation / day-spread + seasonal bonus). Wired into `ContentPlannerService.proposePlan` — **auto-regenerate below 60**, max 2 attempts, keep best, returns `score`. Silent to user.
  - **Feedback loop:** `getPerformanceInsights(userId)` aggregates `generation_feedback` (DEV-26) ⨝ `asset_kits` by content type → plain-English summary → injected into the planner prompt via the DEV-20-reserved `performanceInsights` seam (`/api/plan` POST fetches it, non-fatal).
  - **Reliability:** new `pipeline_logs` table + `persistentPipelineLogger` (console + fire-and-forget insert) wired as the default logger of all 5 pipeline services → "every step logs a row"; `getPipelineReliability()` aggregates per-step success/duration/cost.
- New `src/lib/agent-evals.ts` (pure scorers + injectable-seam service) + `src/lib/pipeline-log.ts`.
- **TDD:** agent-evals.test (10) + content-planner regenerate tests (4). Existing planner tests still green.
- **Live:** `pipeline_logs` DDL + round-trip on Neon.
- `tests ✅ (96/96)` · `typecheck ✅` · `lint ✅` · `build ✅` (server stopped first) · `/api/plan` still 401 signed-out.
- **README updated** (last-slice-of-phase rule) — Agent Loop end to end.
- Linear: DEV-25 → In Progress, approach note + completion comment posted; left In Progress for review.

**Decisions (flagged):** admin reliability *dashboard* deferred to Phase 7 (ships service + data); regenerate capped at 2 (bounds GPT spend); `pipeline_logs` global (no userId). Touched DEV-20 planner by design (reserved seam).

**Tech debt observed:** muapi ↔ pipeline-log type-only circular import (safe, works); `MediaType` still duplicated (schema + asset-kit, carried from DEV-26). Carried: OpenAI key (blocker), Muapi free-tier shim, esbuild push.

**Anything the reviewer should know:**
- **Phase 2 complete** — full Agent Loop (Plan→Retrieve→Route→Execute→Assemble→UI→Gallery→Evals) built. DEV-24/25/26 await review; DEV-15–23 Done.
- Live E2E of scoring/insights needs the OpenAI key replaced. Next phase: Phase 3 (UGC Video), first slice DEV-27 (script generation).

---

### 2026-07-14 — DEV-26: Gallery (browse/manage generated content + thumbs up/down)

**Done:**
- Built on top of DEV-24 **while DEV-24 stays In Progress** (human instruction). UI slice, DESIGN §9.7.
- New `generation_feedback` table (user+kit FK cascade, rating up/down, unique (user, kit)) — direct DDL to Neon + round-trip proving upsert re-rate keeps one row and kit-delete cascades feedback.
- New `src/lib/gallery.ts` (pure: `parseGalleryQuery` clamp/validate, `pageOffset`, `toggleRating`, `GalleryItem`) — **TDD, 6 tests**.
- API: `GET /api/gallery` (12/page lookahead `hasMore`, type+platform filter, sort, LEFT JOIN caller's rating), `POST /api/gallery/feedback` (ownership-scoped toggle via `onConflictDoUpdate`/delete), `PATCH`+`DELETE /api/gallery/[id]` (caption edit, delete).
- UI at `/gallery` (route group): filter/sort bar, grid 3/2/1, hover-thumbs cards, Radix Dialog lightbox (editable caption + hashtag pills + prominent "Did this match your brand?" + Download/Delete), load-more, skeleton + empty states, optimistic ratings. New `dialog.tsx` primitive. Middleware protects `/gallery(.*)`; sidebar link → `/gallery`.
- `tests ✅ (82/82)` · `typecheck ✅` · `lint ✅` · `build ✅` (server stopped first) · gallery APIs 401 signed-out · `/gallery` → sign-in redirect (browser) · no console errors.
- Linear: DEV-26 → In Progress, approach note + completion comment posted; left In Progress for review.

**Decisions (flagged):** type filter = All/Images/Videos (mediaType) not DESIGN's Photo/Graphic/Video (not represented in the data model — photos + graphics are both `image`); deferred Publish (Phase 4), Regenerate, multi-select, date-range filter.

**Tech debt observed:** `MediaType` now duplicated in `schema.ts` (added here) + `asset-kit.ts` (DEV-23) — identical union; dedupe by importing from schema when DEV-23 is next touched. Carried: OpenAI key (blocker), inline queue, esbuild push.

**Anything the reviewer should know:**
- Signed-in gallery UI (grid/lightbox/feedback) unverified — no test Clerk creds + gallery empty until content generates (OpenAI key). QA checklist on the issue is the human pass.
- Only **DEV-25 (Agent Evals)** remains in Phase 2; it consumes `generation_feedback` + the DEV-20 `performanceInsights` seam and needs a `pipeline_logs` table.

---

### 2026-07-14 — DEV-24 follow-up: plan page moved to `/plan` (human decision)

**Done:**
- Human resolved the flagged path deviation: **DESIGN.md §9.5's literal `/plan`**. Implemented via a new `src/app/(dashboard)/` **route group** (the structure plan-phase-2.md's file list specified) whose layout reuses `DashboardShell` — root-level URL, dashboard chrome intact. Page moved, old `src/app/dashboard/plan/` deleted, middleware protects `/plan(.*)`, sidebar link updated. APIs unchanged.
- **Verified:** `GET /plan` 200 signed-in (human's own session in the live server logs), signed-out navigation → sign-in redirect w/ correct `redirect_url`; `typecheck ✅ · lint ✅ · tests 76/76 ✅`. (Dev-server restart + `.next` clear needed for the route group to register — consistent with the known cache gotcha.)
- **Observed during the human's live testing:** Create My Content Plan → 502 on the **revoked OpenAI key** (error handling + pipeline logs worked as designed). Key replacement remains the only blocker for the full QA pass.
- Linear: decision + change summary posted on DEV-24 (still In Progress for review).

**Tech debt observed:** none new. Note: `/dashboard` and the group pages now render the shell via two layout files (literal + group) — merging `/dashboard` into the group later would unify them (cheap, low priority).

---

### 2026-07-13 — DEV-24: Content Plan UI (the Agent Loop goes user-facing)

**Done:**
- **First Phase-2 UI slice** (DESIGN.md §9.5 + §2–7 read first). Full flow at `/dashboard/plan`: State 1 create-hero w/ staged loading copy → State 2 review cards (inline description edit, remove, minimal add-item, sticky "N items · Will use N credits" + Approve footer) → State 3 per-item progress (dim/shimmer/thumbnail+View/Failed+Retry), top progress bar, 2.5s polling, completion banner. Skeleton loaders; Zinc+Emerald tokens; lucide icons (codebase family — DESIGN §2 exception over Phosphor).
- New `content_plans` table (items jsonb w/ per-item status/assetKitId/mediaUrl/error; plan status draft→approved→generating→completed) — direct DDL to Neon + round-trip (push still esbuild-blocked).
- New **Generation Queue** (`generation-queue.ts`): per item route by content type (product_showcase→photo pipeline with `matchProduct`; others incl. ugc_ad→graphic) → caption → Asset Kit assembly; `Promise.allSettled` parallelism, failure isolation, per-item DB status writes; retry processes pending+failed only. **TDD: 6 tests.**
- New API routes: `GET/POST/PATCH /api/plan` (latest / propose-via-planner replacing prior draft, 409 while generating / Zod-validated draft item edits) and `POST /api/plan/approve` (claim → generating → queue inline → completed + totalCost; re-approve retries failed items).
- `tests ✅ (76/76)` · `typecheck ✅` · `lint ✅` · `build ✅` (server stopped first) · signed-out auth verified in-browser (`/dashboard/plan` → sign-in redirect w/ redirect_url; APIs 401) · no console errors.
- Linear: DEV-23 → **Done** (human approved); DEV-24 → In Progress, approach note + completion comment posted; left In Progress for review.

**Decisions (flagged for reviewer):** path `/dashboard/plan` (existing sidebar link + chrome + middleware) vs DESIGN's `/plan` — human's call, cheap to move; credits footer shows "Will use N" only (no fake balance before Phase-6 billing); drag-reorder deferred (DnD dep); quality scoring → DEV-25; Gallery → DEV-26 (View opens media directly).

**Tech debt observed:** approve runs the queue inline in the request — fine at free-tier/mock latency, likely needs a background job for real model latency; curl-based signed-out checks on pages return 404 (Clerk treats non-browser requests differently) — browser check is the real signal.

**Anything the reviewer should know:**
- **Signed-in E2E blocked**: revoked OpenAI key (still 401) + no test Clerk credentials. The QA checklist on DEV-24 is the human verification pass — replace the key first.
- Phase 2 remaining: DEV-26 (Gallery), DEV-25 (Agent Evals).

---

### 2026-07-13 — DEV-23: Asset Kit assembly + auto-embed (Assemble step)

**Done:**
- New `asset_kits` table in `schema.ts` (user FK, title, contentType enum, platform, R2 `mediaUrl`, mediaType, caption, hashtags jsonb, cost, status draft/ready/published, timestamps, user index). Applied via **direct DDL matching drizzle's SQL** (push still esbuild-blocked); live insert/select round-trip verified on Neon (hashtags/cost/status all correct), cleaned up.
- New `src/lib/asset-kit.ts` — `AssetKitService.assemble`: download generated media (content-type→extension via `extensionFor`) → upload to R2 (`asset-kits/{userId}/{ts}.{ext}`) → insert kit row (status `ready`) → **non-fatal embed-back** of title+caption as a `generation`-kind Brand KB embedding (Auto-Embedding: the system learns from every generation). Critical path ordered before the soft step so an embed failure can never lose a saved kit. Injectable download/upload/save/embed seams.
- **TDD:** `asset-kit.test.ts` (6) — extension mapping + fallbacks, assembly order, R2-owned mediaUrl (never the source link), embed content, embed-failure-non-fatal, download-failure-fatal.
- `tests ✅ (70/70)` · `typecheck ✅` · `lint ✅` · `build ✅` — **dev server stopped before the build** this time (the `.next` gotcha), fresh cache + restart after.
- Linear: DEV-22 → **Done** (human approved); DEV-23 → In Progress, approach note + completion comment posted; left In Progress for review.

**Decisions (flagged):** `generations`/`pipeline_logs` tables NOT created (belong to DEV-46 credit tracking / DEV-25 evals; kit row carries aggregate `cost`); R2 not live-re-smoked (proven in DEV-8/11; avoids junk bucket objects); embed-back live check still gated on the revoked OpenAI key (401 re-verified this session — human action outstanding).

**Tech debt observed:** none new. Carried: OpenAI key replacement (blocker), Muapi free-tier shim, esbuild binaries.

**Anything the reviewer should know:**
- Full Agent Loop service chain now exists: Plan → Retrieve → Route → Execute → Assemble. DEV-24 (Content Plan UI) wires it user-facing — first Phase-2 UI slice (DESIGN.md required) and likely the biggest; consider splitting it.

---

### 2026-07-13 — DEV-22: Text generation (captions/hashtags/ad copy) + env fixes

**Done:**
- New `src/lib/text-generation.ts` — the text side of Execute: `generateCaption` (RAG retrieve → brand-conditioned prompt w/ tone/audience/platform/content-type → GPT-4.1-mini structured `{caption, hashtags}` → `normalizeHashtags`: strip `#`, case-insensitive dedupe, cap 10) and `generateAdCopy` (headline/body/cta, same conditioning). Injectable `CaptionLLM`/`AdCopyLLM`/`TextRetriever` seams; shared timing/logging wrapper (steps `execute:caption`/`execute:ad_copy`); GPT cost from token usage. DEV-13 tracer (`openai.ts`) untouched — migrating it is tech debt for when the tracer retires.
- **TDD:** `text-generation.test.ts` (6) — normalization rules, both prompt builders, caption flow w/ retrieval, ad-copy flow, per-op logging, failure propagation.
- **🔑 Live smoke BLOCKED — revoked OpenAI key (env, not code):** `OPENAI_API_KEY` returns 401 straight from OpenAI's API (worked 2026-07-09). Verified independently with a direct `curl` to `/v1/models`. Logic fully unit-tested; identical `generateObject` pattern was live-verified in DEV-20. **Human action: replace the key in `.env.local`.** Affects auto-embedding (non-fatal), planner, retrieval, and this service at runtime until fixed.
- **Fixed the user-reported `.next` vendor-chunk crash** (Clerk module not found on `/sign-up`): cause was running `pnpm build` while the dev server shared `.next`. Stop → `rm -rf .next` → restart; `/sign-up` compiles clean, no console errors. Repeated the mistake once during this slice's own build step and self-corrected the same way. Gotcha recorded in Current status.
- `tests ✅ (64/64)` · `typecheck ✅` · `lint ✅` · `build ✅` · live smoke ⚠️ blocked (key).
- Linear: DEV-21 → **Done** (human approved); DEV-22 → In Progress, approach note + completion comment (incl. key blocker) posted; left In Progress for review.

**Decisions (flagged):** kept the DEV-13 tracer on its own `openai.ts` (no drive-by migration); hashtag canonical form = no leading `#` (matches DEV-13 convention).

**Tech debt observed:** DEV-13 tracer should eventually consume `TextGenerationService`; `.next`-vs-build gotcha suggests stopping the dev server before slice-end builds (process note, now documented).

**Anything the reviewer should know:**
- Replace the OpenAI key first — it gates live verification of this slice AND runtime behavior of DEV-16/17/20 services.
- Next: DEV-23 (Asset Kit assembly + auto-embed) — first persistence slice of Phase 2 (asset_kits/generations tables, R2 upload, embed-back).

---

### 2026-07-09 — DEV-21: Social media graphic generation (Execute step)

**Done:**
- New `src/lib/social-graphic.ts` — `SocialGraphicService.generate`: RAG retrieve (DEV-16) → brand-conditioned prompt (tone / brand colors / audience / content-type angle) → route `social_graphic` (DEV-18) → Muapi generate (DEV-15) at the format's aspect ratio. `FORMAT_ASPECT_RATIOS` lookup (post 1:1 / story 9:16 / banner 16:9) baked into generation (no separate reframe step). Injectable Muapi/retriever/router seams; pure `buildGraphicQuery`/`buildGraphicPrompt`.
- **DRY refactor:** extracted the free-tier `resolveAvailableModel` shim from `product-photo.ts` into shared `src/lib/muapi-availability.ts` (used by both pipelines; `product-photo.ts` re-exports it — no behavior change, DEV-19 tests still pass). Preserves "one deletion on key upgrade."
- **TDD:** `social-graphic.test.ts` (6) — builders, default + per-format aspect ratio, override→nano-banana-2, RAG context injection, failure propagation.
- **Live verification:** generated a real graphic via Muapi `nano-banana-2` with `aspect_ratio` — submit → poll → completed → output URL (free-tier mock, $0).
- `tests ✅ (58/58)` · `typecheck ✅` · `lint ✅` · `build ✅`.
- Linear: DEV-19 → **Done** (human approved via "keep going"); DEV-21 → In Progress, approach note + completion comment posted; left In Progress for review.

**Decisions (flagged):** format→aspect-ratio at generation time (not a reframe step); shared shim extraction (small refactor touching DEV-19's file — import/re-export only); generation only (no R2/DB — DEV-23; no UI — DEV-24).

**Tech debt observed:** none new. The `muapi-availability.ts` shim remains the tracked free-tier workaround (delete on key upgrade).

**Anything the reviewer should know:**
- Next slice DEV-22 (OpenAI text: captions/hashtags/ad copy) extends the DEV-13 tracer `generateCaption` into a real RAG-conditioned service — the text side of Execute before Assemble (DEV-23).

---

### 2026-07-09 — DEV-19: Product photo generation pipeline (Execute step)

**Done:**
- New `src/lib/product-photo.ts` — first **Execute**-step pipeline: `ProductPhotoService.generate` chains RAG retrieve (DEV-16) → optional background removal (when `sourceImageUrl`) → brand-conditioned scene generation → optional reframe (per aspect ratio), routing models via the Model Router (DEV-18) and running them via the MuapiService (DEV-15). Aggregates cost, records per-step, passes step labels to Muapi for self-logging. Injectable Muapi/retriever/router seams; pure `buildPhotoQuery`/`buildScenePrompt`.
- **Free-tier shim (human's call):** `resolveAvailableModel()` maps the router's intended slugs → `nano-banana-2` (only model on this account's free tier; others 404 per DEV-8). Isolated in one TODO-marked function; router stays faithful to ARCHITECTURE. Delete on key upgrade.
- **TDD:** `product-photo.test.ts` (6) — shim mapping, builders, minimal + full pipeline (bg-removal feeds scene, reframes, cost sums to 0.17), bg-removal skip, failure propagation.
- **Live verification:** ran the real scene-generation step against Muapi `nano-banana-2` — submit → poll → completed → output URL (cost $0 on free tier, expected). Chain runs end to end.
- `tests ✅ (52/52)` · `typecheck ✅` · `lint ✅` · `build ✅`.
- Linear: DEV-20 → **Done** (human approved via "proceed per DAG"); DEV-19 → In Progress, approach note + completion comment posted; left In Progress for review.

**Decisions (flagged):** generation only (no R2/DB — that's DEV-23 Assemble); bg-removal + reframe implemented but default-off (no product-image-upload feature; need upgraded key to be meaningful); nano-banana override per human.

**Tech debt observed:** the `resolveAvailableModel` free-tier shim is the tracked workaround — remove when the Muapi key is upgraded (DEV-21 reuses it until then).

**Anything the reviewer should know:**
- Free-tier generations return mock output at $0; live check proves the flow, not image quality.
- Next slice DEV-21 (social graphic) is the same shape (text-to-image via RAG-conditioned prompt) and reuses the shim.

---

### 2026-07-09 — DEV-20: Content Plan Proposal engine (Plan step)

**Done:**
- New `src/lib/content-planner.ts` — the Agent Loop **Plan** step and first slice to *compose* the foundations: `ContentPlannerService.proposePlan(userId, profile, opts?)` looks up the industry strategy (reuses DEV-12 `INDUSTRY_TEMPLATES`), retrieves relevant brand context (DEV-16 RAG), finds upcoming holidays (new `seasonal.ts`), builds a structured prompt, calls GPT-4.1-mini `generateObject`, and normalizes to 5-7 `ContentPlanItem`s (cap 7, drop invalid content types, snap platform to the business's connected list, stamp 1 credit). Injectable `PlanGenerator`+`PlanRetriever` seams; pure `buildRetrievalQuery`/`buildPlannerPrompt`/`normalizeItems`.
- New `src/lib/seasonal.ts` — fixed-date US `HOLIDAYS` + `upcomingHolidays(now, windowDays)` (year rollover, sorted nearest-first).
- **Reuse decisions:** did NOT create the plan's `data/industry-strategies.json` (INDUSTRY_TEMPLATES already is the strategy, per its own doc comment) nor `data/holidays.json` (TS module matches the codebase convention). Flagged in the completion comment.
- **TDD:** `content-planner.test.ts` (8) + `seasonal.test.ts` (5) written first — builders, orchestration, normalization, holiday window/rollover, logging.
- **Live verification:** real GPT-4.1-mini produced a valid 5-item plan for a sample trattoria that referenced the RAG-retrieved product, respected the platform list, followed the restaurant weekly mix, and included 2 Valentine's items (built 5 days before Valentine's).
- `tests ✅ (46/46)` · `typecheck ✅` (validates the generateObject schema) · `lint ✅` · `build ✅`.
- Linear: DEV-18 → **Done** (human approved via "proceed per the Linear DAG"); DEV-20 → In Progress, approach note + completion comment posted; left In Progress for review.

**Decisions (flagged, reversible/forward-compatible):** proposal only (no `content_plans` persistence — DEV-24); quality scoring + feedback loop deferred to DEV-25 (`performanceInsights` seam reserved); estimatedCredits=1/item; US-only fixed-date holidays (no `region` field yet).

**Tech debt observed:** none new. Carried: Muapi model-availability caveat affects the *next* slice (DEV-19) — only `nano-banana-2` works on the free-tier key.

**Anything the reviewer should know:**
- First slice to exercise retrieval + industry templates + LLM together end to end (validated live).
- Next slice DEV-19 (product photo generation) is the first to actually call Muapi generation → will hit the model-key caveat; worth resolving the key first.

---

### 2026-07-09 — DEV-18: Model Router (asset type → Muapi model)

**Done:**
- New `src/lib/model-router.ts` — the Agent Loop **Route** step: `ROUTING_TABLE: Record<AssetType, {standard, premium?}>` transcribed from ARCHITECTURE.md §Route (6 asset types: product_photo, social_graphic, video_animate, ugc_lipsync, background_removal, reframe; model slug + `estimatedCost` per cell). `ModelRouter.route(assetType, quality='standard', params?) → { model, params, estimatedCost }`: default-standard, premium→standard fallback where no premium (background_removal), caller-param merge, unknown-type throw. Pure config, no deps. Model slugs never surface to users ("invisible to users").
- **TDD:** `src/lib/model-router.test.ts` (8 tests) — exhaustive resolution, default/premium/fallback, cost values, param merge + caller-override precedence, unknown-type guard.
- Glossary: added **Asset Type** + **Quality (Route Tier)** to CONTEXT.md; annotated **Model Router** with the impl path.
- Fixed a test-only typecheck error (partial-table cast → spread `ROUTING_TABLE`).
- `tests ✅ (33/33)` · `typecheck ✅` · `lint ✅` · `build ✅`. No live smoke (pure config, no external I/O).
- Linear: DEV-16 → **Done** (human approved via "proceed"); DEV-18 → In Progress, approach note + completion comment posted; left In Progress for review.

**Decisions (flagged, reversible):** table faithful to ARCHITECTURE (incl. Phase-3 video/UGC rows as config only); default per-model `params` empty (caller-merge) to avoid guessing Muapi param names; no consumer/route wiring yet.

**Tech debt observed:** availability caveat carried from DEV-8 — only `nano-banana-2` confirmed on this account's free tier; the router encodes *intended* models, so DEV-19/21 may need slug overrides until the key is upgraded.

**Anything the reviewer should know:**
- Model Router has no consumer yet by design — generation pipelines (DEV-19/21) call it.
- Foundations (DEV-15/16/17/18) done → generation + planner slices open up next.

---

### 2026-07-09 — DEV-16: Retrieval service (semantic search)

**Done:**
- New `src/lib/retrieval.ts` — the Agent Loop **Retrieve** step: `RetrievalService.retrieve(userId, query, {k?, kinds?})` embeds the query and cosine-searches `brand_embeddings` (scoped to the user, optional `kind` filter), returning the top-k `{content, kind, similarity}`; `retrieveContext` also returns a formatted prompt block via `formatRetrievedContext`. Default **k=8** (CONTEXT.md "top-k"). Injectable `QueryEmbedder`+`VectorSearch` seams (unit-tested with fakes); default search = drizzle `cosineDistance` ordered by distance against the DEV-17 HNSW index; default query embedder reuses `openAIEmbedder`.
- Exported DEV-17's `defaultEmbedder` as `openAIEmbedder` so retrieval reuses one embedding-model/cost source (no behavior change).
- **TDD:** `src/lib/retrieval.test.ts` (7 tests) — formatting, top-k default, custom k + kind passthrough, blank-query short-circuit, retrieveContext, success + failure logging.
- **Live verification:** seeded 3 semantically distinct embeddings for a real user (real OpenAI), queried "Italian food and pasta" → pizza ranked #1 (sim 0.46) over car-repair (0.22) / photography (0.21); seed rows cleaned up. Confirms cosine ordering end to end.
- `tests ✅ (25/25)` · `typecheck ✅` (validates drizzle `cosineDistance` query) · `lint ✅` · `build ✅`.
- Linear: DEV-17 → **Done** (human approved via "proceed"); DEV-16 → In Progress, approach note + completion comment posted; left In Progress for review.

**Decisions (flagged, reversible):** top-k only (no min-similarity floor yet); blank query short-circuits; no route/UI wiring (no consumer until DEV-20 planner / generation slices).

**Tech debt observed:** none new this session.

**Anything the reviewer should know:**
- Retrieval has no consumer yet by design — DEV-20 (Content Planner) and the generation pipelines will call it.
- No schema change — uses the HNSW cosine index from DEV-17.

---

### 2026-07-09 — DEV-17: Brand Knowledge Base (pgvector + embedding pipeline)

**Done:**
- Enabled **pgvector on Neon** (`CREATE EXTENSION vector`, v0.8.1) and added the `brand_embeddings` table (`vector(1536)`, `kind` enum, user FK cascade, HNSW cosine index) to `src/db/schema.ts`. Applied via **direct DDL matching drizzle's generated SQL** (drizzle-kit push needs the stripped esbuild binary — DEV-12 gap), so a future `db:push` is a no-op; `schema.ts` stays source of truth.
- New `src/lib/embeddings.ts` — Brand Knowledge Base pipeline: pure `businessProfileToChunks` (one chunk/product + one brand-guideline chunk) and an injectable `BrandKnowledgeBase.syncBusinessProfile` (fake `Embedder`+`EmbeddingStore` seams for tests). Default embedder = OpenAI `text-embedding-3-small` via AI SDK `embedMany` (cost @ $0.02/1M tokens); default store = Drizzle delete+insert with **replace-on-sync** scoped to `product`/`brand_guideline` kinds. Reuses the DEV-15 `PipelineLogger` type; all `@/…`/AI-SDK value imports lazy so the module loads under the bare Node test runner.
- Wired **non-fatal auto-embedding** into `business-profile` POST (onboarding completion) + PATCH (edits) — a `syncKnowledgeBase` helper that logs and swallows failures so the profile save never breaks. GET untouched.
- **TDD:** `src/lib/embeddings.test.ts` (6 tests) written first — chunking, blank/absent handling, embed+store replace semantics, cost, success + failure logging.
- **Live verification:** stored + read back a real 1536-dim vector through the actual column (dims=1536, cleaned up); ran a real OpenAI `embedMany` call (2 vectors, 1536 dims, 19 tokens) — confirms the default embedder path end to end.
- `tests ✅ (18/18)` · `typecheck ✅` (validates AI SDK `openai.embedding`/`embedMany` against installed versions) · `lint ✅` · `build ✅` (all routes intact).
- Linear: DEV-15 → **Done** (human approved); DEV-17 → In Progress, approach note + completion comment posted; left In Progress for review.

**Decisions (flagged in approach note, all reversible):**
- Non-fatal embedding · replace-on-sync · inline/awaited on the request path · chunking = per-product + one brand-guideline chunk.

**Tech debt observed:**
- `defaultStore` does delete-then-insert as two neon-http statements (not atomic). Fine for MVP; could use `db.batch` for a transaction if it matters.
- Carried over: drizzle-kit push / `db:push` still blocked by the stripped esbuild binary — schema changes need direct DDL or a restored install.

**Anything the reviewer should know:**
- Retrieval/similarity *search* is deliberately out of scope (next slice, DEV-16); the HNSW index is already in place for it.
- `generation`/`caption_edit` embedding kinds exist in the schema but are only written by later generation slices.

---

### 2026-07-08 — DEV-15: Muapi.ai integration service (first Phase 2 slice)

**Done:**
- Rewrote `src/lib/muapi.ts` from DEV-8's minimal tracer client into the real service the rest of Phase 2 depends on: **retry with exponential backoff** (network err / 429 / 5xx, max 3, delays 500→1000→2000ms; no retry on other 4xx), **typed `MuapiError`** (`status` + `retryable`), **cost tracking** (`X-MuAPI-Cost-USD` header → body fallback), and an **injectable `PipelineLogger` hook** emitting `{ step, model, durationMs, success, cost, error? }` (matches CONTEXT.md "Pipeline Log"). Generalized the return to `{ outputs, imageUrl, cost, model, requestId }` — `imageUrl` (= `outputs[0]`) retained so the DEV-8 tracer route needs no change.
- Made the service fully injectable (`fetch`/`sleep`/clock/apiKey/logger) and moved the env read to a lazy `import("@/env")`, so the module is unit-testable without a validated env.
- **TDD:** wrote `src/lib/muapi.test.ts` first (12 tests, red → green): happy path, cost header/body, retry 429/500, no-retry 400, retry exhaustion, exact backoff timing, failed status, timeout, empty outputs, success + failure logging.
- **Decision — test runner (asked human up front):** chose "set up a real runner now" but discovered **Vitest can't run here** — the workspace's pnpm overrides strip the native esbuild/rollup binaries it needs (same root cause as DEV-12's `db:push` esbuild gap). Adapted to **Node 24's built-in `node --test` + native TS type-stripping** — zero new deps, runs clean. This is now the Phase-2 test harness; `pnpm test` wired at web package + repo root. Enabling change: `allowImportingTsExtensions` in web tsconfig.
- **Decision — pipeline_logs (asked human up front):** deferred DB persistence; injectable console-backed logger for now, wired to the real `pipeline_logs` table when it's created (DEV-17 / generation slices).
- `tests ✅ (12/12)` · `typecheck ✅` · `lint ✅` · `build ✅` (all routes intact, tracer unaffected).
- Linear: DEV-15 → In Progress, approach note + completion comment (5-section format) posted; left In Progress for review (no "Needs Review" status on the team).

**Tech debt observed:**
- No `@esbuild/darwin-x64` / rollup native binaries in the install (stripped by workspace overrides) → Vitest and `db:push` both need workarounds. A restored install (or committed binaries) would remove the friction. Carried over from DEV-12.
- `node --test` prints a benign `MODULE_TYPELESS_PACKAGE_JSON` reparse warning; left as-is (adding `"type":"module"` risks Next's CommonJS config files).

**Anything the reviewer should know:**
- No live Muapi call this session — DEV-8 already proved the live contract; this slice hardens it and is covered entirely by unit tests with a fake network.
- Scope held to the service layer + tests; pgvector/RAG, model router, and the generation pipelines remain in later slices.

---

### 2026-07-08 — Phase 1 closeout: README update + status roll to Phase 2

**Done:**
- Human confirmed all Phase 1 slices (DEV-9/10/11/12/14/59) moved to **Done** in Linear.
- Rewrote `README.md` (was still "Phase 0 — Scaffold in progress") to reflect current reality: Phases 0–1 complete, "What works today" summary (landing, Clerk auth + webhook/JIT sync, onboarding wizard, dashboard summary card, generation tracer), monorepo layout, getting-started + scripts, and the agent-workflow pointer. Satisfies the last-slice-of-phase README rule.
- Rolled `PROGRESS.md` current status forward to Phase 2; next slice identified as **DEV-15 (Muapi.ai integration service)** — root of the Phase 2 DAG, blocker DEV-14 now Done.
- No code changed this session (docs only) — no typecheck/lint/build run needed.

**Anything the reviewer should know:**
- DEV-15 not started this session (awaiting go-ahead). When picked up: read `plan-phase-2.md`, post approach note, move DEV-15 → In Progress, TDD.
- **Tech debt:** no `.env.local.example` exists in `artifacts/web` (only a live `.env.local`). README now points new devs to `src/env.ts` for required vars instead; a committed `.env.local.example` would be friendlier.

---

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
