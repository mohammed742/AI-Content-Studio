---
name: Artifact /api path collision
description: A scaffolded "API Server" artifact can silently claim /api at the shared proxy, swallowing a Next.js app's own /api/* routes.
---

In multi-artifact repls, the shared proxy routes by path prefix and does not rewrite paths. If a separate "API Server" artifact (Express stub) is registered with `paths = ["/api"]`, any other artifact's own routes under `/api/*` (e.g. a Next.js app's App Router API routes) are unreachable — requests are silently sent to the other service instead, which returns a generic framework 404 (e.g. Express's default `Cannot POST ...` page) rather than an obvious routing error.

**Why:** Symptom looks like "my new route doesn't exist" even though the code is correct — easy to burn time debugging the wrong layer. The API Server artifact is part of the shared bootstrap template (used for Expo backends) and may be present-but-unused in projects whose architecture doc places all API routes inside the Next.js app instead.

**How to apply:** If a new Next.js/backend route 404s with signs of hitting a different framework (check `X-Powered-By` header, generic error body), check `artifacts/*/.replit-artifact/artifact.toml` for another service already claiming the same path prefix. Resolution requires user sign-off (cross-artifact, repo-wide change): move the conflicting artifact's `previewPath`/`paths` to a distinct prefix via `verifyAndReplaceArtifactToml`, and update that artifact's own internal route mount (e.g. Express `app.use(prefix, router)`) and any OpenAPI codegen `baseUrl` to match, then rerun codegen.
