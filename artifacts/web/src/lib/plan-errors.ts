/**
 * Plain-English failure messages for Content Plan items.
 *
 * When an item fails, the Generation Queue stores the raw error on the item
 * (`generation-queue.ts` → `processItem`). That text is provider output: HTTP
 * status codes, model names, JSON validation payloads, and — for image steps —
 * the entire generated prompt. Useful in logs, unshowable in the UI.
 *
 * `friendlyPlanItemError` maps it to one of our own sentences. It is
 * deliberately total: every input, including `null`, yields a sentence, and the
 * raw text is never interpolated into the result. That's the guarantee the plan
 * card relies on to satisfy the agent-driven paradigm (DESIGN §9.4 — "No
 * technical details visible: no model names, no cost per item, no prompt text").
 *
 * The raw error stays in the database and server logs for debugging.
 */

const RETRY_SOON =
  "Our image service was busy. Try again in a moment.";
const TOOK_TOO_LONG =
  "This took too long to generate. Try again.";
const GENERIC =
  "We couldn't create this one. Try again, and let us know if it keeps happening.";

/**
 * A user-safe explanation for a failed plan item. Matching is on the *shape* of
 * the failure only; nothing from `raw` is ever included in the return value.
 */
export function friendlyPlanItemError(raw?: string | null): string {
  if (!raw) {
    return GENERIC;
  }

  // Overloaded / throttled — genuinely worth retrying as-is.
  if (/\b(429|503|502|504)\b|rate.?limit|capacity|unavailable|too many requests/i.test(raw)) {
    return RETRY_SOON;
  }

  // Timeouts and dropped connections.
  if (/timed?.?out|ETIMEDOUT|ECONNRESET|ECONNREFUSED|ENOTFOUND|network/i.test(raw)) {
    return TOOK_TOO_LONG;
  }

  // A malformed request to the provider — a bug on our side, not the user's.
  // Deliberately not phrased as their fault, and retryable once we've fixed it.
  if (/\b(400|422)\b|field required|unprocessable|invalid/i.test(raw)) {
    return "We couldn't create this one — our generator rejected the request. Try again, and let us know if it keeps happening.";
  }

  return GENERIC;
}
