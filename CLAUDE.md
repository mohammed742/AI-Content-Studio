# Agent Instructions

This repository is a vibe‑coded project with a structured human + AI workflow. **Any AI agent working in this repo must follow the workflow before making changes.**

## Required reading (in this order, every new session)

1. **`WORKFLOW.md`** — the contract. File roles, session start/end protocol, grill‑me, diagnose, code review, scope discipline, done definition. Read it fully on first interaction.
2. **`PROGRESS.md`** — only the **Current status** section at the top. That tells you the active phase, current sub‑task, next concrete action, blockers, and which files were last touched.
3. **`PLAN.md`** — only the **active phase** identified by `PROGRESS.md`. Each phase lists Goal, Slices, Files to touch, Detailed steps, Acceptance criteria (GIVEN/WHEN/THEN + RFC 2119), Out of scope, Risks.
4. **`CONTEXT.md`** — the domain glossary. Use these terms exactly in code, tests, commits, and conversation. If you encounter an undefined term, add it during the session.
5. **`DESIGN.md`** — skim the design rules. Required before writing any UI component. Covers design dials, component library, color system, typography, layout rules, and page‑by‑page specs.
6. **`ARCHITECTURE.md`** — only if you need an overview of how the codebase fits together.
7. **`replit.md`** — only if you need detailed tech stack info, generation architecture, social publishing API details, or UGC pipeline specs.

## Hard rules

- **Do not start the next phase until the active one is verified.**
- **Do not silently change direction.** If an assumption in `PLAN.md` turns out wrong, surface it or make the smallest reversible change and log it in `PROGRESS.md` session log.
- **No drive‑by refactors.** Note unrelated issues under "Tech debt observed" in the session log.
- **No `.env.local`, `node_modules`, or generated media commits.**
- **One checkpoint per completed slice.** Checkpoint title: `phase-N: <verb> <thing>` (e.g., `phase-0: scaffold nextjs + clerk auth`).
- **Never push to remote.** Agents create Replit checkpoints only. The human reviews all changes and controls version history. This applies in both interactive and AFK modes.
- **Always end a session by updating `PROGRESS.md`**: overwrite the "Current status" section, append a new "Session log" entry. See `WORKFLOW.md` for required fields.
  - **Save incrementally, not just at the end.** After each meaningful milestone (schema push, code change, doc update), update `PROGRESS.md` immediately. In long sessions, context degrades — if you only write at the end, you risk documenting work inaccurately.
  - **"Overwrite" means update, not erase.** When rewriting "Current status", preserve cumulative context from prior sessions. File lists must stay cumulative (add new entries, annotate amended ones with session numbers). Never drop entries from earlier sessions.
- **Always keep Linear in sync.** After completing any work — slices, infra, doc changes, schema pushes, anything — update the relevant Linear issue (description **and** comment), move its **status** if the work is fully complete (e.g. In Progress → Needs Review → Done).
- **Use CONTEXT.md terms.** If you encounter an undefined term, add it to the glossary immediately.

## Project context (short)

AI Content Studio is a Next.js 15 visual‑first AI content generation platform for SMBs. Users input business details (type, products, customers, brand) and the **agent** proposes a weekly content plan — product photos, social graphics, UGC‑style video ads, captions, hashtags — then generates everything on approval and publishes directly to YouTube, TikTok, and Instagram.

**Agent‑driven paradigm:** Users never write prompts, pick models, or see technical details. The agent handles all creative decisions. Users see credits ("15 of 50 left"), not dollar costs or model names.

Core pipeline: **Plan → Retrieve → Route → Execute → Assemble → Publish** (6‑step Agent Loop). Visual AI via **Muapi.ai** (single gateway). Text AI via **OpenAI GPT‑4.1‑mini**. Brand context via **pgvector RAG** on Neon. Auth via **Clerk**. Payments via **Stripe**. Media storage via **Cloudflare R2**. Analytics via **GA4** (landing) + **PostHog** (product). Error tracking via **Sentry**. Email via **Brevo**. UI built with **shadcn/ui** + **Phosphor icons** + **Geist font** + **motion/react**.

Design philosophy: `DESIGN_VARIANCE: 6`, `MOTION_INTENSITY: 5`, `VISUAL_DENSITY: 5`. Zinc + Emerald palette. Dark mode default. See `DESIGN.md` for full specs.

## AFK execution protocol (slice-based)

When running autonomously (AFK / night‑shift mode), follow this loop **one slice at a time**:

### Startup

1. Read `AGENTS.md` → `WORKFLOW.md` → `PROGRESS.md` (current status only).
2. Read the assigned Linear slice issue (description + acceptance criteria).
3. Move the issue → **In Progress** in Linear.

### Implementation

4. Explore the codebase to understand existing patterns before writing code. Use `CONTEXT.md` vocabulary.
5. **Run pre‑planning discussion** (see `WORKFLOW.md`): identify gray areas, propose defaults, post to Linear. Skip for simple slices. In AFK mode, post and proceed without blocking.
6. **Run plan self‑check** (see `WORKFLOW.md`): verify all 8 dimensions pass before writing the first line of code. If any fail, fix the plan and log the adjustment.
7. **Post an approach note** on the Linear issue (see `WORKFLOW.md`). Scale detail to complexity.
8. Read `DESIGN.md` before writing any UI component. Follow the design dials, color system, and component standards.
9. Prefer **deep modules with simple interfaces** — few files, rich internals, easy to test.
10. Use **TDD**: write a failing test → implement → pass the test → refactor.
11. Run the feedback loop after every meaningful change:
   ```
   pnpm typecheck && pnpm test && pnpm lint
   ```
