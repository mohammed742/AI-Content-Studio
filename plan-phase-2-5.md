# Phase 2.5 — Coverage & Asset Foundation

**Status**: Not started
**Goal**: Close the gap between what onboarding promises and what the generation engine can deliver. Onboarding suggests ~32 content themes across 8 industries; roughly 14 of them are text-heavy graphics the current image models cannot render legibly, and several more need the business's own photos, two-image composites, or multi-image carousels — none of which exist yet. This phase also hardens the Model Router against price/model drift and ships the data files Phases 1–2 deferred.

> **Why now**: these slices must land before the Phase 2 Content Plan UI meets real users (a plan that proposes content it can't generate destroys trust) and before Phase 3 (the presenter library is a hard dependency of the lip-sync pipeline).

> **Linear note**: issue numbers differ per student board. Always match slices **by title**, not by number. If two issues share a title, use the one assigned to a phase milestone.

## Slices

- `STU-C1`: Live model catalog service + Model Router hardening
- `STU-C2`: Text-graphic asset type + pipeline ⭐ (biggest coverage gap)
- `STU-C3`: Media library — business photo uploads
- `STU-C4`: Before/after composite pipeline
- `STU-C5`: Carousel asset kits (multi-image)
- `STU-C6`: Seasonal + industry strategy data files (deferred from Phases 1–2)
- `STU-C7`: Presenter library (stock avatars for Phase 3 UGC)

## Files to touch
```
src/lib/model-router.ts, src/lib/muapi-catalog.ts (new), src/lib/pipelines/text-graphic.ts (new),
src/lib/pipelines/composite.ts (new), src/lib/media-library.ts (new), src/lib/presenters.ts (new),
src/db/schema.ts (media_library, presenters tables; asset_kits multi-image support),
src/app/dashboard/library/ (new), src/components/library/,
data/holidays.json (new), data/industry-strategies.json (new), data/presenters.json (new)
```

## Steps

### 1. Live model catalog service + router hardening
1. `src/lib/muapi-catalog.ts` — fetch `GET https://api.muapi.ai/api/v1/models` (public, no key), cache ~1 hour in memory; expose `getModel(name)` → `{ category, cost, dynamic_pricing }`.
2. Add `inputType: "text" | "image" | "text+image"` to every `ROUTING_TABLE` entry, derived from the catalog `category` ("Text to Image" → text, "Image to Image" → image). Generation UIs use this to know what to ask the user for.
3. At resolve time, override `estimatedCostUsd` with the live catalog cost when available; keep the hard-coded value as offline fallback. Fail loud if a routed model id is missing from the catalog (this is exactly the class of bug that shipped `seedream-v4`).
4. For any user-facing cost estimate, use `POST /api/v1/models/{name}/estimate-cost` with the real request body — listed costs are base estimates only (`dynamic_pricing=true` on all models).
5. **Router liveness canary (required).** Catalog presence is NOT proof a model works — the catalog lists models whose generation endpoint returns `404 {"detail":"Not Found"}` on `POST /api/v1/<model>` (confirmed dead: `flux-schnell`, `hidream-i1-full`, `hidream-i1-fast`, `flux-dev`, `mmaudio-v2-text-to-audio`, `bytedance-seedream-v4-edit`). Add a script that POST-probes every `ROUTING_TABLE` model with an empty body `{}`: a `404` means dead (fix the routing entry), a `422`/`400` (missing params) means the endpoint is live. See `.agents/memory/muapi-dead-catalog-endpoints.md`. Every model id in this plan was live-POST-verified on 2026-07-10.

### 2. Text-graphic asset type + pipeline
1. Add `text-graphic` to `ASSET_TYPES` with routing: standard `ideogram-v3-t2i` ($0.02, the text-rendering specialist), premium `nano-banana-pro` ($0.12, best-in-class text). Both live-POST-verified 2026-07-10 (not just catalog presence).
2. `src/lib/pipelines/text-graphic.ts` — same pattern as the graphic pipeline: RAG brand context → prompt that puts the exact text (offer, schedule, quote) in quotes with layout guidance → generate → reframe → asset kit.
3. This asset type serves: daily specials, sales & promos, class schedules, market updates, booking promos, testimonials/quotes, tips, motivation posts — the single biggest bucket of onboarding content themes.
4. Acceptance test the text legibility explicitly (see criteria).

### 3. Media library
1. `media_library` table: id, userId, r2Key, mediaUrl, contentType, label (nullable), source (upload/generated), createdAt.
2. Server Action upload (FormData → R2), same pattern as the logo upload; respect the 3 MB `serverActions.bodySizeLimit` (raise it if needed for photos).
3. `/dashboard/library` — grid of the user's photos, upload button, delete. Read design.md first.
4. This unblocks: the product-photo pipeline's "upload" step (Phase 2), before/after (this phase), behind-the-scenes/listing-tour themes, and image-to-image models generally.

### 4. Before/after composite
1. `src/lib/pipelines/composite.ts` — takes two media-library images → server-side side-by-side composite (sharp, $0 — no model call) with labels; optional enhancement pass via `nano-banana-edit` ($0.03, live-verified 2026-07-10) for style-matched framing.
2. Serves: before & after (salons), style/member transformations (salons, gyms).

### 5. Carousel asset kits
1. Extend `asset_kits` to hold an ordered media array (or a child table `asset_kit_media`: kitId, mediaUrl, position).
2. Carousel = N generations of existing asset types sharing one caption/hashtags set.
3. Serves: how-to guides, process breakdowns, style guides, lookbooks.
4. **Dependency flag for Phase 4**: verify Muapi's Instagram publish endpoint supports carousel posts before promising scheduled carousel publishing.

### 6. Seasonal + industry strategy data
1. `data/holidays.json` — major holidays by region (deferred from Phase 1 step 6). The profile's `region` field already exists in the schema.
2. `data/industry-strategies.json` — per-industry content strategy hints (already listed in Phase 2's files-to-touch, never created).
3. The Content Plan Proposal engine reads both (its "Valentine's in 5 days" acceptance criterion in plan-phase-2.md is impossible without this data).

### 7. Presenter library
1. `data/presenters.json` + `presenters` table (or static JSON only for MVP): id, name, imageUrl, gender, ageRange, style, targetAudienceTags.
2. Source the images: generate ~8–12 consistent presenter portraits with a text-to-image model (one-time cost, full usage rights) OR license stock photos (verify license permits AI lip-sync derivative use — see risks).
3. Store portraits in R2. Phase 3's lip-sync pipeline and "agent pre-selects presenter matching target audience" step consume this — **without this slice Phase 3 cannot run**.

## Acceptance Criteria
- Router resolve for a routed model missing from the live catalog → loud error, not silent fallback
- Routed prices reflect the live catalog when reachable; app still works offline via fallback costs
- Every routing entry exposes `inputType`; generation UI asks for text or image accordingly
- "Daily specials: 2-for-1 lattes till Friday" text-graphic → all words legible and correctly spelled at premium tier
- Upload 3 photos to the library → they appear in the grid and are selectable in the product-photo pipeline
- Two library photos → before/after composite with labels, saved as an asset kit
- Carousel kit with 3 images preserves order in gallery and in the kit payload
- Content Plan engine can enumerate upcoming holidays for the profile's region from data/holidays.json
- Presenter list renders with at least 8 presenters, filterable by audience tags

## Out of scope
- Video content types (Phase 3), publishing carousels (Phase 4), scheduling (Phase 5)
- Template/overlay text rendering engine (real text composited over generated backgrounds) — superior long-term for pixel-perfect schedules/menus; revisit if model-rendered text quality disappoints
- Custom presenter upload (Phase 3 lists it out of scope too)

## Risks
| Risk | Mitigation |
|------|-----------|
| Model-rendered text still imperfect on long copy | Keep copy short (<12 words) in prompts; template/overlay approach is the documented fallback |
| Presenter licensing for lip-sync derivatives | Prefer generated presenters (unambiguous rights); if stock, verify license explicitly covers synthetic-video derivative use |
| Catalog fetch adds latency/flakiness | 1-hour in-memory cache + hard-coded fallback; never block generation on the catalog call |
| bodySizeLimit too small for photo uploads | Raise serverActions.bodySizeLimit (currently 3mb) and validate dimensions server-side |
