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
- **A domain you control.** The deployed app is backed by a Clerk **production**
  instance, and Clerk validates a production instance by DNS records on your own
  domain. A `*.up.railway.app` subdomain cannot work — you cannot add CNAME
  records to `railway.app`. See §5 for the full sequence.
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
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | **build** + runtime | `pk_live_…` from the **production** instance. Inlined into the client bundle at build time — if it is missing or wrong during the build, auth is broken in the shipped bundle even if you fix the variable later. Changing it needs a **rebuild**, not a restart |
| `CLERK_SECRET_KEY` | runtime | `sk_live_…` from the **production** instance |
| `NEXT_PUBLIC_CLERK_SIGN_IN_URL` | build + runtime | `/sign-in` — already declared in `.railway/railway.ts`, no action needed |
| `NEXT_PUBLIC_CLERK_SIGN_UP_URL` | build + runtime | `/sign-up` — same |
| `CLERK_WEBHOOK_SECRET` | runtime | Svix signing secret for `/api/webhooks/clerk`, taken from the **production** instance's webhook endpoint — a different value from the dev instance's |
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

Non-Clerk values (`DATABASE_URL`, `MUAPI_API_KEY`, `OPENAI_API_KEY`, `R2_*`,
`CRON_SECRET`) are the same in both instances and live in
`artifacts/web/.env.local`.

**The Clerk values are not.** This deployment is backed by a Clerk **production**
instance, and production keys are locked to your domain — Clerk rejects them on
localhost with `Production Keys are only allowed for domain "your-domain.com"`.
So they cannot replace the dev values you develop against. Keep them in a
separate `artifacts/web/.env.production.local` (gitignored by `.env.*.local`);
`deploy/railway/env.production.example` is the template.

`deploy/railway/sync-env.sh` pushes a file's values to the `web` service and
**refuses to push `pk_test_` / `sk_test_` keys** so a test-key deploy cannot
happen by accident. Compare against Railway with
`railway variable list --service web`.

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

Push the secrets. Because the app is backed by a Clerk **production** instance,
prepare `artifacts/web/.env.production.local` first (see §3 and §5) — the sync
script refuses `pk_test_` / `sk_test_` keys. Dry-run it, then apply. It prints
key names only, never values; run it yourself rather than delegating it:

```bash
./deploy/railway/sync-env.sh --file artifacts/web/.env.production.local
```

```bash
./deploy/railway/sync-env.sh --file artifacts/web/.env.production.local --apply
```

Mirror `CRON_SECRET` onto the cron service (the script prints this command too)
and confirm both services are healthy:

```bash
railway status
```

> **Ordering:** the Clerk publishable key is inlined at build time, so if you
> apply the config before the production keys exist, the first build ships a
> bundle without them. That is recoverable — set the variables and
> `railway redeploy --service web` — but it is not fixed by a restart alone.
> §5 has the full sequence.

---

## 5. Domain + Clerk production instance

**Do this before putting the URL in front of anyone.** The order matters: the
Clerk publishable key is inlined into the client bundle at build time, so it has
to be correct *before* the build you intend to ship.

### 5.1 Attach the custom domain

Railway generates a `*.up.railway.app` host on first deploy. That is fine for a
smoke test, but Clerk cannot issue a production instance against it — Clerk
validates production by DNS records, and you cannot add CNAMEs to `railway.app`.

In Railway *Settings → Networking → Custom Domain*, add your domain (or a
subdomain such as `app.yourdomain.com`) and create the CNAME Railway shows you.

### 5.2 Create the Clerk production instance

In the Clerk Dashboard, create a **production** instance for the same
application, then:

1. Add the DNS records Clerk lists under **Domains** — typically CNAMEs for
   `clerk`, `accounts`, and the `clkmail` / DKIM mail records. Propagation can
   take up to 48 hours.
2. If your DNS is behind Cloudflare, set these records to **DNS-only** (grey
   cloud). Clerk's validation is a DNS check and fails against a proxied record.
3. If the app lives on a subdomain, Clerk asks whether it is a **Primary** or
   **Secondary** application — Primary keeps Clerk on the root domain
   (`clerk.yourdomain.com`), Secondary scopes it to the subdomain.
4. Copy the `pk_live_` / `sk_live_` pair from **API keys**.
5. Configure the OAuth providers again if any are used — a production instance
   does **not** inherit the development instance's shared credentials, and Clerk's
   dev-mode shared OAuth apps are not available in production.

### 5.3 Repoint the webhook

Add a webhook endpoint on the **production** instance pointing at
`https://<your-domain>/api/webhooks/clerk`, subscribed to the same user events
the dev instance uses. Copy its **signing secret** — it is a different value from
the dev instance's.

### 5.4 Push the values and rebuild

Fill in `artifacts/web/.env.production.local` from
`deploy/railway/env.production.example`, then:

```bash
./deploy/railway/sync-env.sh --file artifacts/web/.env.production.local --apply
```

A rebuild is required, not just a restart, because of the build-time inlining:

```bash
railway redeploy --service web
```

### 5.5 Verify

1. **Sign up a throwaway user** on the real domain and confirm a row lands in
   `users`. That exercises the webhook end to end. `middleware.ts` deliberately
   lets `/api/webhooks/*`, `/webhook/*` and `/api/cron/*` past Clerk, so a 401
   here is the signing secret, not the matcher.
2. **Check the shipped bundle carries the live key** — a `pk_test_` string in the
   served JS means the build predates the variable change:

   ```bash
   curl -s https://<your-domain>/ | grep -o 'pk_[a-z]*_' | sort -u
   ```

3. **Social OAuth.** `/api/social/connect` builds its `redirect_uri` from the
   incoming request origin, so it follows the domain automatically — but add the
   callback URL to whatever Muapi/platform app allowlists apply, and **check the
   scheme is `https` and not `http`** on the first real connect. Railway
   terminates TLS at its proxy, and if the derived origin comes back as `http://`
   the OAuth round-trip breaks. This has not been exercised yet.
4. **Cron.** Trigger the job once by hand from the dashboard and confirm a
   `[cron-publish] ok` line with a scheduler summary.
5. **Neon.** The schema is applied out-of-band via the `scripts/apply-*-ddl.mjs`
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
- **Clerk production keys are domain-locked.** They only work on the domain the
  production instance is verified against, so they cannot be dropped into
  `.env.local` for local development — local dev keeps using the dev instance's
  `pk_test_` pair. Two instances means two sets of OAuth provider credentials and
  two webhook signing secrets; a "webhook works locally, 401s in production"
  report is almost always the wrong secret rather than a code bug.
- **The publishable key is baked into the build.** Every other variable takes
  effect on restart; this one needs `railway redeploy`. `curl`-ing the served
  page for `pk_test_` (see §5.5) is the fastest way to catch a stale bundle.
- **`.replit` / `allowedDevOrigins`.** Replit-only leftovers. Harmless in
  production; not worth removing until Replit is fully retired.
- **Agent tooling.** `railway setup agent` installs Railway's MCP server and
  skills (deployments, logs, status, docs) into your Claude Code session. Not
  required for anything here, but it makes debugging a failed deploy much easier.
