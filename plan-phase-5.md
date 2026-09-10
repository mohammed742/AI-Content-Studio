# Phase 5 — Content Calendar + Scheduling

**Status**: ✅ Complete — closed 2026-09-10 at the human's direction. All 4 slices built, committed and pushed (STU-38 `98bf4e5`, STU-39 `ad13bda`, STU-40 `ef1bbb8`, STU-41 `73bdc45`); `typecheck ✅ · tests 419/419 ✅ · lint ✅`. **Carried over:** live end-to-end QA of scheduled publishing (approve a plan → entry reads generated → schedule it → cron publishes → entry reads Published) has **not** been run — it needs the Railway deploy (a public URL for the cron and for social OAuth). Acceptance criterion 3 is verified by tests and local probes only, not against a real social account.
**Goal**: Visual calendar integrating with Content Plans. Scheduled auto-publishing.

## Slices
- `STU-38`: Calendar data model (calendar_entries table, linked to content_plans)
- `STU-39`: Visual calendar UI (month/week view, drag-and-drop)
- `STU-40`: Scheduled publishing (cron checks entries → calls Muapi publish)
- `STU-41`: Calendar status tracking (planned → generated → scheduled → published)

## Files to touch
```
src/db/schema.ts (calendar_entries), src/lib/publish-scheduler.ts,
src/app/api/calendar/, src/app/(dashboard)/calendar/,
src/components/calendar/, src/jobs/publish-scheduler.ts
```

## Steps
1. `calendar_entries` table: id, userId, contentPlanId (FK), planItemIndex, date, time, platform, contentType, assetKitId (nullable), status (planned/generated/scheduled/published/failed), createdAt
2. When Content Plan approved → auto-create calendar entries from plan items
3. Calendar: month grid + week timeline. Color-coded by type. Drag-and-drop reschedule. Click day → slide-over with items.
4. "Plan This Week" CTA → navigates to /plan for selected week
5. Cron: check entries where date+time <= now AND status = generated AND connected account → Muapi publish → update to published
   - ⚠️ **Amended in DEV-42 (human-approved 2026-08-07):** the gate is `status = scheduled`, **not** `generated`. As written, approving a plan would silently post to real YouTube/TikTok/Instagram accounts days later with no per-post confirmation. Auto-publishing is now an explicit per-item opt-in in the calendar day panel (`generated` → `scheduled`), which is also what makes step 6's status flow mean something. The cron is `POST /api/cron/publish` behind a bearer secret; no `src/jobs/publish-scheduler.ts` was needed.
6. Status flow: planned → generated → scheduled → published
   - ✅ **Closed in DEV-43 (2026-08-07):** the plan assumed the flow would advance itself. It did not — entries were created `planned` and nothing ever updated them, so with a null Asset Kit the step-5 opt-in was unreachable. DEV-43 adds the two missing writes: the Generation Queue advances `planned` → `generated` (attaching the kit), and a completed Publish Job marks the kit **and** its entries `published` — hooked where *manual* publishes pass too, not just the cron. A generation failure deliberately leaves the entry `planned` (`failed` means the publish failed). Kit status surfaces as a "Published" badge in the Gallery.

## Acceptance Criteria
- Approved plan with 7 items → 7 calendar entries at planned days
- "Plan This Week" → navigates to /plan for that week
- Scheduled entry + connected account → auto-publishes at scheduled time, status updated
- Drag entry to new date → date updates in DB

## Out of scope
- Multi-week batch generation, recurring templates, team calendar

## Risks
| Risk | Mitigation |
|------|-----------|
| Cron reliability on Replit | Built-in scheduled tasks; add retry logic |
| Orphaned entries from deleted plans | Cascade or soft-delete; show as "standalone" |
