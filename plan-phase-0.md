# Phase 0 — Scaffold + Auth + DB

**Status**: Not started
**Goal**: Boot the project. Working Next.js app with Clerk auth, Neon database, and a conversion-focused landing page. No analytics, no monitoring — just the functional foundation.

## Slices

- `STU-2`: Scaffold Next.js 15 with TypeScript + Tailwind + shadcn/ui
- `STU-3`: Clerk auth (sign-in, sign-up, middleware, protected routes)
- `STU-4`: Drizzle ORM + Neon schema push (users table)
- `STU-5`: Clerk webhook → create user record in DB
- `STU-6`: Landing page (3-section MVP: Hero, Features, CTA + SEO + legal pages)
- `STU-6a`: Authenticated dashboard shell (sidebar layout, header, empty state)

## Files to touch
```
src/app/layout.tsx, src/app/page.tsx, src/app/(auth)/, src/app/(dashboard)/,
src/db/schema.ts, src/db/index.ts, src/env.ts, src/middleware.ts,
src/app/api/webhooks/clerk/route.ts, drizzle.config.ts, tailwind.config.ts,
src/app/privacy/page.tsx, src/app/terms/page.tsx
```

## Steps
1. `npx create-next-app@latest ./ --typescript --tailwind --eslint --app --src-dir`
2. Install deps: `drizzle-orm`, `drizzle-kit`, `@neondatabase/serverless`, `@clerk/nextjs`, `zod`, `@phosphor-icons/react`, `motion`, `sonner`
3. Install design stack: `npx shadcn@latest init` (Zinc theme, dark mode, CSS variables)
4. Geist + Geist Mono via `next/font` (NOT Google Fonts link tag)
5. `src/env.ts` — validate env vars with Zod (DATABASE_URL, CLERK keys)
6. `src/db/schema.ts` — `users` table: id (cuid), clerkId (unique), email, name, imageUrl, role (enum: user/admin, default user), createdAt, updatedAt
7. `src/db/index.ts` — Drizzle client with Neon serverless driver
8. `drizzle.config.ts`, run `pnpm db:push`
9. Clerk: `ClerkProvider` in layout, `middleware.ts`, sign-in/sign-up routes
10. `src/app/api/webhooks/clerk/route.ts` — handle `user.created` → insert into users table
11. Landing page (3-section MVP): Hero (split-screen: headline + product demo), Feature Showcase (3-4 features), Final CTA
12. SEO: `<title>`, `<meta description>`, OG image, JSON-LD structured data
13. Legal: `/privacy` and `/terms` (placeholder content)
14. Dashboard shell (sidebar + header + main content area per DESIGN.md §9.4)
15. Error boundaries on all layouts

## Acceptance Criteria
- Fresh deploy → landing page with 3 sections, meta tags, OG image
- Unauthenticated /dashboard → redirect to /sign-in with ?redirect param
- Clerk signup webhook → user row created in DB
- `pnpm typecheck && pnpm test && pnpm lint` → zero errors
- `pnpm build` → completes without errors

## Out of scope
- Business profile, generation, billing, social publishing
- ALL analytics/monitoring/email (GA4, PostHog, Sentry, Brevo) — deferred to Phase 8

## Risks
| Risk | Mitigation |
|------|-----------|
| Clerk webhook delivery in dev | Use Clerk's webhook testing UI or ngrok |
| Neon cold start latency | Acceptable for MVP; monitor later |
