# Phase 3 — UGC Video Pipeline ⭐

**Status**: Not started
**Goal**: Generate UGC-style talking head video ads for under $1 each. Agent-driven — writes scripts, picks presenters, assembles everything. User just reviews and confirms.

> **Depends on Phase 2.5**: the presenter library slice must be done first — the lip-sync step needs presenter portraits to exist.
>
> **⚠️ Assembly path reversed (2026-08-09, human-directed — DEV-32 re-run)**: **server-side FFmpeg is now the PRIMARY assembly path and `video-combiner` is the fallback.** This reverts the 2026-07-10 correction below and restores what DEV-32's Linear title said all along. Rationale: assembly becomes free (no paid model call), it stops depending on a model whose completion was never verified (`video-combiner` sat at 503 "at capacity" for ~20h during the original build and has never produced a real output), and clip normalisation comes under our control. Accepted cost: the FFmpeg-on-Replit risk the 2026-07-10 correction was written to avoid is back — see the Risks table. FFmpeg ships via the `ffmpeg-static` / `ffprobe-static` npm packages (no Nix module, works locally and on Replit alike); `ffmpeg-static` is listed in `pnpm-workspace.yaml → onlyBuiltDependencies` because its binary arrives in a postinstall script.
>
> **Model corrections (2026-07-10, live-POST-verified — not just catalog presence)**: the original model list busted the <$1 budget. `luma-flash-reframe` is $0.35 *per reframe* (≈$0.70/video for two extra formats) — replaced with `autocrop` ($0.05/reframe, AI subject tracking). ~~`video-combiner` ($0.05) replaces server-side FFmpeg as the primary assembly path (kills the FFmpeg-on-Replit risk); FFmpeg stays as fallback.~~ **(Reversed 2026-08-09 — see the note above.)** Voiceover was `elevenlabs-text-to-dialogue-v3` ($0.10). **⚠️ Corrected 2026-07-24 (DEV-28):** elevenlabs FAILED generation 7/7 ("internal error") despite being catalog-live; a Text-to-Audio re-audit found **`gemini-3-1-flash-tts`** completes reliably to a real MP3 at **~$0.003 actual** (catalog est. $0.035) — cheaper *and* working. Swapped in (human-approved). The $0.01 `mmaudio-v2-text-to-audio` fallback is still a **dead endpoint** (404). Per-video total drops to ≈$0.42. Every model here was live-POST-verified — see `.agents/memory/muapi-api-contract.md` + `muapi-dead-catalog-endpoints.md`.

## Slices
- `STU-23`: Script generation (GPT-4.1-mini → 15-sec product review scripts)
- `STU-24`: Voiceover generation (**`gemini-3-1-flash-tts`** via Muapi — swapped 2026-07-24 off the broken `elevenlabs-text-to-dialogue-v3`; the $0.01 mmaudio fallback is a dead endpoint)
- `STU-25`: Talking head / lip-sync video (**`infinitetalk-image-to-video`** via Muapi — swapped 2026-07-24 off `creatify-lipsync`, which needs a presenter *video* (`video_url`), not the static portrait the presenter library produces)
- `STU-26`: Product B-roll animation (kling-v2.1-standard-i2v via Muapi)
- `STU-27`: Video assembly (**server-side FFmpeg primary**; `video-combiner` via Muapi as fallback — reversed 2026-08-09)
- `STU-28`: Multi-format reframe (autocrop: 9:16, 1:1, 16:9)
- `STU-29`: UGC review UI (propose → review script + presenter → confirm → progress → result)

## Cost budget per video (live-POST-verified 2026-07-10)
| Step | Model | Cost |
|------|-------|------|
| Script | GPT-4.1-mini | ~$0.001 |
| Voiceover | gemini-3-1-flash-tts (was elevenlabs, broken) | ~$0.003 |
| Talking head | infinitetalk-image-to-video (was creatify-lipsync, needs video not photo) | ~$0.28 |
| B-roll | kling-v2.1-standard-i2v | $0.225 (completion-verified 2026-07-24, exact) |
| Assembly | **server-side FFmpeg** | **$0.00** (own CPU, no model call — primary since 2026-08-09; `video-combiner` $0.05 only on fallback) |
| Reframe ×2 | autocrop | $0.10 ($0.05/reframe, completion-verified exact 2026-07-26) |
| **Total** | | **≈$0.61** ✅ (was ≈$0.66; ≈$0.66 again whenever assembly falls back) |

All models are `dynamic_pricing=true` — real cost comes from the `X-MuAPI-Cost-USD` header per request; the table is the base estimate.

## Files to touch
```
src/lib/ugc-pipeline.ts, src/lib/ffmpeg.ts (PRIMARY assembly path since 2026-08-09),
src/app/dashboard/ugc/actions.ts (Server Actions — not /api routes),
src/app/dashboard/ugc/, src/components/ugc/
```

