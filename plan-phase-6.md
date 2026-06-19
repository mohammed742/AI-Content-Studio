# Phase 6 — Stripe Billing

**Status**: Not started
**Goal**: Monetize. Subscription tiers with generation limits.

## Slices
- `STU-44`: Stripe integration (products, prices, checkout sessions)
- `STU-45`: Subscription management UI (current plan, usage, upgrade/downgrade)
- `STU-46`: Generation credit tracking (count per billing period, enforce limits)
- `STU-47`: Webhook handlers (subscription lifecycle events)
- `STU-48`: Feature gating (UGC video → Pro+, publishing → Pro+, calendar → Business)

## Files to touch
```
src/db/schema.ts (subscriptions, generation_credits),
src/lib/stripe.ts, src/lib/billing.ts,
src/app/api/billing/, src/app/(dashboard)/billing/,
src/middleware.ts (feature gates)
```

## Steps
1. Stripe products + prices for each tier (pricing TBD after computing COGS)
2. Checkout: select plan → Stripe Checkout Session → redirect → handle success
3. `subscriptions` table: id, userId, stripeCustomerId, stripeSubscriptionId, planTier, status, currentPeriodStart, currentPeriodEnd, createdAt
4. `generation_credits` table: id, userId, billingPeriodStart, creditsUsed, creditsLimit, updatedAt
5. Credit tracking: increment on generation, check before generating, 402 if over limit
6. Webhooks: customer.subscription.created/updated/deleted, invoice.payment_failed → update DB
7. Feature gates: middleware/API checks blocking UGC, publishing, calendar for sub-tier users
8. Billing UI: plan card ("15 of 50 credits left" — no dollar amounts), comparison cards, upgrade CTA, "Manage Subscription" (Stripe Portal). Credit warnings at <20% remaining.

## Acceptance Criteria
- Free user → UGC generation → upgrade prompt (not generation)
- Pro user at 95% credits → warning showing remaining
- Pro user over limit → API returns 402 with clear message
- Subscription cancellation webhook → planTier reverts to Free, features restricted

## Out of scope
- Annual billing, team/org billing, usage-based overage, refunds (manual via Stripe)

## Risks
| Risk | Mitigation |
|------|-----------|
| Webhook delivery failures | Idempotency keys; Stripe retries automatically |
| Credit count race conditions | DB transactions or atomic increment |
| Pricing TBD | Leave configurable; finalize after computing actual COGS |