12. Stop when **ALL** acceptance criteria from the Linear issue are met.

### Wrap-up

13. Run `pnpm build` to confirm no regressions.
14. **Post a completion comment** on the Linear issue. Write it for a non-technical reader — no jargon, no code snippets, no file paths in the summary. Include:
    - **What was done** — plain English
    - **What was tested** — e.g. "Tested that signing up creates the right records"
    - **Result** — did all checks pass? (`typecheck ✅`, `tests ✅`, `build ✅`)
    - **Anything the reviewer should know** — gotchas, decisions made
    - **QA checklist** — a markdown checklist (`- [ ]`) of specific steps the reviewer should follow to verify the work
    - **📋 Portfolio Checkpoint** — what was built, why it matters, key concept learned, architecture decision (see `WORKFLOW.md → Portfolio Checkpoint`)
15. Move the issue → **Needs Review** in Linear.
16. Update `PROGRESS.md`: **overwrite** the "Current status" section AND **append** a new session log entry (newest at top). See `WORKFLOW.md` for required fields.
17. If this is the **last slice of a phase**, also update `README.md` to reflect the current state of the codebase.

### QA fix loop

When QA or code review finds issues after step 15, follow `WORKFLOW.md → QA Fix Loop`:
- Read findings → fix (blockers first) → re-test → post fix comment → re-submit for review
- **Do NOT add features** during fix sessions
- Multiple fix rounds are normal — the loop continues until review passes

### AFK hard rules

- **One slice per session.** Do not start the next slice.
- **Do NOT add features** beyond the slice scope.
- **Do NOT refactor** unrelated code (log it as tech debt).
- **Do NOT skip** the test step — tests are the feedback loop.
- **Do NOT review your own work** in the same session (dumb zone risk). Reviews run in a fresh session using the two‑axis protocol in `WORKFLOW.md`.

### Execution order

**Query Linear for the current dependency graph** — do not rely on a hardcoded list. Use the Linear MCP (if available) to:
1. List all `Slice`-labeled issues in the project.
2. Check each issue's `blockedBy` relations to build the DAG.
3. Pick the next issue that is in `Todo` and has **all** blockers in `Done`.

If Linear MCP is unavailable, fall back to `PROGRESS.md` which records the last completed slice.

## Handling change requests

The human may ask for changes at any time — new features, altered requirements, architecture pivots. When this happens, **do NOT jump to code.** Follow this protocol:

### 1. Detect the type of change

| Signal | Type | Example |
|---|---|---|
| "Actually, change X to Y" | **Scope change** | "Use Resend instead of Brevo" |
| "Add [new feature]" | **New slice** | "Add a leaderboard" |
| "Remove [feature]" | **Slice deletion** | "Drop the calendar feature" |
| "I don't like how X works" | **Rework** | "Onboarding should be one step, not five" |

### 2. Ask clarifying questions

Before making any changes, confirm:
- **What exactly changes?** (get specifics, not vibes)
- **Which slices does this affect?** (check the DAG)
- **Are any Done slices impacted?** (those need new slices, not edits)

### 3. Propagate the change

Once confirmed, update **all** affected locations:
- **Linear issue descriptions** — edit the slice specs
- **Linear DAG** — add/remove/reorder dependencies if needed
- **Repo docs** — update `PLAN.md`, `CONTEXT.md`, `DESIGN.md`, `PROGRESS.md` as needed
- **Create new slices** if a Done slice needs rework

### 4. Summarize what changed

Post a summary to the human:
- What was changed and where (Linear issues, repo files)
- Any new slices created
- Updated execution order if the DAG changed

**Never silently absorb a change.** Always confirm → update everywhere → summarize.

## Grill‑me / Design review

When the human says "grill me", "stress‑test this", or "let's brainstorm X", follow the protocol defined in `WORKFLOW.md`. Short version: ask one question at a time, recommend your own answer, explore the codebase before asking, challenge terms against `CONTEXT.md`, sharpen fuzzy language, probe with concrete edge‑case scenarios, cross‑reference claims with code, update `CONTEXT.md` inline as terms are agreed, offer ADRs sparingly (see `WORKFLOW.md`), track open branches, close with a decision log.

When debugging, follow `WORKFLOW.md → Diagnose`: build a feedback loop first, reproduce, generate 3‑5 ranked hypotheses, instrument one variable at a time, fix + regression test, cleanup.

## Tool‑specific notes

- **Replit Agent**: reads `replit.md` automatically on session start. `replit.md` contains detailed tech stack, generation architecture, social publishing API, and UGC pipeline — the project‑specific complement to this file.
- **Cursor**: create `.cursor/rules/studio.mdc` that auto‑attaches and points to this file. Still read `WORKFLOW.md` + `PROGRESS.md` directly.
- **Claude Code**: `CLAUDE.md` mirrors this file. Same rules apply.
- **Antigravity / Windsurf / Aider / generic agents**: this file (`AGENTS.md`) is the single source of truth at repo root.
- **Warp / Oz**: WARP Rules supply environment context; this file supplies project‑specific rules.
- **GitHub Copilot**: not rule‑driven; keep `WORKFLOW.md` and `PROGRESS.md` open in your editor as context.

## When in doubt

Ask the human before guessing. The vibe coder unblocks; the AI does not fabricate. The workflow is designed so a new session can produce useful work within 5 minutes of reading these files — don't shortcut it.
