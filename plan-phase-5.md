# Phase 5 — Content Calendar + Scheduling

**Status**: Not started
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
6. Status flow: planned → generated → scheduled → published

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
