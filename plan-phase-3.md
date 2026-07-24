# Phase 3 — UGC Video Pipeline ⭐

**Status**: Not started
**Goal**: Generate UGC-style talking head video ads for under $1 each. Agent-driven — writes scripts, picks presenters, assembles everything. User just reviews and confirms.

> **Depends on Phase 2.5**: the presenter library slice must be done first — the lip-sync step needs presenter portraits to exist.
>
> **Model corrections (2026-07-10, live-POST-verified — not just catalog presence)**: the original model list busted the <$1 budget. `luma-flash-reframe` is $0.35 *per reframe* (≈$0.70/video for two extra formats) — replaced with `autocrop` ($0.05/reframe, AI subject tracking). `video-combiner` ($0.05) replaces server-side FFmpeg as the primary assembly path (kills the FFmpeg-on-Replit risk); FFmpeg stays as fallback. Voiceover was `elevenlabs-text-to-dialogue-v3` ($0.10). **⚠️ Corrected 2026-07-24 (DEV-28):** elevenlabs FAILED generation 7/7 ("internal error") despite being catalog-live; a Text-to-Audio re-audit found **`gemini-3-1-flash-tts`** completes reliably to a real MP3 at **~$0.003 actual** (catalog est. $0.035) — cheaper *and* working. Swapped in (human-approved). The $0.01 `mmaudio-v2-text-to-audio` fallback is still a **dead endpoint** (404). Per-video total drops to ≈$0.42. Every model here was live-POST-verified — see `.agents/memory/muapi-api-contract.md` + `muapi-dead-catalog-endpoints.md`.

## Slices
- `STU-23`: Script generation (GPT-4.1-mini → 15-sec product review scripts)
- `STU-24`: Voiceover generation (**`gemini-3-1-flash-tts`** via Muapi — swapped 2026-07-24 off the broken `elevenlabs-text-to-dialogue-v3`; the $0.01 mmaudio fallback is a dead endpoint)
- `STU-25`: Talking head / lip-sync video (**`infinitetalk-image-to-video`** via Muapi — swapped 2026-07-24 off `creatify-lipsync`, which needs a presenter *video* (`video_url`), not the static portrait the presenter library produces)
- `STU-26`: Product B-roll animation (kling-v2.1-standard-i2v via Muapi)
- `STU-27`: Video assembly (video-combiner via Muapi; server-side FFmpeg as fallback)
- `STU-28`: Multi-format reframe (autocrop: 9:16, 1:1, 16:9)
- `STU-29`: UGC review UI (propose → review script + presenter → confirm → progress → result)

## Cost budget per video (live-POST-verified 2026-07-10)
| Step | Model | Cost |
|------|-------|------|
| Script | GPT-4.1-mini | ~$0.001 |
| Voiceover | gemini-3-1-flash-tts (was elevenlabs, broken) | ~$0.003 |
| Talking head | infinitetalk-image-to-video (was creatify-lipsync, needs video not photo) | ~$0.28 |
| B-roll | kling-v2.1-standard-i2v | $0.225 |
| Assembly | video-combiner | $0.05 |
| Reframe ×2 | autocrop | $0.10 |
| **Total** | | **≈$0.66** ✅ |

All models are `dynamic_pricing=true` — real cost comes from the `X-MuAPI-Cost-USD` header per request; the table is the base estimate.

## Files to touch
```
src/lib/ugc-pipeline.ts, src/lib/ffmpeg.ts (fallback only),
src/app/dashboard/ugc/actions.ts (Server Actions — not /api routes),
src/app/dashboard/ugc/, src/components/ugc/
```

## Steps
1. Script: retrieve product + brand tone via RAG → GPT-4.1-mini → 15-sec conversational UGC script
2. Presenter: agent pre-selects a presenter from the Phase 2.5 presenter library, matched on targetAudienceTags. User can change.
3. Voiceover: script → `gemini-3-1-flash-tts` → audio (MP3) URL. (Swapped 2026-07-24 off the broken `elevenlabs-text-to-dialogue-v3`; single-speaker Gemini TTS, ~$0.003, completion-verified end-to-end.)
4. Talking head: presenter photo + voiceover → **`infinitetalk-image-to-video`** (image+audio) → lip-synced video. (Swapped 2026-07-24 off `creatify-lipsync`: the live schema showed it — and every $0.04 lip-sync model — requires a presenter *video* (`video_url`), so it can't animate a static portrait. `infinitetalk-image-to-video` takes `image_url`+`audio_url`, ~$0.28, completion-verified end-to-end.)
5. B-roll: product photo → kling-v2.1-standard-i2v with motion prompt → animated clip
6. Assembly: video-combiner (Muapi) — talking head (0-8s) → B-roll (8-12s) → talking head CTA (12-15s). Verify transition quality; if unacceptable, fall back to server-side FFmpeg (original plan).
7. Reframe: assembled video → autocrop → 9:16 + 1:1 + 16:9
8. Upload all 3 variants to R2, create Asset Kit
9. UI: script review (editable) → presenter (changeable) → confirm ("3 credits") → progress with friendly labels → video player with platform tabs. No model names, no costs.

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
| video-combiner transition quality unknown | Test with real clips first; FFmpeg fallback documented in step 6 |
| autocrop subject tracking on talking heads | Test with a lip-sync clip before committing; luma-flash-reframe ($0.35) is the premium fallback if tracking fails |
| ~~ElevenLabs is the only affordable live TTS~~ (RESOLVED 2026-07-24) | elevenlabs failed 7/7 in practice; re-audited the Text-to-Audio catalog → `gemini-3-1-flash-tts` completes at ~$0.003. Gemini voice quality vs elevenlabs is a soft downgrade to spot-check; `minimax-speech-2.6-turbo` ($0.65, simple prompt+voice) is the premium fallback if Gemini disappoints. |
| Pipeline 2-5 min | Step-by-step progress with friendly labels |
| Script quality | Industry-specific templates; user can always edit before confirming |
| Dynamic pricing variance | Record real X-MuAPI-Cost-USD per step in pipeline logs; alert if a video exceeds $0.80 |
