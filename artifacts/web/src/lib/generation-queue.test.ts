/**
 * DEV-24: Unit tests for the Generation Queue.
 *
 * Node built-in runner + native TS type-stripping (see PROGRESS.md → DEV-15).
 * All pipelines + the item-status writer are injected as fakes, so routing,
 * parallelism, failure isolation, and status transitions verify without the
 * network, R2, or DB.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  GenerationQueueService,
  matchProduct,
  type ProcessPlanRequest,
  type PhotoPipeline,
  type GraphicPipeline,
  type CaptionPipeline,
  type KitAssembler,
  type ItemUpdater,
} from "./generation-queue.ts";
import type { ContentPlanItemRecord } from "../db/schema.ts";

function item(overrides: Partial<ContentPlanItemRecord> = {}): ContentPlanItemRecord {
  return {
    id: overrides.id ?? "item-1",
    type: "product_showcase",
    title: "Showcase — Margherita Pizza",
    description: "Show off the wood-fired margherita",
    platform: "instagram",
    scheduledDay: "monday",
    estimatedCredits: 1,
    status: "pending",
    ...overrides,
  };
}

function request(items: ContentPlanItemRecord[]): ProcessPlanRequest {
  return {
    planId: "plan-1",
    userId: "user-1",
    profile: {
      businessName: "Tony's",
      businessType: "restaurant",
      brandTone: "friendly",
      products: [
        { name: "Margherita Pizza", description: "wood-fired" },
        { name: "Tiramisu" },
      ],
    },
    items,
  };
}

function fakes() {
  const photoCalls: string[] = [];
  const graphicCalls: string[] = [];
  const updates: Array<{ itemId: string; patch: Partial<ContentPlanItemRecord> }> = [];

  const photo: PhotoPipeline = async ({ product }) => {
    photoCalls.push(product.name);
    return { imageUrl: "https://gen/photo.png", cost: 0.06 };
  };
  const graphic: GraphicPipeline = async ({ topic }) => {
    graphicCalls.push(topic);
    return { imageUrl: "https://gen/graphic.png", cost: 0.03 };
  };
  const caption: CaptionPipeline = async () => ({
    caption: "caption",
    hashtags: ["pizza"],
    cost: 0.001,
  });
  const assemble: KitAssembler = async (args) => ({
    id: `kit-${args.title}`,
    mediaUrl: `https://r2/${args.title}.png`,
  });
  const updateItem: ItemUpdater = async (_planId, itemId, patch) => {
    updates.push({ itemId, patch });
  };

  return { photo, graphic, caption, assemble, updateItem, photoCalls, graphicCalls, updates };
}

test("matchProduct prefers the product named in the item, else the first", () => {
  const products = [{ name: "Tiramisu" }, { name: "Margherita Pizza" }];
  assert.equal(
    matchProduct({ title: "Showcase — Margherita Pizza", description: "" }, products)?.name,
    "Margherita Pizza",
  );
  assert.equal(
    matchProduct({ title: "Something else", description: "" }, products)?.name,
    "Tiramisu",
  );
  assert.equal(matchProduct({ title: "x", description: "y" }, []), undefined);
});

test("routes product_showcase → photo pipeline, others → graphic pipeline", async () => {
  const f = fakes();
  const queue = new GenerationQueueService(f);

  await queue.processPlan(
    request([
      item({ id: "a", type: "product_showcase" }),
      item({ id: "b", type: "promo", title: "Valentine's promo" }),
      item({ id: "c", type: "ugc_ad", title: "UGC style ad" }),
    ]),
  );

  assert.deepEqual(f.photoCalls, ["Margherita Pizza"]); // matched from the title
  assert.equal(f.graphicCalls.length, 2); // promo + ugc_ad (video is Phase 3)
});

test("completes items with kit id + media url and aggregates cost", async () => {
  const f = fakes();
  const queue = new GenerationQueueService(f);

  const result = await queue.processPlan(request([item({ id: "a" })]));

  assert.equal(result.completed, 1);
  assert.equal(result.failed, 0);
  assert.ok(Math.abs(result.totalCost - 0.061) < 1e-9); // photo 0.06 + caption 0.001

  // Status transitions: generating → completed with kit id + mediaUrl.
  assert.equal(f.updates[0].patch.status, "generating");
  const done = f.updates.at(-1);
  assert.equal(done?.patch.status, "completed");
  assert.equal(done?.patch.assetKitId, "kit-Showcase — Margherita Pizza");
  assert.match(done?.patch.mediaUrl ?? "", /^https:\/\/r2\//);
});

test("one failing item is isolated — others still complete", async () => {
  const f = fakes();
  const failingGraphic: GraphicPipeline = async ({ topic }) => {
    if (topic.includes("bad")) {
      throw new Error("muapi exploded");
    }
    return { imageUrl: "https://gen/ok.png", cost: 0.03 };
  };
  const queue = new GenerationQueueService({ ...f, graphic: failingGraphic });

  const result = await queue.processPlan(
    request([
      item({ id: "good", type: "promo", title: "good promo" }),
      item({ id: "bad", type: "tip", title: "bad tip" }),
    ]),
  );

  assert.equal(result.completed, 1);
  assert.equal(result.failed, 1);
  const badFinal = f.updates.filter((u) => u.itemId === "bad").at(-1);
  assert.equal(badFinal?.patch.status, "failed");
  assert.match(badFinal?.patch.error ?? "", /muapi exploded/);
  const goodFinal = f.updates.filter((u) => u.itemId === "good").at(-1);
  assert.equal(goodFinal?.patch.status, "completed");
});

test("only pending/failed items are processed (retry semantics)", async () => {
  const f = fakes();
  const queue = new GenerationQueueService(f);

  const result = await queue.processPlan(
    request([
      item({ id: "done", type: "promo", status: "completed" }),
      item({ id: "retry", type: "promo", status: "failed" }),
      item({ id: "fresh", type: "promo", status: "pending" }),
    ]),
  );

  assert.equal(result.completed, 2); // retry + fresh; done untouched
  assert.ok(!f.updates.some((u) => u.itemId === "done"));
});

test("product_showcase with no products falls back to the graphic pipeline", async () => {
  const f = fakes();
  const queue = new GenerationQueueService(f);
  const req = request([item({ id: "a", type: "product_showcase" })]);
  req.profile.products = [];

  const result = await queue.processPlan(req);

  assert.equal(result.completed, 1);
  assert.equal(f.photoCalls.length, 0);
  assert.equal(f.graphicCalls.length, 1);
});
