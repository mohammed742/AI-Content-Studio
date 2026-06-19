# Workflow Protocols — On-Demand Reference

> **These protocols are loaded on demand, not every session.** Your `WORKFLOW.md` or `replit.md` will tell you when to read a specific section. Don't read this entire file at session start.

---

## Grill‑me / Design review

When the human says "grill me", "stress‑test this", or "let's brainstorm X", switch into **adversarial interviewer mode**:

1. **Ask one focused question at a time** about the plan, design, or decision.
2. **Recommend an answer for every question you raise** — based on codebase exploration.
3. **Explore before asking** — if answerable by reading code, read it first.
4. **Challenge against the glossary** — flag CONTEXT.md term conflicts.
5. **Sharpen fuzzy language** — propose precise canonical terms.
6. **Probe with concrete scenarios** — edge‑case scenarios that force precision.
7. **Cross‑reference with code** — check claims against actual code, surface contradictions.
8. **Track open branches** — running list of unresolved decisions.
9. **Update CONTEXT.md inline** — immediately when terms are agreed.
10. **Offer ADRs sparingly** — only when all three criteria are met (hard to reverse + surprising without context + real trade-off).
11. **End with a decision log** — bulleted summary of every decision (what + why) + which files need updating.

> CONTEXT.md glossary updates are permitted inline. All other file edits require human approval first.

---

## Architecture Decision Records

ADRs live in `docs/adr/` with sequential numbering: `0001-slug.md`. Create the directory lazily.

### Format

An ADR can be a single paragraph. The value is recording *that* a decision was made and *why*.

```md
# {Short title of the decision}

{1-3 sentences: context, what we decided, and why.}
```

Optional sections (only when they add genuine value): Status frontmatter, Considered Options, Consequences.

### When to write (all three must be true)

1. Hard to reverse
2. Surprising without context
3. Result of a real trade-off

---

## Spec / Design checkpoint

Before writing code for a slice, post a brief **approach note** on the Linear issue. Scale to complexity:

- **Simple:** one-liner
- **Medium:** 3–5 bullets
- **Complex:** full approach note (files, types, data flow, risks, AC mapping)

Not a blocking gate — post and proceed.

---

## Pre‑planning discussion

For medium/complex slices, identify gray areas before planning:

| Category | Examples |
|----------|---------|
| Visual / UX | Toast persistence, empty states, loading skeletons |
| API / contract | Response shape, error format, pagination strategy |
| Data / storage | Table ownership, nullable vs default, index strategy |
| Organisation / naming | File location, function name, module boundary |

Protocol:
1. Read Linear issue + relevant plan-phase-N.md acceptance criteria
2. Skim files to touch — existing patterns answer most gray areas
3. List remaining gray areas, propose a default for each
4. Post as comment on Linear issue
5. Human present: wait briefly. AFK: proceed with defaults + log choices

Skip entirely for simple slices.

---

## Plan self‑check (8 dimensions)

Before writing first line of code:

| # | Dimension | Pass condition |
|---|-----------|---------------|
| 1 | Requirement coverage | Every AC maps to at least one implementation step |
| 2 | Task atomicity | Each piece of work is independently reviewable |
| 3 | Dependency ordering | Step B requires Step A's output → Step A listed first |
| 4 | File scope | No two tasks clobber the same file incompatibly |
| 5 | Verification commands | Each task has a runnable done-check |
| 6 | Context fit | Full implementation fits within a single session |
| 7 | Gap detection | No missing steps between existing state and AC met |
| 8 | Test existence | At least one automated test verifies core behaviour |

If Context fit (6) fails: split into sub-slices, re-run full check on each.

---

## Diagnose

6-phase debugging loop:

### Phase 1 — Build a feedback loop (try in order)
1. Failing test (unit, integration, or e2e)
2. Curl/HTTP script against `pnpm dev`
3. CLI invocation with fixture input
4. Headless browser script (Playwright)
5. Replay a captured trace
6. Throwaway harness
7. Bisection harness (checkpoint bisect)

