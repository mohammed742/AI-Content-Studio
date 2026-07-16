/**
 * DEV-15: Unit tests for the Muapi.ai integration service.
 *
 * Runs on Node's built-in test runner with native TypeScript type-stripping
 * (Node 24) — no Vite/esbuild, because this workspace deliberately strips the
 * native esbuild/rollup binaries Vitest depends on. See PROGRESS.md (DEV-15).
 *
 * The service is exercised with an injected fake `fetch` and a no-op `sleep`,
 * so retry/backoff/timeout paths run instantly and deterministically without
 * touching the network or the real API key.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  MuapiService,
  MuapiError,
  type PipelineLogEntry,
} from "./muapi.ts";

interface JsonResponseInit {
  status?: number;
  costHeader?: string;
}

function jsonResponse(body: unknown, init: JsonResponseInit = {}): Response {
  const headers = new Headers({ "content-type": "application/json" });
  if (init.costHeader !== undefined) {
    headers.set("X-MuAPI-Cost-USD", init.costHeader);
  }
  return new Response(JSON.stringify(body), {
    status: init.status ?? 200,
    headers,
  });
}

/** A fake fetch that returns queued responses in order and records calls. */
function fakeFetch(responseFactories: Array<() => Response>) {
  const calls: string[] = [];
  const fn = (async (url: string | URL | Request) => {
    calls.push(String(url));
    const next = responseFactories.shift();
    if (!next) {
      throw new Error("fakeFetch: no more responses queued");
    }
    return next();
  }) as unknown as typeof fetch;
  return { fn, calls };
}

function makeService(
  fetchFn: typeof fetch,
  overrides: Partial<{
    sleepCalls: number[];
    maxRetries: number;
    baseDelayMs: number;
    pollTimeoutMs: number;
    logger: (e: PipelineLogEntry) => void;
  }> = {},
) {
  const sleepCalls = overrides.sleepCalls ?? [];
  return new MuapiService({
    apiKey: "test-key",
    fetchFn,
    sleep: async (ms: number) => {
      sleepCalls.push(ms);
    },
    baseDelayMs: overrides.baseDelayMs ?? 1,
    pollIntervalMs: 0,
    pollTimeoutMs: overrides.pollTimeoutMs ?? 10_000,
    maxRetries: overrides.maxRetries ?? 3,
    logger: overrides.logger,
  });
}

test("happy path: submits then polls to completion, returns outputs + cost", async () => {
  const { fn, calls } = fakeFetch([
    () => jsonResponse({ request_id: "req-1", status: "queued" }, { costHeader: "0.01" }),
    () =>
      jsonResponse(
        { id: "req-1", status: "completed", outputs: ["https://cdn/img-1.png"] },
        { costHeader: "0.03" },
      ),
  ]);
  const service = makeService(fn);

  const result = await service.generate("nano-banana-2", { prompt: "a cat" });

  assert.deepEqual(result.outputs, ["https://cdn/img-1.png"]);
  assert.equal(result.imageUrl, "https://cdn/img-1.png");
  assert.equal(result.model, "nano-banana-2");
  assert.equal(result.requestId, "req-1");
  assert.equal(result.cost, 0.03); // latest header wins (poll overrides submit)
  assert.equal(calls.length, 2);
});

test("cost falls back to the response body when the header is absent", async () => {
  const { fn } = fakeFetch([
    () => jsonResponse({ request_id: "req-2", status: "queued" }),
    () =>
      jsonResponse({
        id: "req-2",
        status: "completed",
        outputs: ["https://cdn/img-2.png"],
        cost: { amount_usd: 0.05 },
      }),
  ]);
  const service = makeService(fn);

  const result = await service.generate("nano-banana-2", { prompt: "x" });

  assert.equal(result.cost, 0.05);
});

test("retries the submit on HTTP 429 then succeeds", async () => {
  const { fn, calls } = fakeFetch([
    () => jsonResponse({ detail: "rate limited" }, { status: 429 }),
    () => jsonResponse({ detail: "rate limited" }, { status: 429 }),
    () => jsonResponse({ request_id: "req-3", status: "queued" }),
    () => jsonResponse({ id: "req-3", status: "completed", outputs: ["https://cdn/3.png"] }),
  ]);
  const service = makeService(fn);

  const result = await service.generate("nano-banana-2", { prompt: "x" });

  assert.equal(result.imageUrl, "https://cdn/3.png");
  assert.equal(calls.length, 4); // 2 failed submits + 1 ok submit + 1 poll
});

test("retries on HTTP 500", async () => {
  const { fn, calls } = fakeFetch([
    () => jsonResponse({ detail: "server error" }, { status: 500 }),
    () => jsonResponse({ request_id: "req-4", status: "queued" }),
    () => jsonResponse({ id: "req-4", status: "completed", outputs: ["https://cdn/4.png"] }),
  ]);
  const service = makeService(fn);

  const result = await service.generate("nano-banana-2", { prompt: "x" });

  assert.equal(result.imageUrl, "https://cdn/4.png");
  assert.equal(calls.length, 3);
});

