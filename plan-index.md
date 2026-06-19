# AI Content Studio — Plan Index

> **Agent: read only the active phase file identified by PROGRESS.md `Active plan file` field.**

## Go-Live Path (Phases 0–7)

| Phase | File | Goal | Slices |
|-------|------|------|--------|
| 0 | `plan-phase-0.md` | Scaffold + Auth + DB + Landing Page | 6 |
| 0.5 | `plan-phase-0-5.md` | Tracer Bullet — prove Muapi + R2 + GPT pipeline | 3 |
| 1 | `plan-phase-1.md` | Business Onboarding Wizard | 5 |
| 2 | `plan-phase-2.md` | Visual Content Generation Core (Agent Loop + RAG) | 12 |
| 3 | `plan-phase-3.md` | UGC Video Pipeline (<$1/video) | 7 |
| 4 | `plan-phase-4.md` | Social Publishing (YouTube/TikTok/Instagram) | 6 |
| 5 | `plan-phase-5.md` | Content Calendar + Scheduling | 4 |
| 6 | `plan-phase-6.md` | Stripe Billing | 5 |
| 7 | `plan-phase-7.md` | Admin Panel + Analytics | 6 |

## Post-Launch (Phase 8)

| Phase | File | Goal | Slices |
|-------|------|------|--------|
| 8 | `plan-phase-8.md` | Observability + Analytics + Email (GA4, PostHog, Sentry, Brevo) | 4 |

**Total: 58 slices across 10 phases.**

**Rules:**
- Do not start phase N+1 until N is verified.
- If a phase grows, split it: append Phase N.5.
- "Out of scope" sections are load-bearing — don't slip them in.