If you cannot build a loop: stop and say so. **Do not hypothesise without a loop.**

### Phase 2 — Reproduce
Run the loop. Confirm failure matches description. Confirm reproducible.

### Phase 3 — Hypothesise
Generate 3–5 ranked falsifiable hypotheses before testing any.

### Phase 4 — Instrument
One variable at a time. Tag debug logs with `[DEBUG‑xxxx]` for single-grep cleanup.

### Phase 5 — Fix + regression test
Write regression test before fix if seam exists. Watch fail → fix → watch pass → re-run Phase 1 loop.

### Phase 6 — Cleanup
- [ ] Original repro no longer reproduces
- [ ] Regression test passes
- [ ] All `[DEBUG‑...]` instrumentation removed
- [ ] Throwaway prototypes deleted
- [ ] Root cause stated in PROGRESS.md session log

Then ask: what would have prevented this bug? Log under "Tech debt observed."

---

## Code review

Two-axis review in a **fresh session** — never self-review.

### 1. Pin comparison scope
Human provides scope (checkpoint, session files, or "everything since last checkpoint").

### 2. Identify spec source
1. Linear issue AC → 2. PLAN.md active phase → 3. Human-provided spec → 4. No spec → "skipped"

### 3. Identify standards sources
WORKFLOW.md, CONTEXT.md, DESIGN.md, docs/adr/, PLAN.md, tsconfig/eslint

### 4. Run both axes separately

**Standards axis** — does code conform to repo's documented standards?
- Per file/hunk: every violation, cite the standard, distinguish hard violations from judgement calls

**Spec axis** — does code faithfully implement the spec?
- Missing/partial requirements, scope creep, wrong implementation. Quote the spec line.

### 5. Report
Present under `## Standards` and `## Spec` headings. One-line verdict:
- **Passes** — no findings
- **Needs changes** — count per axis + worst issue
- **Blockers** — security, data loss, spec contradiction

| Category | Examples |
|----------|---------|
| Correctness | Logic errors, missing edge cases, null/undefined paths |
| Security | Secrets in code, missing auth checks, injection vectors |
| Performance | N+1 queries, unbounded loops, missing pagination |
| Architecture | Layering violations, circular dependencies |
| Domain language | Terms conflicting with CONTEXT.md |
| Design compliance | UI violating DESIGN.md rules |
| Spec fidelity | Missing AC, scope creep, wrong behaviour |

### When to run
- After every AFK session, before merging, on demand.

---

## QA Fix Loop

When review finds issues:

```
In Progress → Needs Review → [issues found] → Fixing → Needs Review → Done
```

### Protocol
1. Read review findings (Linear comments)
2. Move issue → Fixing (or In Progress)
3. Fix in priority order: blockers → spec → standards
4. Run feedback loop after each fix
5. Do NOT add features while fixing
6. Post fix comment: what was fixed, what wasn't (with rationale), test results
7. Move issue → Needs Review
8. Update PROGRESS.md

### Hard rules
- Fixes scoped to review findings only
- Every fix gets re-tested
- New test failure → stop and investigate
- Multiple rounds are normal
- README/portfolio updates carry forward

---

## README updates

After every phase completion, update README.md to reflect current codebase state:
- Project description (what it does TODAY)
- Setup instructions (env vars, install commands)
- Available features (currently working)
- Tech stack (currently integrated)
- Project structure (current file tree)

---

## Portfolio Checkpoint

After each slice, include in the Linear completion comment:

```markdown
### 📋 Portfolio Checkpoint
**What you built:** [1 sentence, plain English]
**Why it matters:** [1 sentence — the business/user problem this solves]
**Key concept learned:** [the main technical concept from this slice]
**Architecture decision:** [1 sentence — "We chose X over Y because Z"]
**Update your portfolio:** Add this to your case study under [section name]
```

---

## Commit / Checkpoint hygiene

- One checkpoint per completed slice
- Titles: `phase-N: <verb> <thing>` (e.g., `phase-0: scaffold nextjs + clerk auth`)
- Don't include `node_modules`, `.env.local`, or generated data