## Steps
1. Script: retrieve product + brand tone via RAG → GPT-4.1-mini → 15-sec conversational UGC script
2. Presenter: agent pre-selects a presenter from the Phase 2.5 presenter library, matched on targetAudienceTags. User can change.
3. Voiceover: script → `gemini-3-1-flash-tts` → audio (MP3) URL. (Swapped 2026-07-24 off the broken `elevenlabs-text-to-dialogue-v3`; single-speaker Gemini TTS, ~$0.003, completion-verified end-to-end.)
4. Talking head: presenter photo + voiceover → **`infinitetalk-image-to-video`** (image+audio) → lip-synced video. (Swapped 2026-07-24 off `creatify-lipsync`: the live schema showed it — and every $0.04 lip-sync model — requires a presenter *video* (`video_url`), so it can't animate a static portrait. `infinitetalk-image-to-video` takes `image_url`+`audio_url`, ~$0.28, completion-verified end-to-end.)
5. B-roll: product photo → kling-v2.1-standard-i2v with motion prompt → animated clip. (DEV-30, `src/lib/ugc-broll.ts`. Reuses the existing `video_animate` Asset Type — already routed to this model — rather than a new type. Request `{ prompt, image_url, aspect_ratio (16:9/9:16/1:1, default 16:9), duration (5/10s, default 5) }`; blank prompt → `DEFAULT_MOTION_PROMPT`. **Completion-verified end-to-end 2026-07-24**: real product image → real MP4, ~75s, **$0.225** exactly (no dynamic-pricing surprise).)
6. Assembly: **server-side FFmpeg** — talking head (0-8s) → B-roll (8-12s) → talking head CTA (12-15s); `video-combiner` (Muapi) is the fallback. (DEV-32, `src/lib/ffmpeg.ts` + `src/lib/ugc-assembly.ts` + the `video_assemble` Asset Type.

   **Re-run 2026-08-09 (human-directed): path order reversed.** The original slice built only the `video-combiner` half and explicitly deferred FFmpeg ("FFmpeg fallback intentionally NOT built this slice"), so this re-run is a from-scratch build of the FFmpeg path plus a primary/fallback wrapper — not a reordering of two existing paths.

   **FFmpeg path** (`src/lib/ffmpeg.ts`, new): downloads the ordered clips → probes each with `ffprobe` → normalises every clip (`scale` → `pad` → `setsar=1` → `fps`) and concatenates through the `concat` **filter** → re-encodes to H.264/AAC MP4 (`yuv420p`, `+faststart`) → uploads the master to R2 under `ugc-assembly/{userId}/…`, which is the URL the DEV-31 reframe step fetches. **$0.00** — no model call. Two decisions worth knowing: (a) the cheap `-f concat` **demuxer** is deliberately not used, because it requires bit-identical stream parameters and the clips come from *different* models (`infinitetalk-image-to-video` vs `kling-v2.1-standard-i2v`) — it corrupts silently when they differ; (b) each clip is probed because `concat=a=1` fails outright on an input with no audio stream, and B-roll from an i2v model normally *is* silent while the talking head is not — silent clips get a matching `anullsrc` track. **Completion-verified 2026-08-09** against deliberately mismatched fixtures (1920×1080@24 with audio + 640×360@30 silent → one 1280×720@30 H.264/AAC master, 5.03s = 3+2), via `scripts/qa-ffmpeg-assembly-probe.mjs`.

   **Fallback** = the original `video-combiner` code, behaviourally unchanged. **Live schema verified** `GET /api/v1/models/video-combiner` 2026-07-25: `{ videos_list:[url,…] (2–20 clips, each 5–60s), aspect_ratio? (enum incl. `auto` default) }` → `{ video }` normalized to `outputs[0]`, $0.05 dynamic. It fires on **any** FFmpeg failure — missing binary, non-zero exit, clip download failure, timeout, or a failed upload of the encoded master (a master we cannot hand to the reframe step is a failed path whatever the cause). Caller errors (too few clips, unsupported aspect ratio) are validated up front and throw instead, since they would fail identically on both paths. The result carries `path: "ffmpeg" | "video-combiner"` + a `fallbackReason` so QA can tell which ran. ⚠️ **`video-combiner` completion is still NOT verified** — it returned `503 "at capacity"` on 60 submits over ~20h during the original build and has never produced a real output; it is now only reached when FFmpeg has already failed, so the untested path is strictly less exposed than before, but it is still untested.

   **One genuine behavioural difference:** `aspect_ratio: "auto"` means "inherit the first clip's ratio" to `video-combiner`; FFmpeg has no such concept without probing, so `auto` resolves to 16:9 (1280×720) — the documented UGC master orientation both upstream clips already default to. Every other ratio maps to fixed even-numbered dimensions in `ASPECT_DIMENSIONS`.)
7. Reframe: assembled video → autocrop → 9:16 + 1:1 + 16:9. (DEV-31, `src/lib/ugc-reframe.ts` + new `video_reframe` Asset Type. **Live schema verified** `GET /api/v1/models/autocrop` 2026-07-26: `{ video_url, start_time, end_time, aspect_ratio? (enum 9:16/16:9/1:1/4:5/4:3/3:4, default 9:16) }` → `{ video }` normalized to `outputs[0]`, $0.05 dynamic. Service = single-reframe primitive `reframeVideo` + a `reframeToFormats` fan-out that produces the default 9:16/1:1/16:9 set + summed cost; *which* formats + R2 persistence are the pipeline/DEV-33 orchestrator's job. New Asset Type — NOT the image `reframe` route (`ideogram-v3-reframe`, DEV-19 product photos): `autocrop` is a video→video op, mirroring how DEV-32 added `video_assemble`. **Completion-verified end-to-end 2026-07-26**: real source MP4 → real 9:16 `video/mp4` (2.6 MB), ~32s inference, **$0.05 exactly** (== estimate, no dynamic-pricing surprise, like B-roll). The success poll body is top-level `{status:"completed", outputs}` — parses through the production `MuapiService`. `luma-flash-reframe` ($0.35, 7×, `video_url` only, no segment window) stays the documented manual premium fallback if subject tracking fails — NOT wired this slice.)
8. Upload all 3 variants to R2, create Asset Kit. (DEV-33, `src/lib/ugc-pipeline.ts` `finalize` step: downloads the 3 reframed variants → R2 → saves ONE multi-format video Asset Kit whose ordered `media[]` carries all three formats (the Carousel `media[]` pattern; cover mirrors the first). `asset_kits.media[]` gained an optional `aspectRatio` so the Result tabs know which variant is which.)
9. UI: script review (editable) → presenter (changeable) → confirm ("3 credits") → progress with friendly labels → video player with platform tabs. No model names, no costs. (DEV-33, `/plan/ugc` + `src/components/ugc/*` + `/api/ugc` routes. **Built + static-verified 2026-07-27**; see the orchestration + persistence model in step 8 and the **UGC Job** / **UGC Review UI** CONTEXT terms. Backed by a new `ugc_jobs` table (per-step status + intermediate output URLs → resume-from-failed-step). Decisions: `/api` routes not Server Actions (matches the codebase + STU-C3 QA — the CLAUDE.md hard rule is stale here); Publish/Calendar CTAs disabled "coming soon" (connected accounts + calendar are Phase 4/5). ⚠️ **Live end-to-end render is carryover-gated**: placeholder presenter SVGs (need real R2 portraits) + DEV-32 assembly still 503-unverified. The wizard states + `/api/ugc` surface are verified (unauthed 401 JSON, clean sign-in redirect, `pnpm build` green); a real rendered video awaits the two carryovers.)

## Acceptance Criteria
- UGC initiation → agent proposes script + pre-selects presenter, no user input needed
- Credit display as "X left" — no dollar amounts, no model names
- Any pipeline step fails → friendly error message + retry from that step
- Completed video → lip sync visually aligned with audio
- Total internal cost recorded in generations table (hidden from user)

## Out of scope
- Custom presenter upload (stock only), multi-language voiceover, music/background audio

## Risks
| Risk | Mitigation |
|------|-----------|
| **FFmpeg-on-Replit (RE-OPENED 2026-08-09)** — the encode is CPU-bound and runs inside a request on a `deploymentTarget = "autoscale"` deployment, unlike the submit-then-poll Muapi call it replaced (whose wait is I/O and survives a request boundary). A long or cold-start-delayed encode can exceed the request window. | Binary ships via `ffmpeg-static` (no Nix module, so local dev exercises the same path as Replit). `-preset veryfast`, and one ffmpeg invocation is capped at `DEFAULT_TIMEOUT_MS` (240s) so a hung process still leaves time to reach the fallback rather than timing out with nothing. `video-combiner` fallback catches whatever gets through. **Not yet measured on real Replit autoscale with real ~15s clips — that is the outstanding QA item.** |
| ~~video-combiner transition quality unknown~~ (demoted 2026-08-09) | No longer on the happy path — FFmpeg is primary. `video-combiner` completion remains unverified, but is now only reached after FFmpeg has already failed. |
| autocrop subject tracking on talking heads | Test with a lip-sync clip before committing; luma-flash-reframe ($0.35) is the premium fallback if tracking fails |
| ~~ElevenLabs is the only affordable live TTS~~ (RESOLVED 2026-07-24) | elevenlabs failed 7/7 in practice; re-audited the Text-to-Audio catalog → `gemini-3-1-flash-tts` completes at ~$0.003. Gemini voice quality vs elevenlabs is a soft downgrade to spot-check; `minimax-speech-2.6-turbo` ($0.65, simple prompt+voice) is the premium fallback if Gemini disappoints. |
| Pipeline 2-5 min | Step-by-step progress with friendly labels |
| Script quality | Industry-specific templates; user can always edit before confirming |
| Dynamic pricing variance | Record real X-MuAPI-Cost-USD per step in pipeline logs; alert if a video exceeds $0.80 |
