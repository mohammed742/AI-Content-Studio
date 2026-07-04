---
name: Linear workflow gap
description: The Development team's Linear workflow lacks a "Needs Review" status that replit.md's session protocol assumes exists.
---

The `replit.md` session protocol says to move completed slices to a **Needs Review** status. The actual Linear "Development" team workflow only has: Backlog, Todo, In Progress, Done, Canceled, Duplicate — no Needs Review.

**Why:** Discovered while trying to follow the end-of-session protocol for a completed slice; `saveIssue` had no matching state to move to.

**How to apply:** When completing a slice, leave the issue in **In Progress** and clearly flag in the completion comment/PROGRESS.md that a "Needs Review" status doesn't exist, rather than guessing at a substitute status. Suggest the user add the status to their Linear workflow if they want the protocol followed literally.
