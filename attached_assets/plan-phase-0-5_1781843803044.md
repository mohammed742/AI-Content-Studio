# Phase 0.5 — Tracer Bullet 🎯

**Status**: Not started
**Goal**: Prove the entire risky spine end-to-end in 1-2 sessions: Muapi auth → image generation → cost tracking → R2 storage → GPT captioning → display. If this fails, we pivot before spending $300+ on onboarding wizards.

## Slices

- `STU-T1`: Hardcoded business profile + tracer page shell
- `STU-T2`: Muapi integration proof (generate product photo, parse cost header, save to R2)
- `STU-T3`: GPT caption proof (generate caption conditioned on business profile, display with image)

## Files to touch
```
src/app/(dashboard)/tracer/page.tsx,
src/lib/muapi.ts, src/lib/r2.ts, src/lib/openai.ts,
src/env.ts (add MUAPI_API_KEY, R2 keys, OPENAI_API_KEY)
```

## Steps

### STU-T1: Hardcoded business profile
1. Add env vars to `src/env.ts`: `MUAPI_API_KEY`, `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET_NAME`, `R2_PUBLIC_URL`, `OPENAI_API_KEY`
2. Create `src/lib/tracer-data.ts` — hardcoded business profile:
   ```typescript
   export const TRACER_BUSINESS = {
     name: "Sunrise Café",
     type: "restaurant",
     products: ["Cappuccino", "Avocado Toast", "Seasonal Smoothie Bowl"],
     brandTone: "casual",
     brandColors: ["#2D5016", "#F5E6D3", "#D4A574"],
     targetCustomers: "Young professionals and students looking for aesthetic café experiences"
   };
   ```
3. Create `/tracer` page with a "Run Tracer" button and empty results area

### STU-T2: Muapi integration proof
1. Create `src/lib/muapi.ts` — minimal MuapiService:
   - `generate(model: string, params: object): Promise<MuapiResult>`
   - Parse `X-MuAPI-Cost-USD` from response headers
   - Return `{ mediaUrl, costUsd, model, durationMs }`
2. Create `src/lib/r2.ts` — minimal R2Service:
   - `upload(key: string, buffer: Buffer, contentType: string): Promise<string>`
   - Returns the public URL
3. On "Run Tracer" click:
   - Call `muapi.generate("ai-product-photography", { prompt: "A cappuccino on a rustic wooden table, morning light, café setting" })`
   - Download the result image
   - Upload to R2 via `r2.upload()`
   - Display: image, cost, model used, duration
4. Log everything to console + display on page

### STU-T3: GPT caption proof
1. Create `src/lib/openai.ts` — minimal OpenAI wrapper using Vercel AI SDK:
   - `generateCaption(business, imageDescription): Promise<{ caption, hashtags }>`
2. After image generation:
   - Call GPT-4.1-mini with prompt conditioned on TRACER_BUSINESS
   - Display caption + hashtags alongside the generated image
3. Final tracer page shows: generated image + caption + hashtags + cost breakdown (model, image cost, total)

## Acceptance Criteria
- "Run Tracer" click → Muapi API call succeeds and returns an image URL
- `X-MuAPI-Cost-USD` header → parsed and displayed (should be ~$0.05)
- Image downloaded and re-uploaded to R2 → accessible via public URL
- GPT-4.1-mini → caption generated in brand tone (casual), mentions product
- Total pipeline executes in <30 seconds
- All results displayed on `/tracer` page with no manual steps

## Out of scope
- Database storage (no DB writes — this is a proof-of-concept)
- User-facing UI polish (raw results display is fine)
- Error handling beyond basic try/catch (that comes in Phase 2)
- Asset Kit assembly (Phase 2)

## Risks
| Risk | Mitigation |
|------|-----------|
| Muapi API key issues | Test API key separately with curl before coding |
| `ai-product-photography` quality | If poor, try `flux-schnell` as alternative. Log both results. |
| R2 CORS/public access config | Configure R2 bucket with public read access or signed URLs |
| Cost higher than expected | Budget $2-5 for tracer runs. Monitor X-MuAPI-Cost-USD closely. |

## What this proves
If all 3 slices pass, we've validated:
1. ✅ Muapi auth and API reliability
2. ✅ Cost tracking math ($0.05/photo is real)
3. ✅ R2 storage works end-to-end
4. ✅ GPT captioning conditioned on business profile produces quality output
5. ✅ The entire generation-to-display pipeline works

If any slice fails, we know **exactly** which integration to fix before investing in the full product.