test("does NOT retry on a non-retryable 400 and throws a typed error", async () => {
  const { fn, calls } = fakeFetch([
    () => jsonResponse({ detail: "bad request" }, { status: 400 }),
  ]);
  const service = makeService(fn);

  await assert.rejects(
    () => service.generate("nano-banana-2", { prompt: "x" }),
    (err: unknown) => {
      assert.ok(err instanceof MuapiError);
      assert.equal(err.status, 400);
      assert.equal(err.retryable, false);
      return true;
    },
  );
  assert.equal(calls.length, 1);
});

test("gives up after maxRetries and throws a retryable error", async () => {
  const { fn, calls } = fakeFetch([
    () => jsonResponse({ detail: "rl" }, { status: 429 }),
    () => jsonResponse({ detail: "rl" }, { status: 429 }),
    () => jsonResponse({ detail: "rl" }, { status: 429 }),
  ]);
  const service = makeService(fn, { maxRetries: 2 });

  await assert.rejects(
    () => service.generate("nano-banana-2", { prompt: "x" }),
    (err: unknown) => {
      assert.ok(err instanceof MuapiError);
      assert.equal(err.status, 429);
      assert.equal(err.retryable, true);
      return true;
    },
  );
  assert.equal(calls.length, 3); // 1 initial + 2 retries
});

test("uses exponential backoff delays between retries", async () => {
  const sleepCalls: number[] = [];
  const { fn } = fakeFetch([
    () => jsonResponse({}, { status: 429 }),
    () => jsonResponse({}, { status: 429 }),
    () => jsonResponse({}, { status: 429 }),
    () => jsonResponse({}, { status: 429 }),
  ]);
  const service = makeService(fn, { maxRetries: 3, baseDelayMs: 10, sleepCalls });

  await assert.rejects(() => service.generate("m", { prompt: "x" }));

  assert.deepEqual(sleepCalls, [10, 20, 40]); // base * 2^(n-1)
});

test("throws when the generation reports a failed status", async () => {
  const { fn } = fakeFetch([
    () => jsonResponse({ request_id: "req-5", status: "queued" }),
    () => jsonResponse({ id: "req-5", status: "failed", error: "nsfw content" }),
  ]);
  const service = makeService(fn);

  await assert.rejects(
    () => service.generate("m", { prompt: "x" }),
    (err: unknown) => {
      assert.ok(err instanceof MuapiError);
      assert.match(err.message, /failed/);
      assert.match(err.message, /nsfw content/);
      return true;
    },
  );
});

test("throws a timeout error when polling never completes", async () => {
  const { fn, calls } = fakeFetch([
    () => jsonResponse({ request_id: "req-6", status: "queued" }),
    () => jsonResponse({ id: "req-6", status: "processing" }),
  ]);
  const service = makeService(fn, { pollTimeoutMs: 0 });

  await assert.rejects(
    () => service.generate("m", { prompt: "x" }),
    (err: unknown) => {
      assert.ok(err instanceof MuapiError);
      assert.match(err.message, /timed out/);
      return true;
    },
  );
  assert.equal(calls.length, 2); // submit + one poll before the deadline check
});

test("throws when completed with an empty outputs array", async () => {
  const { fn } = fakeFetch([
    () => jsonResponse({ request_id: "req-7", status: "queued" }),
    () => jsonResponse({ id: "req-7", status: "completed", outputs: [] }),
  ]);
  const service = makeService(fn);

  await assert.rejects(
    () => service.generate("m", { prompt: "x" }),
    /no outputs/,
  );
});

test("emits a pipeline log entry on success", async () => {
  const entries: PipelineLogEntry[] = [];
  const { fn } = fakeFetch([
    () => jsonResponse({ request_id: "req-8", status: "queued" }),
    () =>
      jsonResponse(
        { id: "req-8", status: "completed", outputs: ["https://cdn/8.png"] },
        { costHeader: "0.02" },
      ),
  ]);
  const service = makeService(fn, { logger: (e) => entries.push(e) });

  await service.generate("nano-banana-2", { prompt: "x" }, { step: "execute:image" });

  assert.equal(entries.length, 1);
  assert.equal(entries[0].step, "execute:image");
  assert.equal(entries[0].model, "nano-banana-2");
  assert.equal(entries[0].success, true);
  assert.equal(entries[0].cost, 0.02);
  assert.equal(typeof entries[0].durationMs, "number");
});

test("emits a failure pipeline log entry when the call errors", async () => {
  const entries: PipelineLogEntry[] = [];
  const { fn } = fakeFetch([
    () => jsonResponse({ detail: "bad" }, { status: 400 }),
  ]);
  const service = makeService(fn, { logger: (e) => entries.push(e) });

  await assert.rejects(() => service.generate("m", { prompt: "x" }));

  assert.equal(entries.length, 1);
  assert.equal(entries[0].success, false);
  assert.ok(entries[0].error && entries[0].error.length > 0);
});
