# Workflow — Human + AI Co‑Build Contract

This is the **rules of engagement** for the AI Content Studio project. Read every session.

For on-demand protocols (grill-me, diagnose, code review, QA fix loop, ADRs, portfolio checkpoints), see **`workflow-protocols.md`** — loaded only when triggered.

## Files

- `replit.md` — master agent instructions (project, tech stack, coding standards)
- `WORKFLOW.md` — this file. Session lifecycle + rules. Read every session.
- `workflow-protocols.md` — on-demand protocols. Read specific sections when triggered.
- `plan-phase-N.md` — one file per phase. Read only the active phase.
- `PROGRESS.md` — current status (overwritten) + session log (append-only, last 5 entries)
- `CONTEXT.md` — domain glossary. Use terms exactly. Update inline when new terms resolved.
- `DESIGN.md` — UI/UX specs. **Read only for UI slices** (check PROGRESS.md `UI work` flag).
- `ARCHITECTURE.md` — system architecture. Read on demand.
- `README.md` — living README. Updated at phase end.
- `docs/adr/` — Architecture Decision Records. Created on demand.

## How a session starts

1. `replit.md` (auto-loaded) → `PROGRESS.md` (current status only) → active `plan-phase-N.md` → `CONTEXT.md`
2. If `UI work: yes` in PROGRESS.md → also read `DESIGN.md`
3. `ARCHITECTURE.md` → only if you need an overview
4. Check Linear for next **Todo** issue with all blockers **Done** → move to **In Progress**
5. If "Current status" says blocked → **do not invent next steps**. Surface blocker and stop.

## During work

- **One slice per session.** Do not start the next slice.
- **Feedback loop:** `pnpm typecheck && pnpm lint` after every change. Full `pnpm test` at slice milestones and before completion only — not after every change.
- **TDD scope:** Strict TDD (failing test first) for `src/lib/` services, API routes, and webhook handlers. UI components get a smoke test + human visual QA.
- **Linear writes:** Two per slice — one approach note at start (see `workflow-protocols.md § Spec/Design checkpoint`), one completion comment at end.
- Use CONTEXT.md vocabulary in all code, tests, commits.
- No drive-by refactors — note under "Tech debt observed."

## How a session ends

Before stopping, you **must**:

1. Update "Current status" in PROGRESS.md (overwrite in place):
   - Active phase + plan file name + sub-task
   - Next action (concrete, one sentence)
   - UI work: yes/no
   - Blockers (or "none")
   - Files modified this session (paths, cumulative)
2. Append a new "Session log" entry (newest at top):
   - Date, phase, what completed, what deferred (and why)
   - Decisions made (with rationale), test/lint/build status
   - Tech debt observed
3. Phase finished → set phase status to "Complete", create checkpoint `phase-N: <slug>`

**PROGRESS.md rules:**
- Save incrementally after each milestone — don't wait until session end.
- "Overwrite" means update, not erase — preserve cumulative file lists.
- Keep last 5 session log entries. Archive older to `PROGRESS-archive.md` at phase boundaries.

## Branching and Checkpoints

- One checkpoint per completed slice.
- Phases ship in order. Don't start N+1 until N is verified.
- If a phase grows, split it: append Phase N.5.

## Decision changes

If an assumption in PLAN.md turns out wrong:
- Surface to human and wait, OR
- Make the smallest reversible change, log in session log with rationale.

## Scope discipline

- "Out of scope" sections in plan files are load-bearing. Don't slip them in.
- No drive-by refactors — log as tech debt.
- Doc/process maintenance permitted as out-of-band sessions.

## Review batching

- **Batch reviews per phase** for small slices (e.g., Phase 0 scaffold slices).
- **Per-slice review** for risky slices: Muapi integration, Stripe webhooks, UGC pipeline, anything touching auth or payments.
- Reviews run in a **fresh session** — never self-review. See `workflow-protocols.md § Code review`.

## Done definition (per phase)

All must hold:
1. All acceptance criteria in plan-phase-N.md pass
2. Lint + typecheck + unit tests green
3. Checkpoint created with descriptive title
4. Plan file status updated to Complete
5. PROGRESS.md session log entry written + current status advanced
6. README.md updated to reflect current codebase state
7. All QA fix loops resolved

## Done definition (per slice)

1. All acceptance criteria from Linear issue met
2. `pnpm typecheck && pnpm test && pnpm lint` pass
3. Completion comment posted on Linear (with Portfolio Checkpoint — see `workflow-protocols.md`)
4. Issue moved to Needs Review → after review: all fixes done → Done
5. PROGRESS.md updated

## When stuck

Do **not** guess. Stop, update "Current status" with the blocker, surface it. The vibe coder unblocks; the agent doesn't fabricate.
