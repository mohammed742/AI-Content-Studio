/**
 * Railway infrastructure for AI Content Studio.
 *
 * Replaces the deprecated railway.json / railway.toml config-as-code path
 * (Railway stops honouring those on 2026-12-01).
 *
 * Secrets are deliberately absent — they are set per environment with
 * `railway variable set` (see DEPLOYMENT.md § 3). Only non-secret, non-
 * environment-specific values belong in this file.
 */
import { defineRailway, github, project, service } from "railway/iac";

const REPO = "mohammed742/AI-Content-Studio";

export default defineRailway(() => {
  /**
   * The Next.js app (`artifacts/web`). Root directory is the repo root, not
   * artifacts/web: this is a shared pnpm workspace and the `catalog:` versions
   * in pnpm-workspace.yaml only resolve from there.
   *
   * `start` runs the package's own script, which already binds 0.0.0.0 and
   * reads $PORT.
   */
  const web = service("web", {
    source: github(REPO),
    build: "pnpm --filter @workspace/web build",
    start: "pnpm --filter @workspace/web start",
    // No dedicated health endpoint exists; `/` is the public landing page and
    // renders without touching Neon, so a 200 here means the app booted and
    // env validation passed.
    healthcheck: "/",
    healthcheckTimeout: 300,
    env: {
      NEXT_PUBLIC_CLERK_SIGN_IN_URL: "/sign-in",
      NEXT_PUBLIC_CLERK_SIGN_UP_URL: "/sign-up",
    },
  });

  /**
   * Scheduled publishing (DEV-42). One-shot job: POST /api/cron/publish, log,
   * exit. Replaces the Replit Scheduled Deployment the route's docblock assumes.
   *
   * ⚠️ The schedule itself is NOT expressible here — the IaC authoring format
   * has no `cronSchedule` field yet (`railway config migrate` demotes it, and
   * `builder`/`preDeployCommand`/`watchPatterns`, to comments). It is set once
   * after the service exists, with the command in the line comment below.
   * Re-check on the next CLI upgrade; move it here when the field lands.
   */
  // railway environment edit \
  //   --service-config cron-publish deploy.cronSchedule "*/15 * * * *"
  const cronPublish = service("cron-publish", {
    source: github(REPO),
    build: "echo 'cron service: nothing to build'",
    start: "node deploy/railway/cron-publish.mjs",
    env: {
      // Railway's private network is IPv6-only and `next start --hostname
      // 0.0.0.0` binds IPv4, so this must go over the public domain.
      CRON_TARGET_URL: "https://${{web.RAILWAY_PUBLIC_DOMAIN}}/api/cron/publish",
    },
  });

  return project("ai-content-studio", {
    resources: [web, cronPublish],
  });
});
