# Phase 4 — Social Publishing

**Status**: In progress — STU-31 (DEV-35) built 2026-07-28 (connect flow + `social_accounts`); STU-32 (DEV-34) built 2026-07-28 (accounts management — rename + disconnect); STU-33 (DEV-36) built 2026-07-29 (publish-to-YouTube — `publish_jobs` + publish/poll/retry service + `POST`/`GET /api/social/publish` + publish UI on `/social`); STU-34…36 not started.
**Goal**: Connect social accounts and publish content directly from the app.

> ⚠️ **Contract note (verified live 2026-07-28, DEV-35):** Muapi's social API is real and matches `muapi.ai/docs/social-publishing`. `POST /social/{youtube|tiktok|instagram}/connect-url` → `{ url }`; `GET /social/ext/accounts?external_user_id=…` → account array; publish endpoints `POST /{platform}-publish` ($0.01 each). **Muapi owns the OAuth callback itself** and only bounces the user to our `redirect_to` afterward, so our side stores **no OAuth tokens** — just the `muapiAccountId`. Instagram uses `instagram_business_*` scopes (Business/Creator account required). `platform` stored as a string enum, not the plan's "1/2/3".

## Slices
- `STU-31`: Social account connection flow (OAuth via Muapi connect-url) — **BUILT (DEV-35, 2026-07-28)**: `social_accounts` table + `src/lib/social-publishing.ts` + `POST /api/social/connect` + `GET /api/social/callback` + minimal `/social` page. Static checks green; live OAuth is human-gated QA.
- `STU-32`: Connected accounts management UI (list, rename, disconnect) — **BUILT (DEV-34, 2026-07-28)**: `nickname` column + `renameAccount`/`disconnectAccount` on `social-publishing.ts` + `PATCH`/`DELETE /api/social/accounts` + per-account rename/disconnect controls on `/social`. **Rename = local nickname** (no Muapi op); **disconnect = Muapi `DELETE /social/ext/accounts/{id}` (liveness-verified) + local delete**. Static checks green; live click-through is human-gated QA.
- `STU-33`: Publish-to-YouTube flow — **BUILT (DEV-36, 2026-07-29)**: `publish_jobs` table + `buildYouTubePublishParams`/`publishAssetKit`/`refreshPublishJob`/`retryPublishJob`/`listPublishJobs` on `social-publishing.ts` + `POST`/`GET /api/social/publish` (submit/retry + advance-on-read polling) + Publish-to-YouTube UI on `/social`. **Contract verified live**: `youtube-publish` is a Muapi model slug ($0.01, submit→poll), required `account_id`(int)/`media_url`/`title`. Static checks green; live publish to a real channel is human-gated QA.
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
