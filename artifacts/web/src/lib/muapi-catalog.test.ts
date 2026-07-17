/**
 * STU-C1: Unit tests for the Muapi catalog service.
 *
 * Node's built-in test runner + native TS type-stripping (PROGRESS.md → DEV-15).
 * All network is faked via an injected `fetchFn`; no real HTTP, instant.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  MuapiCatalog,
  inputTypeForCategory,
  type CatalogModel,
} from "./muapi-catalog.ts";

/** Build a fake `fetch` returning the given catalog, counting calls. */
function fakeCatalogFetch(
  models: Array<Partial<RawModel> & { name: string }>,
  counter?: { calls: number },
): typeof fetch {
  return (async () => {
    if (counter) counter.calls += 1;
    return new Response(JSON.stringify({ models }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }) as unknown as typeof fetch;
}

interface RawModel {
  name: string;
  category: string;
  cost: number;
  dynamic_pricing: boolean;
  estimate_endpoint: string;
}

test("inputTypeForCategory maps text-source categories to text, else image", () => {
  assert.equal(inputTypeForCategory("Text to Image"), "text");
  assert.equal(inputTypeForCategory("Text to Video"), "text");
  assert.equal(inputTypeForCategory("Image to Image"), "image");
  assert.equal(inputTypeForCategory("Image to Video"), "image");
  assert.equal(inputTypeForCategory("Audio to Video"), "image");
  assert.equal(inputTypeForCategory("Video to Video"), "image");
});

test("tryLoad parses the catalog into a name→model map", async () => {
  const catalog = new MuapiCatalog({
    fetchFn: fakeCatalogFetch([
      {
        name: "nano-banana-2",
        category: "Text to Image",
        cost: 0.06,
        dynamic_pricing: true,
        estimate_endpoint: "/api/v1/models/nano-banana-2/estimate-cost",
      },
    ]),
  });
  const models = await catalog.tryLoad();
  assert.ok(models);
  const model = models.get("nano-banana-2") as CatalogModel;
  assert.equal(model.category, "Text to Image");
  assert.equal(model.cost, 0.06);
  assert.equal(model.dynamicPricing, true);
  assert.equal(model.estimateEndpoint, "/api/v1/models/nano-banana-2/estimate-cost");
});

test("caches within the TTL (single fetch) and refetches after it expires", async () => {
  const counter = { calls: 0 };
  let clock = 1_000;
  const catalog = new MuapiCatalog({
    fetchFn: fakeCatalogFetch(
      [{ name: "m", category: "Text to Image", cost: 1, dynamic_pricing: false }],
      counter,
    ),
    now: () => clock,
    ttlMs: 100,
  });

  await catalog.tryLoad();
  await catalog.tryLoad();
  assert.equal(counter.calls, 1, "second call within TTL is cached");

  clock += 200; // past TTL
  await catalog.tryLoad();
  assert.equal(counter.calls, 2, "call after TTL refetches");
});

test("serves the stale snapshot when a refetch fails", async () => {
  const counter = { calls: 0 };
  let clock = 0;
  let failNext = false;
  const fetchFn = (async () => {
    counter.calls += 1;
    if (failNext) throw new Error("network down");
    return new Response(
      JSON.stringify({
        models: [{ name: "m", category: "Text to Image", cost: 2 }],
      }),
      { status: 200 },
    );
  }) as unknown as typeof fetch;

  const catalog = new MuapiCatalog({ fetchFn, now: () => clock, ttlMs: 10 });
  const first = await catalog.tryLoad();
  assert.equal(first?.get("m")?.cost, 2);

  clock = 100; // expire the cache
  failNext = true;
  const second = await catalog.tryLoad();
  assert.equal(second?.get("m")?.cost, 2, "falls back to stale snapshot");
});

test("tryLoad returns null when unreachable with no cached snapshot", async () => {
  const fetchFn = (async () => {
    throw new Error("network down");
  }) as unknown as typeof fetch;
  const catalog = new MuapiCatalog({ fetchFn });
  assert.equal(await catalog.tryLoad(), null);
});

test("getModel returns the model, or undefined when absent", async () => {
  const catalog = new MuapiCatalog({
    fetchFn: fakeCatalogFetch([
      { name: "present", category: "Image to Image", cost: 0.01, dynamic_pricing: false },
    ]),
  });
  assert.equal((await catalog.getModel("present"))?.name, "present");
  assert.equal(await catalog.getModel("absent"), undefined);
});
