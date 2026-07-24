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

---

**2026-07-23 — PAID KEY CONFIRMED; free-tier shim REMOVED. This supersedes the "Served-model reality" block above and its "Do NOT delete this shim" warning.** The key in `artifacts/web/.env.local` is a **paid** key that completes real, non-`nano-banana-2` models. Verified by a live submit→poll completion probe (drives the real `MuapiService`):
- `flux-krea-dev` (`social_graphic/premium`) → ✅ **completes**, real CDN image, $0.015.
- `nano-banana-2` → ✅ completes (control), $0.06.
- `ideogram-v3-t2i` (was `text_graphic/standard`) → ❌ **completes-FAIL 3/3**: accepts the job (POST 422 on empty body = live) then the poll dies with `status:failed, error:"internal error, please try again later."`. This is model-side breakage, independent of key/tier.

Actions taken: **deleted `src/lib/muapi-availability.ts`** (`resolveAvailableModel`) and removed the `resolveModel` seam from `product-photo.ts` / `social-graphic.ts` / `text-graphic.ts` so the Router's intended slugs flow through untouched; **repointed `text_graphic/standard` off the dead `ideogram-v3-t2i` → `nano-banana-2`** (what the shim was already rendering there). The 2026-07-16 "restore the shim" episode was correct **for that key at that time** — the difference now is a paid key + a real completion probe, not an assumption.

Still-unverified (completion **not** re-tested 2026-07-23, decision was to defer): the input-image models `ai-product-shot`, `ai-background-remover`, `ideogram-v3-reframe` (product-photo pipeline) and `ai-product-photography`, plus all Phase-3 video/lipsync slugs. They pass liveness (422) but a bare-prompt probe can't complete-test an Image-to-Image model — **run a real input-image submit+poll before trusting them.** The three-axis rule (catalog presence ≠ endpoint liveness ≠ completion) still holds.

---

**2026-07-23 (later) — input-image completion probe + REAL param schemas.** Read each model's `422` validation body (empty-`{}` POST, free) then submitted real jobs with a real input image. **Critical: the param names below are the ground truth — `product-photo.ts` (DEV-19) currently sends `{prompt, image}`, which is WRONG for every one of these; with the shim gone the product-photo pipeline will 422 at runtime and needs a param-mapping fix.**

| Model | Route | Required params (from 422 body) | Completion |
|---|---|---|---|
| `ai-background-remover` | background_removal/standard | `image_url` | ✅ $0.01 |
| `ai-product-shot` | product_photo/standard | `image_url`, `scene_description` | ✅ $0.02 |
| `ideogram-v3-reframe` | reframe/standard | `image_url` | ❌ `failed: internal error` — same failure as `ideogram-v3-t2i`; the **ideogram family is down/broken** on this key. Repoint like t2i was. |
| `ai-product-photography` | product_photo/**premium** | `prompt`, `person_image_url`, `product_image_url` | ❌ downstream 422 — this is a **person+product try-on** model (needs a real person photo), NOT a plain product generator. Likely the wrong model for `product_photo/premium`. |
| `luma-flash-reframe` | reframe/**premium** | `video_url` | ⚠️ **video** reframe model — mis-routed as image `reframe/premium`. Do not call it with an image. |

So the two that complete (`ai-product-shot`, `ai-background-remover`) still need `product-photo.ts` to send `image_url`/`scene_description` (not `image`/`prompt`). `reframe` (both tiers) and `product_photo/premium` need model/param rework before they work. **These are latent DEV-19 bugs the free-tier shim was masking — not regressions from the shim removal itself, but now activated by it.**

---

**2026-07-23 (DEV-28) — voiceover model `elevenlabs-text-to-dialogue-v3`.** Get the exact input schema (incl. enums) for any Muapi model from **`GET /api/v1/models/{slug}`** → `input_schema.schemas.input_data.properties` (this is how the voice list below was found — no separate `/voices` endpoint exists; `/{slug}/voices`, `/voices`, `/{slug}/schema` all 404).
- Request body: `{ dialogue: [{ text, voice_id }], stability?, language_code? }`. `dialogue` is a **list** of speaker turns (each needs BOTH `text` and `voice_id`); `stability` 0–1 (default 0.5); `language_code` optional ISO-639-1 (auto-detect when omitted); total text ≤ 2000 chars.
- `voice_id` must be one of Muapi's **25 supported voices** (an enum in the schema) — raw ElevenLabs IDs (e.g. `21m00Tcm4TlvDq8ikWAM`) are rejected with "Invalid voice parameter". The list is mirrored in `src/lib/ugc-voiceover.ts` `VOICEOVER_VOICES`.
- **Completion: FAILED 7/7 (2026-07-23 → re-probed 2026-07-24)** — with a valid enum voice + correct schema, generation ends `status:failed, error:"internal error, please try again later"` (same signature as the dead ideogram family). First session: 4/4 instant fail. Re-probe next day: jobs are now *accepted and processed* (poll ran past a 120s client timeout) but still terminally fail with the same internal error (3/3). Catalog-live + 422-live, but NOT completing — looks like a persistent provider-side generation fault, not a transient blip. It is the plan's **sole** voiceover model (mmaudio fallback is dead 404).

**2026-07-24 — RESOLVED: swapped voiceover to `gemini-3-1-flash-tts` (human-approved).** Re-audited the Text-to-Audio catalog (482 models; ~7 real speech TTS after excluding Suno music + lipsync). The 2026-07-10 plan claim "next live TTS is $0.65" is stale — the catalog now has two Gemini TTS at $0.035 catalog / **~$0.003 actual**:
- `gemini-3-1-flash-tts` ✅ completes (~38s, MP3), **chosen** (fast, newest, cheap).
- `gemini-2-5-pro-tts` ✅ completes (~48s, MP3) — the premium alternative.
- `minimax-speech-2.6-turbo` ($0.65, simple `prompt`+`voice_id`, 472-voice enum) — untested fallback if Gemini quality disappoints.

Gemini TTS request shape (multi-speaker, from live `input_schema`): `{ speakers: [{ speaker_id:"Speaker N", voice_name(enum 30: Kore/Zephyr/Aoede…), accent(enum 8), style(enum 6), pace(enum 4) }], dialogue_turns: [{ speaker_id, text(≤10000) }], scene?, sample_context?, temperature? }`. DEV-28 (`src/lib/ugc-voiceover.ts`) uses one speaker + one turn. **End-to-end completion-verified** through the real service (MP3 out, $0.00336). `elevenlabs-text-to-dialogue-v3` is left broken/unused; re-audit only if Gemini quality is rejected.
