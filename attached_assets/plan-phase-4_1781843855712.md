# Phase 4 — Social Publishing

**Status**: Not started
**Goal**: Connect social accounts and publish content directly from the app.

## Slices
- `STU-31`: Social account connection flow (OAuth via Muapi connect-url)
- `STU-32`: Connected accounts management UI (list, rename, disconnect)
- `STU-33`: Publish-to-YouTube flow
- `STU-34`: Publish-to-TikTok flow
- `STU-35`: Publish-to-Instagram flow
- `STU-36`: Publishing history + status tracking

## Files to touch
```
src/db/schema.ts (social_accounts, publish_jobs tables),
src/lib/social-publishing.ts,
src/app/api/social/, src/app/(dashboard)/social/, src/components/social/
```

## Steps
1. `social_accounts` table: id, userId, platform (1/2/3), platformName, accountName, muapiAccountId, connectedAt
2. `publish_jobs` table: id, userId, assetKitId, socialAccountId, platform, muapiRequestId, status (pending/processing/completed/failed), resultUrl, error, createdAt, completedAt
3. Connect: backend generates URL via `POST /api/v1/social/{platform}/connect-url` with external_user_id = Clerk ID + redirect_to; user completes OAuth; on return, fetch accounts and save
4. Management UI: connected accounts with platform icon, name, disconnect
5. Publish (per platform): select Asset Kit → choose account → platform-specific fields → POST to Muapi → save job → poll result
6. History: table with status badges, result links, retry for failures

## Acceptance Criteria
- "Connect YouTube" → complete OAuth → account appears in list
- Connected YouTube + publish Asset Kit → video on YouTube within 5 minutes
- Failed publish → retry resubmits with same parameters
- Published → result URL links to live social post

## Out of scope
- Scheduled publishing (Phase 5), social analytics, LinkedIn/X/Facebook
- Email notifications on publish (Phase 8)

## Risks
| Risk | Mitigation |
|------|-----------|
| OAuth token expiration | Muapi handles refresh internally; monitor for auth errors |
| Instagram requires Business account | Document in UI; show setup instructions |
| Publish 1-3 min async | Polling progress; webhooks in production |
