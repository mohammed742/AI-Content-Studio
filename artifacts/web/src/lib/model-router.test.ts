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
import type { CatalogModel, CatalogPort } from "./muapi-catalog.ts";

const ALL_ASSET_TYPES = Object.keys(ROUTING_TABLE) as AssetType[];

/** A stubbed catalog for the resolveWithCatalog tests — no network. */
function stubCatalog(
  models: Record<string, Partial<CatalogModel>> | null,
): CatalogPort {
  return {
    async tryLoad() {
      if (models === null) return null; // simulate an unreachable catalog
      const map = new Map<string, CatalogModel>();
      for (const [name, m] of Object.entries(models)) {
        map.set(name, {
          name,
          category: m.category ?? "Text to Image",
          cost: m.cost ?? 0,
          dynamicPricing: m.dynamicPricing ?? false,
        });
      }
      return map;
    },
  };
}

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
  assert.equal(router.route("social_graphic").model, "nano-banana-2");
  assert.equal(router.getModel("product_photo"), "ai-product-shot");
});

test("premium tier selects the premium model when one exists", () => {
  const router = new ModelRouter();
  assert.equal(router.route("social_graphic", "premium").model, "flux-krea-dev");
  assert.equal(
    router.route("product_photo", "premium").model,
    "ai-product-photography",
  );
  assert.equal(router.route("reframe", "premium").model, "luma-flash-reframe");
});

test("text_graphic routes to completing models with text inputType", () => {
  const router = new ModelRouter();
  const standard = router.route("text_graphic", "standard");
  const premium = router.route("text_graphic", "premium");
  // standard was repointed off the dead `ideogram-v3-t2i` (2026-07-23).
  assert.equal(standard.model, "nano-banana-2");
  assert.equal(standard.estimatedCost, 0.06);
  assert.equal(premium.model, "nano-banana-pro");
  assert.equal(premium.estimatedCost, 0.12);
  assert.equal(standard.inputType, "text");
});

test("voiceover routes to gemini tts with text inputType; premium falls back to standard", () => {
  const router = new ModelRouter();
  const standard = router.route("voiceover", "standard");
  // 2026-07-24: swapped off the broken `elevenlabs-text-to-dialogue-v3`.
  assert.equal(standard.model, "gemini-3-1-flash-tts");
  assert.equal(standard.estimatedCost, 0.035);
  assert.equal(standard.inputType, "text");
  // Single-model asset type — premium resolves to the standard model.
  assert.equal(router.getModel("voiceover", "premium"), "gemini-3-1-flash-tts");
});

test("video_assemble routes to video-combiner; premium falls back to standard", () => {
  const router = new ModelRouter();
  const standard = router.route("video_assemble", "standard");
  assert.equal(standard.model, "video-combiner");
  assert.equal(standard.estimatedCost, 0.05);
  // "Video to Video" collapses to the image inputType (pipeline-internal op).
  assert.equal(standard.inputType, "image");
  // Single-model asset type — premium resolves to the standard model.
  assert.equal(router.getModel("video_assemble", "premium"), "video-combiner");
});

test("video_reframe routes to autocrop; premium falls back to standard", () => {
  const router = new ModelRouter();
  const standard = router.route("video_reframe", "standard");
  assert.equal(standard.model, "autocrop");
  assert.equal(standard.estimatedCost, 0.05);
  // "Video to Video" collapses to the image inputType (pipeline-internal op).
  assert.equal(standard.inputType, "image");
  // Single-model asset type — premium resolves to the standard model.
  assert.equal(router.getModel("video_reframe", "premium"), "autocrop");
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
  assert.equal(router.route("social_graphic", "standard").estimatedCost, 0.06);
  assert.equal(router.route("background_removal").estimatedCost, 0.01);
  assert.equal(router.route("video_animate", "premium").estimatedCost, 0.4);
});

test("every asset type exposes an inputType", () => {
  const router = new ModelRouter();
  for (const assetType of ALL_ASSET_TYPES) {
    const inputType = router.route(assetType).inputType;
    assert.ok(
      ["text", "image", "text+image"].includes(inputType),
      `${assetType} inputType is valid`,
    );
  }
  // Text-to-image graphics ask for text; image pipelines ask for an image.
  assert.equal(router.route("social_graphic").inputType, "text");
  assert.equal(router.route("product_photo").inputType, "image");
});

test("resolveWithCatalog overrides the fallback cost with the live price", async () => {
  const router = new ModelRouter(ROUTING_TABLE, stubCatalog({
    "nano-banana-2": { category: "Text to Image", cost: 0.999 },
  }));
  const resolved = await router.resolveWithCatalog("social_graphic", "standard");
  assert.equal(resolved.live, true);
  assert.equal(resolved.estimatedCost, 0.999, "live cost overrides the static 0.06");
  assert.equal(resolved.inputType, "text");
});

test("resolveWithCatalog fails loud when a routed model is absent from the catalog", async () => {
  // Catalog reachable but missing the routed model → drift, must throw.
  const router = new ModelRouter(ROUTING_TABLE, stubCatalog({
    "some-other-model": { category: "Text to Image", cost: 0.01 },
  }));
  await assert.rejects(
    () => router.resolveWithCatalog("social_graphic", "standard"),
    /not in the live Muapi catalog/,
  );
});

test("resolveWithCatalog falls back silently to static cost when the catalog is unreachable", async () => {
  const router = new ModelRouter(ROUTING_TABLE, stubCatalog(null));
  const resolved = await router.resolveWithCatalog("social_graphic", "standard");
  assert.equal(resolved.live, false);
  assert.equal(resolved.estimatedCost, 0.06, "uses the static fallback offline");
  assert.equal(resolved.inputType, "text");
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
      inputType: "text",
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
