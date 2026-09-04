# Deployment — Railway

How AI Content Studio ships to [Railway](https://railway.com). Replaces the Replit
autoscale deployment described in `.replit`; that file is left in place for the
Replit dev workspace and is ignored by Railway.

---

## 1. Topology

Two services in one Railway project, both built from this repo, both sourced
from GitHub (`mohammed742/AI-Content-Studio`, branch `main`) so a push to `main`
redeploys:

| Service | What it is | Config file |
|---|---|---|
| `web` | The Next.js 15 app (`artifacts/web`) — UI, Server Actions, API routes, webhooks | `.railway/railway.ts` |
| `cron-publish` | One-shot job that pings `POST /api/cron/publish` every 15 min (DEV-42 scheduled publishing) | `.railway/railway.ts` + one CLI command (see §4) |

This is a **shared pnpm monorepo**, so **both services use the repo root as their
Root Directory** — the workspace catalog (`pnpm-workspace.yaml`) and the single
lockfile live there. Do *not* set Root Directory to `artifacts/web`; the build
will fail resolving `catalog:` versions.

`artifacts/api-server` is a leftover Replit Express scaffold (a `/health` route
and nothing else). It is **not deployed**.

External dependencies are unchanged: Neon (Postgres + pgvector), Clerk, Muapi,
OpenAI, Cloudflare R2.

---

## 2. Prerequisites

- Railway CLI installed and authenticated (`railway login`).
  Install with `npm i -g @railway/cli` — Homebrew has no bottle for macOS 12 and
  falls back to a from-source Rust build that does not complete.
- The GitHub repo connected to Railway. Because the source is GitHub, Railway
  builds **`origin/main`** — not your working tree. Anything uncommitted is not
  in the deploy. `HEAD` and its lockfile are self-consistent, so an out-of-date
  `main` still *builds*; it just ships without the newer work.

---

## 3. Environment variables

Everything is validated by `artifacts/web/src/env.ts` (Zod). A missing or malformed
value throws at boot — the container will crash-loop rather than serve a broken app.

Set these on the **`web`** service:

| Variable | Needed at | Notes |
|---|---|---|
| `DATABASE_URL` | build + runtime | Neon pooled connection string |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | **build** + runtime | Inlined into the client bundle at build time — if it is missing during the build, auth is broken in the shipped bundle even if you add it later. Must start with `pk_` |
| `CLERK_SECRET_KEY` | runtime | |
| `NEXT_PUBLIC_CLERK_SIGN_IN_URL` | build + runtime | `/sign-in` — already declared in `.railway/railway.ts`, no action needed |
| `NEXT_PUBLIC_CLERK_SIGN_UP_URL` | build + runtime | `/sign-up` — same |
| `CLERK_WEBHOOK_SECRET` | runtime | Svix signing secret for `/api/webhooks/clerk` |
| `MUAPI_API_KEY` | runtime | Visual generation + social publishing |
| `OPENAI_API_KEY` | runtime | Text generation + embeddings |
| `R2_ACCOUNT_ID` | runtime | |
| `R2_ACCESS_KEY_ID` | runtime | |
| `R2_SECRET_ACCESS_KEY` | runtime | |
| `R2_BUCKET_NAME` | runtime | |
| `R2_PUBLIC_URL` | runtime | Trailing slash is stripped automatically |
| `CRON_SECRET` | runtime | Optional in the schema on purpose — unset makes `/api/cron/publish` fail closed with 503 rather than stopping the app booting. Set it if you want scheduled publishing |
| `NODE_ENV` | — | Railway sets `production`; do not override |
| `PORT` | — | Injected by Railway; the start command reads it |

Set these on the **`cron-publish`** service:

| Variable | Value |
|---|---|
| `CRON_TARGET_URL` | `https://${{web.RAILWAY_PUBLIC_DOMAIN}}/api/cron/publish` — already declared in `.railway/railway.ts` |
| `CRON_SECRET` | must match `web` byte for byte; set it explicitly (see §4) |

> Railway's private network is IPv6-only and the web service binds `0.0.0.0`
> (IPv4), so the cron job must go over the **public** domain. Keep `CRON_SECRET`
> strong — that URL is reachable from the internet by design.

Local values live in `artifacts/web/.env.local` (gitignored). Push them with
`deploy/railway/sync-env.sh` (see §4); compare against Railway with
`railway variable list --service web`.

**This deployment currently reuses the Clerk dev/test keys** — a deliberate call
for a first staging URL. Clerk test instances are rate-limited and not intended
for real users, so a production Clerk instance is required before this URL is
put in front of anyone. See §5.2.

---

## 4. First deploy

Infrastructure lives in **`.railway/railway.ts`** (Infrastructure as Code).
`railway.json` / `railway.toml` config-as-code is deprecated — Railway stops
honouring it on **2026-12-01** — so do not reintroduce those files.

> **Gap to know about:** the IaC authoring format has no `cronSchedule` field
> yet, and none for `builder`, `preDeployCommand`, `dockerfilePath` or
> `watchPatterns` either — `railway config migrate` demotes all of them to
> comments. The cron *service* is declared in `railway.ts`; its *schedule* is one
> extra CLI command below. Re-check after a CLI upgrade.

Create and link the project:

```bash
railway init --name ai-content-studio
```

Preview what the authoring file would create — this is read-only and safe:

```bash
railway config plan
```

Apply it. This creates both services and starts the first build:

```bash
railway config apply
```

Set the cron schedule, which IaC cannot express:

```bash
railway environment edit --service-config cron-publish deploy.cronSchedule "*/15 * * * *"
```

Push the secrets. `deploy/railway/sync-env.sh` reads `artifacts/web/.env.local`
and sets each key on the `web` service; it prints key names only, never values.
Run it yourself rather than delegating it:

```bash
./deploy/railway/sync-env.sh
```

```bash
./deploy/railway/sync-env.sh --apply
```

Mirror `CRON_SECRET` onto the cron service (the script prints this command too)
and confirm both services are healthy:

```bash
railway status
```

## 5. After the first successful deploy

1. **Assign the domain.** Railway generates `*.up.railway.app`; attach the real
   domain in *Settings → Networking* if there is one.
2. **Clerk.** Add the Railway domain to allowed origins and repoint the webhook
   endpoint at
   `https://<domain>/api/webhooks/clerk`. Copy the new signing secret into
   `CLERK_WEBHOOK_SECRET` and redeploy. **Before real users:** create a Clerk
   production instance, swap in the `pk_live`/`sk_live` pair, and redo this step
   against it — the publishable key is inlined at build time, so that needs a
   rebuild, not just a variable change.
3. **Verify the webhook** — sign up a throwaway user and confirm a row lands in
   `users`. `middleware.ts` deliberately lets `/api/webhooks/*`, `/webhook/*` and
   `/api/cron/*` past Clerk, so a 401 here means the secret, not the matcher.
4. **Social OAuth.** `/api/social/connect` builds its `redirect_uri` from the
   incoming request origin, so it follows the domain automatically — but add the
   Railway callback URL to whatever Muapi/platform app allowlists apply, and
   **check the scheme is `https` and not `http`** on the first real connect.
   Railway terminates TLS at its proxy, and if the derived origin comes back as
   `http://` the OAuth round-trip will break. This has not been exercised yet.
5. **Cron.** Trigger the job once by hand from the dashboard and confirm a
   `[cron-publish] ok` line with a scheduler summary.
6. **Neon.** The schema is applied out-of-band via the `scripts/apply-*-ddl.mjs`
   helpers, not by a migration on deploy. There is no `preDeployCommand` — if you
   later add one, `drizzle-kit push` is not safe to run unattended.

---

## 6. Known risks and gotchas

- **FFmpeg binary.** `ffmpeg-static` downloads a platform binary in a postinstall
  script; it is listed under `onlyBuiltDependencies` in `pnpm-workspace.yaml` so
  pnpm actually runs it. If that entry is ever dropped, UGC Assembly silently
  falls back to Muapi's `video-combiner` on every render instead of failing.
  `ffprobe-static` ships prebuilt Linux binaries and needs no approval.
  `next.config.ts` keeps both out of the bundle via `serverExternalPackages`.
- **No `output: "standalone"`.** Deliberate: standalone's file tracing does not
  reliably carry the two native binaries above. The image is bigger; the render
  path works.
- **Long requests.** UGC assembly and `/api/cron/publish` (`maxDuration = 300`)
  are minutes-long. Railway does not cut requests short the way Replit autoscale
  did, but keep an eye on memory during ffmpeg encodes — that is the one step
  likely to need a bigger instance.
- **Build-time env validation.** `src/env.ts` downgrades to a warning when
  `NEXT_PHASE=phase-production-build`, so a build can succeed with variables
  missing and then crash-loop at runtime. Read the deploy logs, not just the
  build logs.
- **`.replit` / `allowedDevOrigins`.** Replit-only leftovers. Harmless in
  production; not worth removing until Replit is fully retired.
- **Agent tooling.** `railway setup agent` installs Railway's MCP server and
  skills (deployments, logs, status, docs) into your Claude Code session. Not
  required for anything here, but it makes debugging a failed deploy much easier.
