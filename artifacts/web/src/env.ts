/**
 * Server-side environment variable validation (Zod).
 * Client-safe vars must use NEXT_PUBLIC_ prefix.
 *
 * Expand this file in each Phase 0 slice:
 *   DEV-1  — DATABASE_URL
 *   DEV-2  — CLERK_PUBLISHABLE_KEY, CLERK_SECRET_KEY
 *   DEV-4  — CLERK_WEBHOOK_SECRET
 *   DEV-7  — MUAPI_API_KEY, OPENAI_API_KEY, R2_ACCOUNT_ID, R2_ACCESS_KEY_ID,
 *            R2_SECRET_ACCESS_KEY, R2_BUCKET_NAME
 *
 * Note: CLERK_PUBLISHABLE_KEY is validated server-side and passed explicitly
 * to ClerkProvider as a prop — this avoids relying on NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY
 * being correctly set in the environment.
 */
import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z
    .enum(["development", "production", "test"])
    .default("development"),
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: z
    .string()
    .min(1, "NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY is required")
    .refine((v) => v.startsWith("pk_"), {
      message: "NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY must start with 'pk_'",
    }),
  CLERK_SECRET_KEY: z.string().min(1, "CLERK_SECRET_KEY is required"),
  NEXT_PUBLIC_CLERK_SIGN_IN_URL: z
    .string()
    .min(1, "NEXT_PUBLIC_CLERK_SIGN_IN_URL is required")
    .default("/sign-in"),
  NEXT_PUBLIC_CLERK_SIGN_UP_URL: z
    .string()
    .min(1, "NEXT_PUBLIC_CLERK_SIGN_UP_URL is required")
    .default("/sign-up"),
  CLERK_WEBHOOK_SECRET: z
    .string()
    .min(1, "CLERK_WEBHOOK_SECRET is required"),
  MUAPI_API_KEY: z.string().min(1, "MUAPI_API_KEY is required"),
  OPENAI_API_KEY: z.string().min(1, "OPENAI_API_KEY is required"),
  R2_ACCOUNT_ID: z.string().min(1, "R2_ACCOUNT_ID is required"),
  R2_ACCESS_KEY_ID: z.string().min(1, "R2_ACCESS_KEY_ID is required"),
  R2_SECRET_ACCESS_KEY: z
    .string()
    .min(1, "R2_SECRET_ACCESS_KEY is required"),
  R2_BUCKET_NAME: z.string().min(1, "R2_BUCKET_NAME is required"),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  const errors = parsed.error.flatten().fieldErrors;
  console.error("❌ Invalid environment variables:", errors);
  if (process.env.NEXT_PHASE === "phase-production-build") {
    console.warn(
      "Build phase detected — skipping env validation (server will validate at runtime)",
    );
  } else {
    throw new Error("Invalid environment variables — check server logs");
  }
}

export const env = parsed.success
  ? parsed.data
  : (process.env as unknown as z.infer<typeof envSchema>);
