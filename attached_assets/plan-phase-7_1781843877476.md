# Phase 7 — Admin Panel + Analytics Dashboard

**Status**: Not started
**Goal**: Internal admin panel for tracking users, revenue, costs, and managing accounts.

## Slices
- `STU-49`: Admin auth guard (role check middleware, admin layout)
- `STU-50`: Dashboard overview (total users, free/paid split, MRR, API costs, signups chart)
- `STU-51`: CRM user detail view (profile, business profile, generations, costs, subscription, activity)
- `STU-52`: Revenue analytics (MRR chart, conversion funnel, churn rate, LTV, ARPU)
- `STU-53`: Cost analytics (Muapi costs, OpenAI costs, margin per tier, cost alerts)
- `STU-54`: Admin actions (upgrade/downgrade users, add credits, suspend, send emails)

## Files to touch
```
src/app/(admin)/layout.tsx, src/app/(admin)/admin/page.tsx,
src/app/(admin)/admin/users/, src/app/(admin)/admin/revenue/,
src/app/(admin)/admin/costs/, src/middleware.ts (admin guard),
src/lib/admin.ts, src/app/api/admin/
```

## Steps
1. Role column on users (should exist from Phase 0). Admin middleware: role === 'admin' for /admin/*.
2. Admin layout: separate sidebar (Overview, Users, Revenue, Costs)
3. Dashboard: stat cards + Recharts area chart for signups. Total users, free/paid, MRR, API costs.
4. Users table: TanStack Table with search, filter by plan, pagination. Columns: name, email, plan, generations, cost, last active.
5. User detail: profile, business profile, all generations, cost breakdown, subscription history, social accounts. Actions: upgrade/downgrade, add credits, suspend, email.
6. Revenue: MRR over time, conversion funnel, churn rate, LTV, ARPU.
7. Costs: Muapi + OpenAI stacked area chart, revenue vs costs (margin), cost per generation, top 10 expensive users, cost alerts.

## Acceptance Criteria
- Non-admin → /admin → redirect to /dashboard
- Admin → dashboard → total users, MRR, API costs for last 30 days
- Users table → search by email → filters in real-time
- User detail → "Add Credits" → balance increases + record logged
- Revenue → conversion funnel → actual percentages (signup → onboarding → generation → paid)
- Costs → user COGS exceeds plan revenue → flagged in cost alerts

## Out of scope
- Multi-admin roles, audit logging, real-time dashboards, custom reporting/data export

## Risks
| Risk | Mitigation |
|------|-----------|
| MRR accuracy | Cross-reference with Stripe Dashboard; use Stripe API as source of truth |
| Cost tracking gaps | Every Muapi/OpenAI call logs cost; cost=0 for failed calls |
| Admin role bootstrap | First admin set manually in DB or via seed script |
