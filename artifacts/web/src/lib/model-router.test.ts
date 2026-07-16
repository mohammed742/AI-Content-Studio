/**
 * DEV-18: Unit tests for the Model Router.
 *
 * Runs on Node's built-in test runner with native TypeScript type-stripping
 * (see PROGRESS.md → DEV-15). Pure config logic — no fakes, network, or DB.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  ModelRouter,
  ROUTING_TABLE,
  type AssetType,
} from "./model-router.ts";

const ALL_ASSET_TYPES = Object.keys(ROUTING_TABLE) as AssetType[];

test("every asset type resolves to a standard model with a cost", () => {
  const router = new ModelRouter();
  for (const assetType of ALL_ASSET_TYPES) {
    const route = router.route(assetType);
    assert.ok(route.model.length > 0, `${assetType} has a model`);
    assert.equal(typeof route.estimatedCost, "number");
  }
});

test("defaults to the standard tier", () => {
  const router = new ModelRouter();
  assert.equal(router.route("social_graphic").model, "flux-schnell");
  assert.equal(router.getModel("product_photo"), "ai-product-shot");
});

test("premium tier selects the premium model when one exists", () => {
  const router = new ModelRouter();
  assert.equal(router.route("social_graphic", "premium").model, "seedream-v4");
  assert.equal(
    router.route("product_photo", "premium").model,
    "ai-product-photography",
  );
  assert.equal(router.route("reframe", "premium").model, "luma-flash-reframe");
});

test("premium falls back to standard when there is no premium model", () => {
  const router = new ModelRouter();
  const standard = router.route("background_removal", "standard");
  const premium = router.route("background_removal", "premium");
  assert.equal(premium.model, "ai-background-remover");
  assert.equal(premium.model, standard.model);
  assert.equal(premium.estimatedCost, standard.estimatedCost);
});

test("estimated cost matches the routing table", () => {
  const router = new ModelRouter();
  assert.equal(router.route("social_graphic", "standard").estimatedCost, 0.03);
  assert.equal(router.route("background_removal").estimatedCost, 0.01);
  assert.equal(router.route("video_animate", "premium").estimatedCost, 0.4);
});

test("merges caller params over the model defaults", () => {
  const router = new ModelRouter();
  const route = router.route("reframe", "standard", { aspect_ratio: "9:16" });
  assert.equal(route.params.aspect_ratio, "9:16");
});

test("caller params win over table defaults on key conflict", () => {
  const router = new ModelRouter({
    ...ROUTING_TABLE,
    social_graphic: {
      standard: {
        model: "flux-schnell",
        estimatedCost: 0.03,
        params: { aspect_ratio: "1:1" },
      },
    },
  });
  const route = router.route("social_graphic", "standard", { aspect_ratio: "16:9" });
  assert.equal(route.params.aspect_ratio, "16:9");
});

test("throws on an unknown asset type", () => {
  const router = new ModelRouter();
  assert.throws(
    () => router.route("hologram" as AssetType),
    /unknown asset type/,
  );
});
