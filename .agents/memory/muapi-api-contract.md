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
