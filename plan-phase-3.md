# Phase 3 — UGC Video Pipeline ⭐

**Status**: Not started
**Goal**: Generate UGC-style talking head video ads for under $1 each. Agent-driven — writes scripts, picks presenters, assembles everything. User just reviews and confirms.

## Slices
- `STU-23`: Script generation (GPT-4.1-mini → 15-sec product review scripts)
- `STU-24`: Voiceover generation (mmaudio-v2-text-to-audio via Muapi)
- `STU-25`: Talking head / lip-sync video (creatify-lipsync via Muapi)
- `STU-26`: Product B-roll animation (kling-v2.1-standard-i2v via Muapi)
- `STU-27`: Video assembly (server-side FFmpeg: combine clips)
- `STU-28`: Multi-format reframe (luma-flash-reframe: 9:16, 1:1, 16:9)
- `STU-29`: UGC review UI (propose → review script + presenter → confirm → progress → result)

## Files to touch
```
src/lib/ugc-pipeline.ts, src/lib/ffmpeg.ts,
src/app/api/generate/ugc/route.ts,
src/app/(dashboard)/plan/ugc/, src/components/ugc/
```

## Steps
1. Script: retrieve product + brand tone via RAG → GPT-4.1-mini → 15-sec conversational UGC script
2. Presenter: agent pre-selects stock presenter matching target audience. User can change.
3. Voiceover: script → mmaudio-v2-text-to-audio → audio file URL
4. Talking head: presenter photo + voiceover → creatify-lipsync → lip-synced video
5. B-roll: product photo → kling-v2.1-standard-i2v with motion prompt → animated clip
6. Assembly: FFmpeg combine — talking head (0-8s) → B-roll (8-12s) → talking head CTA (12-15s), fade transitions
7. Reframe: assembled video → luma-flash-reframe → 9:16 + 1:1 + 16:9
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
| FFmpeg on Replit | Verify binary; fallback to cloud service or Muapi video editing |
| Pipeline 2-5 min | Step-by-step progress with friendly labels |
| Script quality | Industry-specific templates; user can always edit before confirming |
