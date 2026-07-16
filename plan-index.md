# AI Content Studio — Plan Index

> **Agent: read only the active phase file identified by progress.md `Active plan file` field.**

> **Linear IDs are per-student.** Each bootcamp attendee has their own Linear board, so issue numbers differ for everyone. Plans use stable `STU-x` labels as internal references only — **always locate Linear issues by title**, never by number. If two issues share a title, use the one assigned to a phase milestone.

## Go-Live Path (Phases 0–7)

| Phase | File | Goal | Slices | Status |
|-------|------|------|--------|--------|
| 0 | `plan-phase-0.md` | Scaffold + Auth + DB + Landing Page | 6 | ✅ Done |
| 0.5 | `plan-phase-0-5.md` | Tracer Bullet — prove Muapi + R2 + GPT pipeline | 3 | ✅ Done |
| 1 | `plan-phase-1.md` | Business Onboarding Wizard | 5 | ✅ Done |
| 2 | `plan-phase-2.md` | Visual Content Generation Core (Agent Loop + RAG) | 12 | 🔄 In progress |
| 2.5 | `plan-phase-2-5.md` | Coverage & Asset Foundation (text graphics, media library, composites, carousels, data files, presenters) | 7 | Not started |
| 3 | `plan-phase-3.md` | UGC Video Pipeline (<$1/video) — depends on Phase 2.5 presenters | 7 | Not started |
| 4 | `plan-phase-4.md` | Social Publishing (YouTube/TikTok/Instagram) | 6 | Not started |
| 5 | `plan-phase-5.md` | Content Calendar + Scheduling | 4 | Not started |
| 6 | `plan-phase-6.md` | Stripe Billing | 5 | Not started |
| 7 | `plan-phase-7.md` | Admin Panel + Analytics | 6 | Not started |

## Post-Launch (Phase 8)

| Phase | File | Goal | Slices | Status |
|-------|------|------|--------|--------|
| 8 | `plan-phase-8.md` | Observability + Analytics + Email (GA4, PostHog, Sentry, Brevo) | 4 | Not started |

**Total: 65 slices across 11 phases.**

**Rules:**
- Do not start phase N+1 until N is verified.
- If a phase grows, split it: append Phase N.5 (Phase 2.5 was added this way on 2026-07-08).
- "Out of scope" sections are load-bearing — don't slip them in.
- Phase files carry a **Status** header — update it when a phase completes.
