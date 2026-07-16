/**
 * DEV-16: Unit tests for the Retrieval service (semantic search).
 *
 * Runs on Node's built-in test runner with native TypeScript type-stripping
 * (see PROGRESS.md → DEV-15). The query embedder and the vector search are
 * injected as fakes, so top-k defaults, kind filtering, the blank-query
 * short-circuit, formatting, and logging are verified without the network/DB.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  RetrievalService,
  formatRetrievedContext,
  DEFAULT_TOP_K,
  type QueryEmbedder,
  type VectorSearch,
  type RetrievedChunk,
} from "./retrieval.ts";
import type { PipelineLogEntry } from "./muapi.ts";

function fakeEmbedder(cost = 0.0000004): {
  fn: QueryEmbedder;
  calls: string[];
} {
  const calls: string[] = [];
  const fn: QueryEmbedder = async (text) => {
    calls.push(text);
    return { embedding: [0.1, 0.2, 0.3], cost };
  };
  return { fn, calls };
}

function fakeSearch(result: RetrievedChunk[] = []): {
  fn: VectorSearch;
  calls: Array<{ userId: string; embedding: number[]; k: number; kinds?: string[] }>;
} {
  const calls: Array<{
    userId: string;
    embedding: number[];
    k: number;
    kinds?: string[];
  }> = [];
  const fn: VectorSearch = async (userId, embedding, options) => {
    calls.push({ userId, embedding, k: options.k, kinds: options.kinds });
    return result;
  };
  return { fn, calls };
}

const CHUNKS: RetrievedChunk[] = [
  { content: "Margherita Pizza — wood-fired", kind: "product", similarity: 0.91 },
  { content: "Business name: Tony's. Brand tone: friendly.", kind: "brand_guideline", similarity: 0.74 },
];

test("formatRetrievedContext renders a bullet block, empty string when no chunks", () => {
  assert.equal(formatRetrievedContext([]), "");
  const out = formatRetrievedContext(CHUNKS);
  assert.match(out, /^Relevant brand context:/);
  assert.match(out, /- Margherita Pizza — wood-fired/);
  assert.match(out, /- Business name: Tony's/);
});

test("retrieve embeds the query and searches with the default top-k", async () => {
  const embedder = fakeEmbedder();
  const search = fakeSearch(CHUNKS);
  const service = new RetrievalService({ embedder: embedder.fn, search: search.fn });

  const chunks = await service.retrieve("user-1", "italian food");

  assert.deepEqual(embedder.calls, ["italian food"]);
  assert.equal(search.calls.length, 1);
  assert.equal(search.calls[0].userId, "user-1");
  assert.deepEqual(search.calls[0].embedding, [0.1, 0.2, 0.3]);
  assert.equal(search.calls[0].k, DEFAULT_TOP_K);
  assert.equal(search.calls[0].kinds, undefined);
  assert.deepEqual(chunks, CHUNKS);
});

test("retrieve passes through a custom k and kind filter", async () => {
  const search = fakeSearch(CHUNKS);
  const service = new RetrievalService({ embedder: fakeEmbedder().fn, search: search.fn });

  await service.retrieve("user-1", "pizza", { k: 3, kinds: ["product"] });

  assert.equal(search.calls[0].k, 3);
  assert.deepEqual(search.calls[0].kinds, ["product"]);
});

test("blank query short-circuits with no embed or search call", async () => {
  const embedder = fakeEmbedder();
  const search = fakeSearch(CHUNKS);
  const service = new RetrievalService({ embedder: embedder.fn, search: search.fn });

  const chunks = await service.retrieve("user-1", "   ");

  assert.deepEqual(chunks, []);
  assert.equal(embedder.calls.length, 0);
  assert.equal(search.calls.length, 0);
});

test("retrieveContext returns both chunks and a formatted context string", async () => {
  const service = new RetrievalService({
    embedder: fakeEmbedder().fn,
    search: fakeSearch(CHUNKS).fn,
  });

  const { chunks, context } = await service.retrieveContext("user-1", "food");

  assert.deepEqual(chunks, CHUNKS);
  assert.match(context, /Relevant brand context:/);
});

test("emits a success pipeline log entry", async () => {
  const entries: PipelineLogEntry[] = [];
  const service = new RetrievalService({
    embedder: fakeEmbedder(0.0000009).fn,
    search: fakeSearch(CHUNKS).fn,
    logger: (e) => entries.push(e),
  });

  await service.retrieve("user-1", "food");

  assert.equal(entries.length, 1);
  assert.equal(entries[0].step, "retrieve");
  assert.equal(entries[0].success, true);
  assert.equal(entries[0].cost, 0.0000009);
});

test("rethrows and logs a failure when the search throws", async () => {
  const entries: PipelineLogEntry[] = [];
  const failing: VectorSearch = async () => {
    throw new Error("db unreachable");
  };
  const service = new RetrievalService({
    embedder: fakeEmbedder().fn,
    search: failing,
    logger: (e) => entries.push(e),
  });

  await assert.rejects(() => service.retrieve("user-1", "food"), /db unreachable/);
  assert.equal(entries.length, 1);
  assert.equal(entries[0].success, false);
  assert.match(entries[0].error ?? "", /db unreachable/);
});
