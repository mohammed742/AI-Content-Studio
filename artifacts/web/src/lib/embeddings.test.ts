/**
 * DEV-17: Unit tests for the Brand Knowledge Base embedding pipeline.
 *
 * Runs on Node's built-in test runner with native TypeScript type-stripping
 * (see PROGRESS.md → DEV-15 for why not Vitest). The OpenAI embedder and the
 * database store are injected as fakes, so chunking, cost, replace-semantics,
 * and logging are verified instantly without the network or a DB.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  BrandKnowledgeBase,
  businessProfileToChunks,
  PROFILE_EMBEDDING_KINDS,
  type EmbeddableProfile,
  type EmbeddingRow,
  type BrandEmbeddingKind,
  type Embedder,
} from "./embeddings.ts";
import type { PipelineLogEntry } from "./muapi.ts";

function profile(overrides: Partial<EmbeddableProfile> = {}): EmbeddableProfile {
  return {
    businessName: "Muscle Max",
    businessType: "gym",
    brandTone: "bold",
    targetCustomers: "busy professionals 25-40",
    industry: "fitness",
    products: [
      { name: "Personal Training", description: "1:1 coaching" },
      { name: "Group Classes" },
    ],
    ...overrides,
  };
}

/** An embedder that returns a distinct fixed-length vector per input. */
function fakeEmbedder(cost = 0.000123): {
  fn: Embedder;
  calls: string[][];
} {
  const calls: string[][] = [];
  const fn: Embedder = async (texts) => {
    calls.push(texts);
    return {
      embeddings: texts.map((_, i) => [i, i + 1, i + 2]),
      cost,
    };
  };
  return { fn, calls };
}

function fakeStore() {
  const calls: Array<{
    userId: string;
    kinds: BrandEmbeddingKind[];
    rows: EmbeddingRow[];
  }> = [];
  const fn = async (
    userId: string,
    kinds: BrandEmbeddingKind[],
    rows: EmbeddingRow[],
  ) => {
    calls.push({ userId, kinds, rows });
  };
  return { fn, calls };
}

test("chunks a profile into one row per product plus a brand-guideline row", () => {
  const chunks = businessProfileToChunks(profile());

  assert.equal(chunks.length, 3);
  assert.deepEqual(
    chunks.map((c) => c.kind),
    ["product", "product", "brand_guideline"],
  );
  assert.equal(chunks[0].content, "Personal Training — 1:1 coaching");
  assert.equal(chunks[1].content, "Group Classes"); // no description
  assert.match(chunks[2].content, /Business name: Muscle Max/);
  assert.match(chunks[2].content, /Brand tone: bold/);
  assert.match(chunks[2].content, /Target customers: busy professionals/);
});

test("skips blank product names and omits absent optional guideline parts", () => {
  const chunks = businessProfileToChunks(
    profile({
      products: [{ name: "  " }, { name: "Real Product" }],
      targetCustomers: null,
      industry: null,
    }),
  );

  assert.equal(chunks.length, 2); // one valid product + guideline
  assert.equal(chunks[0].content, "Real Product");
  const guideline = chunks[1].content;
  assert.doesNotMatch(guideline, /Target customers/);
  assert.doesNotMatch(guideline, /Industry/);
});

test("always produces a brand-guideline chunk even with no products", () => {
  const chunks = businessProfileToChunks(profile({ products: [] }));
  assert.equal(chunks.length, 1);
  assert.equal(chunks[0].kind, "brand_guideline");
});

test("syncBusinessProfile embeds every chunk and stores with replace semantics", async () => {
  const embedder = fakeEmbedder(0.0005);
  const store = fakeStore();
  const kb = new BrandKnowledgeBase({ embedder: embedder.fn, store: store.fn });

  const result = await kb.syncBusinessProfile("user-1", profile());

  // Embedder called once with all three chunk contents, in order.
  assert.equal(embedder.calls.length, 1);
  assert.deepEqual(embedder.calls[0], [
    "Personal Training — 1:1 coaching",
    "Group Classes",
    businessProfileToChunks(profile())[2].content,
  ]);

  // Store called once, replacing profile-derived kinds, with embedded rows.
  assert.equal(store.calls.length, 1);
  assert.deepEqual(store.calls[0].kinds, PROFILE_EMBEDDING_KINDS);
  assert.equal(store.calls[0].userId, "user-1");
  assert.equal(store.calls[0].rows.length, 3);
  assert.deepEqual(store.calls[0].rows[0].embedding, [0, 1, 2]);
  assert.deepEqual(store.calls[0].rows[1].embedding, [1, 2, 3]);

  assert.equal(result.chunks, 3);
  assert.equal(result.cost, 0.0005);
});

test("emits a success pipeline log entry", async () => {
  const entries: PipelineLogEntry[] = [];
  const kb = new BrandKnowledgeBase({
    embedder: fakeEmbedder().fn,
    store: fakeStore().fn,
    logger: (e) => entries.push(e),
  });

  await kb.syncBusinessProfile("user-1", profile());

  assert.equal(entries.length, 1);
  assert.equal(entries[0].step, "embed");
  assert.equal(entries[0].model, "text-embedding-3-small");
  assert.equal(entries[0].success, true);
  assert.equal(typeof entries[0].durationMs, "number");
});

test("rethrows and logs a failure when the embedder throws", async () => {
  const entries: PipelineLogEntry[] = [];
  const failing: Embedder = async () => {
    throw new Error("openai down");
  };
  const store = fakeStore();
  const kb = new BrandKnowledgeBase({
    embedder: failing,
    store: store.fn,
    logger: (e) => entries.push(e),
  });

  await assert.rejects(
    () => kb.syncBusinessProfile("user-1", profile()),
    /openai down/,
  );
  // Nothing stored when embedding failed.
  assert.equal(store.calls.length, 0);
  assert.equal(entries.length, 1);
  assert.equal(entries[0].success, false);
  assert.match(entries[0].error ?? "", /openai down/);
});
