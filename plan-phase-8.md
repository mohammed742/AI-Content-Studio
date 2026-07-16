# Phase 8 — Observability + Analytics + Email

**Status**: Not started
**Goal**: Instrument the live app with analytics, error tracking, and transactional email. All deferred from earlier phases to prioritize go-live.

## Slices
- `STU-6b`: Google Analytics 4 (landing page events: page_view, cta_click, signup_start)
- `STU-6c`: PostHog integration (product analytics: feature_used, generation_started, generation_completed, onboarding_completed, plan_upgraded)
- `STU-6f`: Sentry error tracking (server + client, source maps, performance monitoring, user-tagged errors)
- `STU-6d`: Brevo email service (welcome email on signup, transactional email service class, lifecycle drip campaigns)

## Files to touch
```
src/lib/analytics.ts, src/lib/email.ts,
src/components/analytics/posthog-provider.tsx,
src/app/layout.tsx (GA4 script, PostHog provider),
src/app/api/webhooks/clerk/route.ts (add welcome email),
sentry.client.config.ts, sentry.server.config.ts, sentry.edge.config.ts,
src/env.ts (add NEXT_PUBLIC_GA4_ID, NEXT_PUBLIC_POSTHOG_KEY, NEXT_PUBLIC_SENTRY_DSN, BREVO_API_KEY)
(GA4/PostHog/Sentry-client keys need the NEXT_PUBLIC_ prefix — they are read in the browser; BREVO_API_KEY stays server-only)
```

## Steps

### STU-6b: GA4
1. Add `NEXT_PUBLIC_GA4_ID` to env validation
2. `src/lib/analytics.ts` — gtag script in layout, `trackEvent(name, params)` helper
3. Track: page_view (auto), cta_click (landing page CTAs), signup_start (sign-up page)

### STU-6c: PostHog
1. Add `NEXT_PUBLIC_POSTHOG_KEY` to env validation
2. `src/components/analytics/posthog-provider.tsx` — PostHog provider component
3. `usePostHog()` hook, auto-capture enabled
4. Track: feature_used, generation_started, generation_completed, onboarding_completed, plan_upgraded

### STU-6f: Sentry
1. `npx @sentry/wizard@latest -i nextjs`
2. Config: `sentry.client.config.ts`, `sentry.server.config.ts`, `sentry.edge.config.ts`
3. Performance monitoring (tracesSampleRate: 0.1 prod, 1.0 dev)
4. Source map upload on build
5. Tag errors with Clerk userId for user-level debugging
6. Wrap API routes with `Sentry.withSentry()`

### STU-6d: Brevo
1. Add `BREVO_API_KEY` to env validation
2. `src/lib/email.ts` — BrevoService class: `sendTransactional(to, templateId, params)`, `addContact(email, attributes)`
3. Welcome email template — triggered from Clerk webhook (update existing route)
4. Optional: lifecycle drip campaigns (onboarding incomplete after 3 days, first generation prompt)

## Acceptance Criteria
- Landing page CTA click → GA4 `cta_click` event fires
- Dashboard navigation → PostHog `$pageview` captured
- Generation started → PostHog `generation_started` event with content type
- Server error → Sentry alert with userId tag and stack trace
- New user signup → welcome email delivered via Brevo within 1 minute
- `pnpm build` → source maps uploaded to Sentry

## Out of scope
- A/B testing, custom dashboards, advanced funnels
- Email drip campaign automation (manual setup in Brevo UI)

## Risks
| Risk | Mitigation |
|------|-----------|
| PostHog free tier limits (1M events/mo) | Sufficient for MVP; monitor usage |
| Brevo deliverability | Use verified sender domain; monitor bounce rates |
| Sentry noise from known issues | Configure alert rules to filter noise |
