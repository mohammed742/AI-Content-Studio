---
name: Muapi.ai API contract
description: Correct request/response shape, auth, and async pattern for the Muapi.ai generative AI API — the first integration attempt guessed wrong on every axis.
---

Muapi.ai's real API contract (verified against https://muapi.ai/docs/api-reference on 2026-07-04):

- Base URL: `https://api.muapi.ai/api/v1` (not `/v1`)
- Auth: `x-api-key: <key>` header — **not** `Authorization: Bearer`
- It is a **submit-then-poll** async API, not a single synchronous call:
  1. `POST /api/v1/{model-slug}` with model-specific params → `{ request_id, status, cost }`
  2. Poll `GET /api/v1/predictions/{request_id}/result` until `status === "completed"` → `{ outputs: [url], cost }`
- The model is part of the URL path (a slug like `nano-banana-2`, `flux-dev`), not a `model` field in the JSON body.
- Cost is available both in the JSON `cost.amount_usd` and as response headers (`X-MuAPI-Cost-USD`, `X-Account-Balance`) on every `/api/v1/*` call.
- The full live model catalog (with per-account availability) can be fetched unauthenticated at `GET https://api.muapi.ai/api/v1/models`.

**Why this matters:** A prior integration attempt guessed this entire contract (wrong base URL, Bearer auth, synchronous call, model-in-body) without checking real docs, and it silently shipped — only failing when a real user hit "generate" in production (404 Not Found). Also: models listed in the public docs/catalog (e.g. `flux-dev`, `flux-schnell`) may still 404 on a given account if gated by plan tier — confirm actual availability via `GET /api/v1/models` or a live test call, not just the docs page, before hardcoding a model slug.

**How to apply:** Before wiring any new Muapi model/endpoint, re-verify against `https://muapi.ai/docs/api-reference` and test the exact model slug against the live API (or `GET /api/v1/models`) rather than assuming a docs-listed model works for the current key/plan.

---

**Served-model reality (live-tested 2026-07-16, key in `artifacts/web/.env.local`):** Only `nano-banana-2` (Text to Image) actually completes on this key. Slugs that appear in `GET /api/v1/models` but still FAIL at generation time:
- `sdxl-image` → prediction returns `status:failed, error:"Model not found."`
- `google-imagen4-fast` → `"Internal Error, Please try again later."` (unreliable)
- `flux-schnell` → POST 404 `"Not Found"` (endpoint not served)
- `ai-product-shot` → it is an **Image to Image** model: POST 422 requiring `image_url` + `scene_description`, so it cannot generate a product photo from a text prompt alone.

Because of this, the generation pipelines route **every** model through `artifacts/web/src/lib/muapi-availability.ts` (`resolveAvailableModel` → `nano-banana-2`). **Do NOT delete this shim or repoint the routing table to catalog slugs until you have live-tested that those slugs actually complete for the current key** — presence in `GET /api/v1/models` is NOT proof of availability. A prior session deleted the shim on the false assumption the key had been "upgraded and verified"; this made every content-plan item show **failed** (422/`Model not found`). Fix was to restore the shim.

---

**STU-C1 (2026-07-17) — liveness canary + three availability tiers.** Added `pnpm canary:muapi` (`artifacts/web/scripts/muapi-canary.ts`): POST-probes every `ROUTING_TABLE` model with `{}`. There are now **three** distinct availability signals, do not conflate them:
1. **Catalog presence** (`GET /api/v1/models`) — is it listed? `seedream-v4` is NOT (was routed as `social_graphic/premium` → repointed to `nano-banana-pro`).
2. **Endpoint liveness** (POST probe): `404` = dead endpoint (e.g. `flux-schnell` — catalog-listed but 404s, was `social_graphic/standard` → repointed to `nano-banana-2`); `422`/`400` = live endpoint (accepts requests, params missing).
3. **Completion** (submit→poll→`completed`): the ONLY axis that proves real output. **A `422` from the canary does NOT prove completion** — that still needs a full valid request. As of 2026-07-16 only `nano-banana-2` is completion-verified; the canary showing all 11 routed models "LIVE" (422) means their *endpoints* exist, not that they finish. Before trusting any non-`nano-banana-2` model in a pipeline, run a real submit+poll test.

The Model Router now overrides its stale hard-coded costs with live catalog prices at resolve time (`ModelRouter.resolveWithCatalog`, `src/lib/muapi-catalog.ts`) and fails loud when a routed model is absent from the catalog. Costs were badly stale (e.g. `creatify-lipsync` $0.30 hard-coded vs $0.04 live).
