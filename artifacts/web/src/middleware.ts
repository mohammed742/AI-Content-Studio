import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

const isProtectedRoute = createRouteMatcher([
  "/dashboard(.*)",
  "/onboarding(.*)",
  "/plan(.*)",
  "/calendar(.*)",
  "/gallery(.*)",
  "/library(.*)",
  "/presenters(.*)",
  "/social(.*)",
]);
const isWebhookRoute = createRouteMatcher([
  "/api/webhooks(.*)",
  "/webhook(.*)",
]);
// DEV-42: the scheduled-publishing cron. Machine-called like the webhooks, with
// no Clerk session to find — it authenticates itself with a bearer secret.
const isCronRoute = createRouteMatcher(["/api/cron(.*)"]);
const isAuthRoute = createRouteMatcher(["/sign-in(.*)", "/sign-up(.*)"]);

export default clerkMiddleware(async (auth, req) => {
  if (isWebhookRoute(req) || isCronRoute(req)) {
    return;
  }

  const { userId } = await auth();

  // Redirect authenticated users away from sign-in/sign-up pages
  if (isAuthRoute(req) && userId) {
    return NextResponse.redirect(new URL("/dashboard", req.url));
  }

  // Protect dashboard and redirect unauthenticated users to sign-in
  if (isProtectedRoute(req)) {
    await auth.protect();
  }
});

export const config = {
  matcher: [
    // Skip Next.js internals and all static files
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    // Always run for API routes
    "/(api|trpc)(.*)",
  ],
};
