# Phase 2 — Visual Content Generation Core

**Status**: Not started
**Goal**: Build the Agent Loop — the core engine that analyzes a business, proposes a content plan, and auto-generates all content on approval. Includes Brand Knowledge Base (RAG). Users never write prompts, pick models, or see technical details.

## Slices
- `STU-14`: Muapi.ai integration service (API wrapper, credit tracking, error handling, retry)
- `STU-14b`: Brand Knowledge Base — pgvector setup + embedding pipeline
- `STU-14c`: Retrieval service — semantic search for generation context
- `STU-15`: Model Router (map asset types → optimal models — invisible to users)
- `STU-16`: Content Plan Proposal engine (agent analyzes business → proposes weekly content)
- `STU-17`: Product photo generation pipeline (upload → bg removal → lifestyle scene → reframe)
- `STU-18`: Social media graphic generation (text-to-image with brand conditioning via RAG)
- `STU-19`: OpenAI text generation (captions, hashtags, ad copy — with retrieved brand context)
- `STU-20`: Asset Kit assembly + auto-embed (combine media + text, R2 upload, DB save, embed into knowledge base)
- `STU-21`: Content Plan UI — propose → review → approve → auto-generate → results
- `STU-22`: Gallery — browsing and managing generated content (thumbs up/down feedback)
- `STU-22b`: Agent Evals — quality tracking, pipeline reliability, performance feedback loop

## Files to touch
```
src/lib/muapi.ts, src/lib/model-router.ts, src/lib/openai.ts,
src/lib/embeddings.ts, src/lib/retrieval.ts, src/lib/content-planner.ts,
src/lib/generation-queue.ts, src/lib/agent-evals.ts, src/lib/r2.ts,
src/db/schema.ts (asset_kits, generations, brand_embeddings, content_plans, generation_feedback, pipeline_logs),
src/app/api/plan/, src/app/api/generate/, src/app/api/feedback/,
src/app/(dashboard)/plan/, src/app/(dashboard)/gallery/,
data/holidays.json, data/industry-strategies.json
```

## Steps
1. Muapi service: `generate(model, params)`, track cost from `X-MuAPI-Cost-USD` header, retry with backoff, every call logged to pipeline_logs
2. Enable pgvector on Neon: `CREATE EXTENSION IF NOT EXISTS vector;`
3. DB tables: brand_embeddings (vector(1536)), content_plans, generations, asset_kits, pipeline_logs, generation_feedback
4. Embedding service: embed + store using OpenAI text-embedding-3-small. Auto-called on onboarding completion, product edits, caption edits
5. Retrieval service: cosine similarity search, top-k chunks, format into prompt context
6. Model Router: config-driven `{ assetType, quality }` → `{ model, params }`. Invisible to users.
7. Content Planner: retrieve business context via RAG → GPT-4.1-mini proposes 5-7 items. Industry strategies, seasonal awareness, performance feedback loop.
8. Generation Queue: execute plan items in parallel where possible, per-item status, log every step to pipeline_logs
9. Photo pipeline: RAG retrieve → bg-removal → ai-product-photography → ideogram-v3-reframe
10. Graphic pipeline: RAG retrieve → prompt build → route to model → generate → reframe
11. Text pipeline: captions, hashtags, ad copy with retrieved brand context
12. Assembly: combine media + text → R2 upload → DB save → embed new generation back into knowledge base
13. Plan UI: "Create My Content Plan" → review cards → "Approve & Generate All" → progress → results. Credits only, no model names/costs.
14. Gallery: grid with filters, expandable cards, editable caption, thumbs up/down
15. Agent Evals: plan quality scoring (0-100, auto-regenerate below 60), feedback tracking, pipeline reliability report

## Acceptance Criteria
- "Create My Content Plan" → 5-7 items with types, titles, platforms, scheduled days
- "Approve & Generate All" → all items generating, plan status = `generating`
- Generation complete → all items have Asset Kits with mediaUrl, caption, hashtags
- Credit display as "X of Y left" — no dollar amounts, no model names
- Muapi 429/500 → exponential backoff, max 3 retries, "Failed" + "Retry" button
- Gallery pagination works at 20+ items
- Onboarding completion → products + brand guidelines embedded into knowledge base
- Retrieval → only top-k relevant chunks injected (not entire profile)
- Completed generation → caption + prompt auto-embedded back into knowledge base
- 50-product user → plan proposes specific relevant product, not all 50
- Restaurant user in US + Valentine's in 5 days → plan includes Valentine's content
- 30 days of feedback (90% 👍 photos, 40% 👍 graphics) → plan weights more photos
- Plan score <60 → auto-regenerated before showing to user
- Thumbs up/down → stored in generation_feedback
- Every pipeline step → pipeline_logs row (step, model, duration, success, cost)

## Out of scope
- UGC video (Phase 3), social publishing (Phase 4), scheduling (Phase 5), billing (Phase 6)
- Error tracking/monitoring (Phase 8) — use console.error for now

## Risks
| Risk | Mitigation |
|------|-----------|
| Muapi rate limits | Queue with backoff, per-item progress in UI |
| Generation 30+ sec/item | Async parallel pattern, per-item status polling |
| Content plan quality | Auto-score + auto-regenerate below 60; seed with industry templates |
| R2 upload costs | Monitor; images ~200KB, videos in Phase 3 |
