# Phase 3 — UGC Video Pipeline ⭐

**Status**: Not started
**Goal**: Generate UGC-style talking head video ads for under $1 each. Agent-driven — writes scripts, picks presenters, assembles everything. User just reviews and confirms.

> **Depends on Phase 2.5**: the presenter library slice must be done first — the lip-sync step needs presenter portraits to exist.
>
> **Model corrections (2026-07-10, live-POST-verified — not just catalog presence)**: the original model list busted the <$1 budget. `luma-flash-reframe` is $0.35 *per reframe* (≈$0.70/video for two extra formats) — replaced with `autocrop` ($0.05/reframe, AI subject tracking). `video-combiner` ($0.05) replaces server-side FFmpeg as the primary assembly path (kills the FFmpeg-on-Replit risk); FFmpeg stays as fallback. Voiceover is `elevenlabs-text-to-dialogue-v3` ($0.10) — voice realism is the make-or-break of the UGC format, and it's also the cheapest *live* natural-speech model (the $0.01 `mmaudio-v2-text-to-audio` originally listed as a budget fallback is a **dead endpoint** — 404 on generation — and the next live TTS jumps to $0.65, so there is no cheaper fallback; elevenlabs is the sole voiceover model). Per-video total: ≈$0.52 (vs ≈$0.98 with the original list). Every model here was live-POST-verified — see `.agents/memory/muapi-dead-catalog-endpoints.md`.

## Slices
- `STU-23`: Script generation (GPT-4.1-mini → 15-sec product review scripts)
- `STU-24`: Voiceover generation (elevenlabs-text-to-dialogue-v3 via Muapi — sole voiceover model; the $0.01 mmaudio fallback is a dead endpoint)
- `STU-25`: Talking head / lip-sync video (creatify-lipsync via Muapi)
- `STU-26`: Product B-roll animation (kling-v2.1-standard-i2v via Muapi)
- `STU-27`: Video assembly (video-combiner via Muapi; server-side FFmpeg as fallback)
- `STU-28`: Multi-format reframe (autocrop: 9:16, 1:1, 16:9)
- `STU-29`: UGC review UI (propose → review script + presenter → confirm → progress → result)

## Cost budget per video (live-POST-verified 2026-07-10)
| Step | Model | Cost |
|------|-------|------|
| Script | GPT-4.1-mini | ~$0.001 |
| Voiceover | elevenlabs-text-to-dialogue-v3 | $0.10 |
| Talking head | creatify-lipsync | $0.04 |
| B-roll | kling-v2.1-standard-i2v | $0.225 |
| Assembly | video-combiner | $0.05 |
| Reframe ×2 | autocrop | $0.10 |
| **Total** | | **≈$0.52** ✅ |

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
3. Voiceover: script → elevenlabs-text-to-dialogue-v3 → audio file URL. (Sole voiceover model — the cheap mmaudio fallback is a dead endpoint; next live TTS is $0.65, so no cheaper option.)
4. Talking head: presenter photo + voiceover → creatify-lipsync → lip-synced video
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
| ElevenLabs is the only affordable live TTS | mmaudio ($0.01) is dead; next live option is $0.65. If elevenlabs quality/cost disappoints, re-audit the Text-to-Audio catalog for newly-live cheap models before swapping |
| Pipeline 2-5 min | Step-by-step progress with friendly labels |
| Script quality | Industry-specific templates; user can always edit before confirming |
| Dynamic pricing variance | Record real X-MuAPI-Cost-USD per step in pipeline logs; alert if a video exceeds $0.80 |
