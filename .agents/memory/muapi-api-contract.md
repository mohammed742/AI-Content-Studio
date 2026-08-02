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

---

**2026-07-24 (DEV-29) — talking-head / lip-sync: `creatify-lipsync` needs a VIDEO, not a photo.** The plan wanted "presenter *photo* + voiceover → talking head," but the live schema (`GET /api/v1/models/{slug}`) shows the "Audio to Video" category splits into two incompatible input shapes:
- **`video_url` + `audio_url`** (re-syncs an existing presenter *video*'s lips — CANNOT animate a static portrait): `creatify-lipsync`, `latent-sync`, `sync-lipsync`, `veed-lipsync` — all **$0.04**. The plan's `creatify-lipsync` is one of these → structurally wrong for a portrait-only presenter library.
- **`image_url` + `audio_url`** (animates a static portrait into a talking head — the plan's real intent): `infinitetalk-image-to-video` **$0.20** (+ optional `prompt`, `resolution` enum `480p`/`720p` default `480p`); `omnihuman-1-5` $0.25; `kling-v2-avatar-standard` $0.35; `kling-v1-avatar-pro` $0.65 (`prompt`/`image_url`/`audio_url`, **no `resolution`**).

**Chosen (human-approved): `infinitetalk-image-to-video`** — cheapest image-driven option, keeps the portrait data model, per-video total ≈$0.66 (< $1 goal). **Completion-verified end-to-end 2026-07-24**: real gemini VO + real test portrait → real talking-head MP4, 480p, 91.5s, **actual $0.28** (catalog $0.20 — dynamic pricing; a full ~15s script may cost more, watch the $0.80/video alert). Routing table `ugc_lipsync/standard` repointed. Premium `kling-v1-avatar-pro` left un-wired (different params, no `resolution`, completion-unverified).

---

**2026-07-24 (DEV-30) — product B-roll: `kling-v2.1-standard-i2v` (Image-to-Video).** Live input schema (`GET /api/v1/models/kling-v2.1-standard-i2v` → `input_schema.schemas.input_data`):
- Request body `{ prompt, image_url, aspect_ratio?, duration? }`. **`prompt` (motion description) AND `image_url` are both required** (unlike lip-sync, where prompt is optional). `aspect_ratio` enum `16:9`/`9:16`/`1:1` (default `16:9`); `duration` int enum `5`/`10`s (default `5`, step 5). Output `{ video }` → the gateway normalizes to `outputs:[videoUrl]` like the image models.
- **Completion-verified end-to-end 2026-07-24** (real submit→poll through `MuapiService`, the model's own schema-example image as the product photo): completes in **74.9s** → a real 9.5 MB `video/mp4`, cost **$0.225 exactly** — the catalog estimate matched the billed cost (no dynamic-pricing surprise, unlike infinitetalk's $0.20→$0.28). So this is the first Phase-3 video slug whose real cost == its routing-table estimate.
- Wired in `src/lib/ugc-broll.ts` by **reusing the existing `video_animate` Asset Type** (already routed standard `kling-v2.1-standard-i2v` / premium `kling-v2.1-pro-i2v`) — no routing-table change. Premium (`kling-v2.1-pro-i2v`) shares this exact schema and is reachable via `quality:"premium"`, but only standard was completion-probed this slice.

---

**2026-07-25 (DEV-32) — video assembly: `video-combiner` (Video-to-Video). Schema verified, completion BLOCKED by a sustained capacity outage.** Live input schema (`GET /api/v1/models/video-combiner`):
- Request body `{ videos_list, aspect_ratio? }`. `videos_list` = required ordered **array** of clip URLs (each 5–60s, `maxItems: 20`). `aspect_ratio` enum `auto`/`16:9`/`9:16`/`1:1`/`4:3`/`3:4`/`21:9`/`9:21` (default `auto` = first clip's ratio). Output `{ video }` → gateway normalizes to `outputs:[videoUrl]`. Cost $0.05, `dynamic_pricing=true`.
- Wired as a **new `video_assemble` Asset Type** in the routing table (not a `video_animate` reuse — assembly is a genuinely new video→video op, unlike B-roll which animates an image). Service `src/lib/ugc-assembly.ts` = generic ordered-clip stitcher (2–20 http(s) clips), mirrors `ugc-broll.ts`.
- **Completion NOT verified — provider outage.** A real 2-clip submit→poll probe (`scripts/qa-assembly-probe.mjs`, kept uncommitted) hit `503 {"detail":"The video combiner is currently at capacity. Please try again in a few minutes."}` on **60 consecutive submits over ~20h** (spanning laptop sleep/wake). This is NOT a code/key/schema fault: an empty-body POST returns `422` (endpoint validates fine, matches a known-live control), and the 503 is a service-level capacity signal independent of request content. `video-combiner` is the **only** multi-clip concatenation model in the catalog (the other ~48 "Video to Video" models are edit/extend/upscale/watermark/lip-sync — no combiner alternative to swap to). Human-approved (2026-07-25) to submit DEV-32 for review with the completion probe **deferred** — re-run the probe when capacity returns before final sign-off. **Three-axis rule reminder:** this slice passes catalog-presence + endpoint-liveness but NOT completion — the gate that has repeatedly caught broken models (ideogram, elevenlabs, creatify). Here the miss is force-majeure capacity, not a model defect, but it is still unproven until the probe completes to a real MP4.

---

**2026-07-26 (DEV-31) — multi-format reframe: `autocrop` (Video-to-Video). Schema + completion BOTH verified.** Live input schema (`GET /api/v1/models/autocrop`):
- Request body `{ video_url, start_time, end_time, aspect_ratio? }`. `video_url` = required source clip; `start_time`/`end_time` = required int-second crop window (defaults 0 / 60, range 0–86400, `end > start`); `aspect_ratio` enum `9:16`/`16:9`/`1:1`/`4:5`/`4:3`/`3:4` (default `9:16`). Output `{ video }` → `outputs[0]`. Cost $0.05, `dynamic_pricing=true`.
- Wired as a **new `video_reframe` Asset Type** (standard `autocrop`, no premium) — NOT a reuse of the image `reframe` route (`ideogram-v3-reframe`, DEV-19 product photos); `autocrop` is a genuinely new video→video op, mirroring the DEV-32 `video_assemble` decision. Service `src/lib/ugc-reframe.ts` = single-reframe primitive `reframeVideo` + `reframeToFormats` fan-out (default 9:16/1:1/16:9). Plan-corrected off `luma-flash-reframe` ($0.35, 7×, `video_url`-only, no segment window) which stays the manual premium fallback, un-wired.
- **Completion-verified end-to-end 2026-07-26**: real source MP4 (9:16, 0–5s crop) → real `video/mp4` (2.6 MB, Range-verified), ~32s inference, **$0.05 exactly** (== catalog estimate, no dynamic-pricing surprise). Unlike video-combiner, `autocrop` had capacity available — completed first try.
- ⚠️ **Two gotchas surfaced:**
  1. **Source URL must be fetchable by Muapi.** autocrop's *own* schema-example source (`storage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4`) returns **403 to Muapi's downloader** → job `status:failed, error:"Download failed: 403 …"`. Use a Muapi-fetchable clip (their CloudFront webassets, or an R2/CDN URL). Not a code fault — the pipeline feeds autocrop the DEV-32 master (an R2/CDN URL), so this won't bite in production, but any probe needs a reachable source.
  2. **Failed jobs wrap the record under `detail`** (`{ detail: { id, status:"failed", error } }`), so a top-level `resultBody.status` read sees `undefined`. **The COMPLETED shape is top-level** (`{ status:"completed", outputs:[url], … }`) — so the production `MuapiService.generate` (which reads top-level `status`/`outputs`, `muapi.ts:214`) parses SUCCESS correctly. But on a *failed* autocrop it would see `undefined` and poll until `pollTimeoutMs` then throw "timed out" rather than surfacing the real error. This is a general `muapi.ts` limitation (all models, failure path), logged as tech debt — not a DEV-31 blocker.

---

**2026-07-28 (DEV-34) — social account disconnect endpoint verified live.** DEV-35 verified `connect-url` + `GET /social/ext/accounts`; DEV-34 adds the **disconnect** contract, liveness-probed before building (`scripts/qa-social-disconnect-probe.mjs`, kept uncommitted):
- **`DELETE /social/ext/accounts/{id}`** → for a bogus id returns **`404 {"detail":"Account not found"}`** (a *resource-specific* error), proving the route exists and only the id is missing. `POST /social/ext/accounts/{id}/disconnect` is ALSO live (same resource-specific 404). A genuinely absent route returns generic `404 {"detail":"Not Found"}` (as `POST /social/ext/disconnect` did) — that's how to tell "route exists, id missing" from "route missing".
- Wired the **DELETE** form as the disconnect primitive (`social-publishing.ts → DefaultSocialMuapiClient.disconnectAccount`): `DELETE /social/ext/accounts/{id}?external_user_id={clerkId}`. **404 is treated as idempotent success** (already gone on Muapi's side → we still drop our local row); any other non-2xx throws and the local row is kept, so Muapi + our DB never silently drift. Live end-to-end (real connected account) is human-gated QA, same as connect.
- **Rename is NOT a Muapi op** — you can't rename a real platform handle via API, so DEV-34's "rename" is a **local nickname** (`social_accounts.nickname`, nullable). No Muapi endpoint involved; `syncAccounts` never writes `nickname`, so it survives re-sync.

---

**2026-07-29 (DEV-36) — publish is a MODEL SLUG, not a bespoke social route.** Liveness+schema-probed before building (`scripts/qa-publish-probe.mjs`, kept uncommitted). The plan's `POST /{platform}-publish` is real, but the shape is important:
- **`youtube-publish` is a Muapi model slug** at `POST /api/v1/youtube-publish` (price **$0.01**), so it uses the **exact same submit→poll async contract as every generation**: submit → `{ request_id }`, poll `GET /api/v1/predictions/{id}/result` → `{ status:"completed", outputs, cost }`. `GET /api/v1/models/youtube-publish` returns the input schema (same technique as DEV-28+). The alternate path guesses all 404: `social/youtube/publish` → generic `404 {"detail":"Not Found"}`; `youtube_publish`/`social-youtube-publish` → `404 MODEL_NOT_FOUND`. So the slug form is `{platform}-publish` (hyphen), addressed like any model.
- **`youtube-publish` input schema (verified live):** required `account_id` (**integer**), `media_url` (string), `title` (string); optional `description` (string), `tags` (array), `privacy` (enum `public`/`private`/`unlisted`), `category_id` (enum of {label,value} pairs), `made_for_kids` (boolean). ⚠️ `account_id` is an **integer** but our `social_accounts.muapiAccountId` is text — `buildYouTubePublishParams` coerces with `Number()` + `Number.isInteger` (fail-loud). An empty-body POST 422s listing the 3 missing required fields (endpoint live, spends nothing).
- Wired in `social-publishing.ts`: `DefaultSocialMuapiClient.submitPublish`/`pollPublish` (a **separate `PublishMuapiClient` seam** from the connect/disconnect `SocialMuapiClient`, so those fakes don't grow publish methods). Jobs advance on read (`listPublishJobs` polls each `processing` job once), never inline (publish is 1–5 min).
- **Completion axis NOT verified** — a real publish needs a real OAuth'd YouTube channel (human-gated QA), and it actually posts a public video + bills $0.01, so it can't be probed headlessly. The submit/poll wiring is proven; the completed-result shape (we read `outputs[0]` as the post URL, falling back to `result_url`/`url`) is the one unproven guess — confirm the `resultUrl` field on the first real publish. Three-axis rule: catalog-presence ✅ + endpoint-liveness ✅ + completion ⏳ (human-gated).

---

**2026-07-30 (DEV-37) — TikTok publish (`tiktok-publish`), same slug pattern, different shape + $0.02.** Liveness+schema-probed before building (`scripts/qa-tiktok-publish-probe.mjs`, kept uncommitted):
- **`tiktok-publish` is a Muapi model slug** at `POST /api/v1/tiktok-publish`, price **$0.02** (⚠️ **double** youtube-publish's $0.01 — the plan's "$0.01 each" is YouTube-only). Same submit→poll async contract as youtube-publish/every generation. Alternates 404: `tiktok_publish`/`social-tiktok-publish` → `404 MODEL_NOT_FOUND`, `social/tiktok/publish` → generic `404 Not Found`. So the slug form is confirmed `{platform}-publish` (hyphen) across platforms.
- **`tiktok-publish` input schema (verified live):** required `account_id` (**integer**), `media_url` (string, "Public URL of the video to upload"); optional `title` (string — "Video caption (max 150 chars)", **optional** unlike YouTube's required title), `privacy_level` (enum `PUBLIC_TO_EVERYONE`/`MUTUAL_FOLLOW_FRIENDS`/`FOLLOWER_OF_CREATOR`/`SELF_ONLY`), `allow_comment`/`allow_duet`/`allow_stitch` (boolean), `is_ai_generated` (boolean — "Mark as AI-generated."). Empty-body POST → `422` listing the 2 missing required fields (`account_id`, `media_url`) — endpoint live, spends nothing.
- Wired in `social-publishing.ts`: `PublishJobParams` split into a per-platform union (`YouTubePublishParams | TikTokPublishParams` in schema.ts); new pure `buildTikTokPublishParams` + `resolvePrivacyLevel`; `publishAssetKit` now dispatches by `account.platform` (youtube+tiktok; instagram throws "not available yet" → DEV-38). Submit/poll/list/retry were already platform-generic (`submitPublish(platform, params)` → `POST /{platform}-publish`) — **no client change needed**. `is_ai_generated` defaults **true** (product is entirely AI-generated content; TikTok requires the disclosure); comment/duet/stitch default true.
- **Completion axis NOT verified** — needs a real OAuth'd TikTok account + real $0.02 post (human-gated QA). ⚠️ **TikTok unaudited/sandbox apps may only permit `SELF_ONLY`** until content-posting is approved — a live-publish caveat to check on the first real post, not a validation issue. Three-axis rule: catalog/liveness ✅ + schema ✅ + completion ⏳ (human-gated).

**2026-08-02 (DEV-38) — Instagram publish (`instagram-publish`), same slug pattern, $0.02.** Liveness+schema-probed before building (`scripts/qa-instagram-publish-probe.mjs`, kept uncommitted):
- **`instagram-publish` is a Muapi model slug** at `POST /api/v1/instagram-publish`, price **$0.02** (same as TikTok, 2× YouTube). Same submit→poll async contract. Alternates 404: `instagram_publish`/`social-instagram-publish`/`instagram-reels-publish` → `404 MODEL_NOT_FOUND`, `social/instagram/publish` → generic `404 Not Found`. Confirms the `{platform}-publish` (hyphen) slug form across all three platforms.
- **`instagram-publish` input schema (verified live):** required `account_id` (**integer**), `media_url` (string — "Public URL of the video or image"); optional `caption` (string — "Post caption (supports hashtags)"; **its own field**, not `title` like YouTube/TikTok), `placement` (enum `reels`/`stories`/`timeline` — "Where to publish: Reels feed, Stories, or main timeline"), `share_to_feed` (boolean — "Show the Reel on the main feed as well as the Reels tab"). Empty-body POST → `422` listing the 2 missing required fields (`account_id`, `media_url`) — endpoint live, spends nothing.
- Wired in `social-publishing.ts`: added `InstagramPublishParams` to the union (schema.ts, jsonb-type only, no migration); new pure `buildInstagramPublishParams` + `resolvePlacement`; `buildPublishParams` dispatcher now handles all three platforms (the "not available yet" throw is gone — replaced with an exhaustiveness `Unsupported platform` guard). Submit/poll/list/retry stay platform-generic. The shared request `title` maps to `caption` (like TikTok); `placement` defaults **reels** (video-native), `share_to_feed` defaults **true**. Route's superset `title` cap raised 150→2200 so IG's longer caption passes (per-platform builders still enforce YouTube 100 / TikTok 150 / IG 2200).
- **Completion axis NOT verified** — needs a real OAuth'd Instagram **Business/Creator** account + real $0.02 post (human-gated QA). Three-axis rule: catalog/liveness ✅ + schema ✅ + completion ⏳ (human-gated).
