# Phase 1 — Business Onboarding ⭐

**Status**: Not started
**Goal**: Build the onboarding wizard that captures business details driving ALL future generation.

## Slices
- `STU-8`: Business Profile schema + CRUD API
- `STU-9`: Multi-step onboarding wizard UI
- `STU-10`: Logo upload → auto-detect brand colors
- `STU-11`: Industry template engine (presets per business type)
- `STU-12`: Dashboard summary card (business profile overview)

## Files to touch
```
src/db/schema.ts (business_profiles table), src/app/api/business-profile/,
src/app/(dashboard)/onboarding/, src/components/onboarding/,
src/lib/brand-colors.ts, src/lib/industry-templates.ts
```

## Steps
1. `business_profiles` table: id, userId, businessName, businessType (enum), products (jsonb), targetCustomers, brandColors (jsonb array of hex), brandTone (enum: professional/casual/playful/luxury), logoUrl, socialPlatforms (jsonb array), businessEvents (jsonb array — `{ name, date, recurring }`), region (string), createdAt, updatedAt
2. CRUD API: POST/GET/PATCH with Zod validation
3. Multi-step wizard: Business Info → Products → Customers → Brand → Platforms → Events (optional)
4. Logo upload: client-side to R2 (presigned URL), extract dominant colors via canvas API (k-means clustering), auto-populate brandColors
5. Industry templates: JSON map of businessType → default brandTone, suggested content types, posting schedule
6. Ship `data/holidays.json` — major holidays by region
7. Dashboard card: business name, type, brand color swatches, logo thumbnail, connected platforms count
8. Redirect to onboarding if no business profile

## Acceptance Criteria
- New user → /dashboard → redirect to /onboarding
- Step 3 → click Back → return to step 2 with data preserved
- Logo upload → extraction → at least 3 brand colors populated
- Select "restaurant" → template pre-fills suggested tone and content types
- Completed onboarding → dashboard summary card shows all profile data

## Out of scope
- Content generation (Phase 2), social account connection (Phase 4)
- Full profile edit UI (basic PATCH is fine)
- Analytics (Phase 8)

## Risks
| Risk | Mitigation |
|------|-----------|
| Color extraction accuracy | Fallback to manual color picker |
| Long onboarding = drop-off | Keep steps short (3-5 fields), allow skip-and-fill-later |
