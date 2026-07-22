---
name: Carousel publishing is a Phase-4 dependency flag
description: Before Phase 4 promises scheduled carousel publishing, verify Muapi's Instagram publish endpoint actually accepts multi-image carousel posts.
---

STU-C5 (DEV-67) ships **carousel Asset Kits** — one kit holding an ordered `media` array of image frames (`asset_kits.media`, jsonb), assembled by `src/lib/carousel.ts` and created via `POST /api/carousel`. Generation, storage, gallery display, and ordering are all handled.

**What is NOT verified (and must be before Phase 4):** that Muapi's social-publishing endpoint can publish a multi-image Instagram carousel in one post. Instagram's own API supports carousels (2–10 items), which is why `CAROUSEL_MAX_FRAMES = 10`, but Muapi is the gateway and its publish contract for carousels was **not** confirmed during STU-C5 (out of scope — publishing is Phase 4).

**Why this matters:** the Content Plan UI can now propose and generate carousels. If Phase 4's publishing flow promises "schedule this carousel to Instagram" before confirming Muapi accepts a multi-image payload, we repeat the DEV-13/STU-C1 class of bug — shipping a promise the API can't keep, failing only when a real user hits publish.

**How to apply:** In the first Phase-4 publishing slice, before wiring carousel publish, check Muapi's publish API reference (and/or a live test) for multi-image/carousel support. If Muapi only accepts a single media URL per post, either (a) publish only the cover frame with a note, or (b) fall back to N separate posts — do **not** silently publish just frame 0 as if it were the whole carousel. See also [[muapi-api-contract.md]].
