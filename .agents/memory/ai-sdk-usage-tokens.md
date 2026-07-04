---
name: AI SDK v7 token usage fields
description: Correct field names for token usage on Vercel AI SDK v7 generate calls
---

In Vercel AI SDK v7 (`ai` package, `generateText`/`generateObject` etc.), the returned `usage` object exposes `inputTokens` and `outputTokens` — not the older `promptTokens`/`completionTokens` naming. Both are typed `number | undefined`.

**Why:** Relying on the old field names silently yields `undefined` (and `NaN` in downstream arithmetic) rather than a type error in loosely-typed code, so a cost calculation can look correct but always compute 0 or NaN.

**How to apply:** When computing per-call cost from token usage, read `usage.inputTokens` / `usage.outputTokens` and guard with `?? 0` before multiplying by a per-token price, since the fields can be undefined depending on provider response shape.
