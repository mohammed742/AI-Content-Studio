/**
 * Unit tests for the plan-item failure messages.
 *
 * Node built-in runner + native TS type-stripping (see PROGRESS.md → DEV-15).
 * The Content Plan card shows why an item failed, but the stored error is raw
 * provider output — it embeds HTTP codes, model names, and the entire generated
 * prompt. These tests pin the translation to plain English and, critically,
 * that none of that technical detail can leak into the UI (agent-driven
 * paradigm: users see content, not infrastructure).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { friendlyPlanItemError } from "./plan-errors.ts";

/** The real error that failed every product_showcase item, abbreviated. */
const REAL_422 =
  'Muapi submit failed (422 Unprocessable Entity): {"detail":[{"type":"missing",' +
  '"loc":["body","scene_description"],"msg":"Field required","input":{"prompt":' +
  '"A professional, high-quality product photograph of Haircut — Your most-booked ' +
  'treatment, for Sally\'s hair salon, a salon. luxury brand aesthetic..."}}]}';

test("translates a provider validation failure without leaking its payload", () => {
  const message = friendlyPlanItemError(REAL_422);

  assert.match(message, /couldn't|could not/i);
  // None of the raw detail may reach the user.
  assert.ok(!message.includes("422"));
  assert.ok(!/Muapi/i.test(message));
  assert.ok(!message.includes("scene_description"));
  assert.ok(!/prompt/i.test(message));
  assert.ok(!message.includes("Sally"));
  assert.ok(message.length < 200, "must stay a single readable line");
});

test("gives a retry-flavoured message when the service was busy", () => {
  for (const raw of [
    "Muapi submit failed (503 Service Unavailable): capacity",
    "Muapi submit failed (429 Too Many Requests): rate limited",
  ]) {
    const message = friendlyPlanItemError(raw);
    assert.match(message, /busy|moment|shortly|again/i);
    assert.ok(!message.includes("503"));
    assert.ok(!message.includes("429"));
  }
});

test("gives a timeout message for timeouts and network drops", () => {
  for (const raw of [
    "Muapi poll timed out after 300s",
    "fetch failed: ETIMEDOUT",
    "network error: ECONNRESET",
  ]) {
    assert.match(friendlyPlanItemError(raw), /took too long|timed out|connection|again/i);
  }
});

test("falls back to a generic line for anything unrecognized", () => {
  const message = friendlyPlanItemError("kaboom at Object.<anonymous> (/app/src/x.ts:42:11)");
  assert.match(message, /couldn't|could not|something went wrong/i);
  // A stack trace must never be shown.
  assert.ok(!message.includes("/app/src"));
  assert.ok(!message.includes("42:11"));
});

test("handles a missing or empty error without crashing the card", () => {
  for (const raw of [null, undefined, ""]) {
    const message = friendlyPlanItemError(raw);
    assert.ok(message.length > 0);
  }
});

test("never echoes the raw error verbatim", () => {
  // The guarantee the card depends on: whatever comes in, what goes out is one
  // of our own sentences, not provider text.
  for (const raw of [REAL_422, "boom", "500 Internal Server Error: <html>…</html>"]) {
    assert.notEqual(friendlyPlanItemError(raw), raw);
    assert.ok(!friendlyPlanItemError(raw).includes("<html>"));
  }
});
