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
        // Carries a photo, so the default fixture exercises the photo path —
        // `ai-product-shot` is Image-to-Image and unreachable without one.
        {
          name: "Margherita Pizza",
          description: "wood-fired",
          imageUrl: "https://img/pizza.png",
        },
        { name: "Tiramisu" },
      ],
    },
    items,
  };
}

function fakes() {
  const photoCalls: string[] = [];
  const photoSourceImages: (string | undefined)[] = [];
  const graphicCalls: string[] = [];
  const updates: Array<{ itemId: string; patch: Partial<ContentPlanItemRecord> }> = [];

  const photo: PhotoPipeline = async ({ product, sourceImageUrl }) => {
    photoCalls.push(product.name);
    photoSourceImages.push(sourceImageUrl);
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

  return { photo, graphic, caption, assemble, updateItem, photoCalls, photoSourceImages, graphicCalls, updates };
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
  const req = request([
    item({ id: "a", type: "product_showcase" }),
    item({ id: "b", type: "promo", title: "Valentine's promo" }),
    item({ id: "c", type: "ugc_ad", title: "UGC style ad" }),
  ]);
  // The photo pipeline is only reachable when the product has a real photo —
  // `ai-product-shot` is Image-to-Image.
  req.profile.products = [
    { name: "Margherita Pizza", description: "wood-fired", imageUrl: "https://img/pizza.png" },
  ];

  await queue.processPlan(req);

  assert.deepEqual(f.photoCalls, ["Margherita Pizza"]); // matched from the title
  assert.equal(f.graphicCalls.length, 2); // promo + ugc_ad (video is Phase 3)
});

test("product_showcase whose product has no photo falls back to the graphic pipeline", async () => {
  // Regression: products carry no image today, so this path used to call the
  // img2img `ai-product-shot` with no `image_url` and 422 on every single
  // product_showcase item in every plan.
  const f = fakes();
  const queue = new GenerationQueueService(f);
  const req = request([item({ id: "a", type: "product_showcase" })]);
  req.profile.products = [{ name: "Margherita Pizza", description: "wood-fired" }];

  const result = await queue.processPlan(req);

  assert.equal(result.completed, 1);
  assert.equal(result.failed, 0);
  assert.equal(f.photoCalls.length, 0);
  assert.equal(f.graphicCalls.length, 1);
});

test("product_showcase passes the product photo through to the photo pipeline", async () => {
  const f = fakes();
  const queue = new GenerationQueueService(f);
  const req = request([item({ id: "a", type: "product_showcase" })]);
  req.profile.products = [
    { name: "Margherita Pizza", description: "wood-fired", imageUrl: "https://img/pizza.png" },
  ];

  await queue.processPlan(req);

  assert.deepEqual(f.photoSourceImages, ["https://img/pizza.png"]);
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

// --- DEV-43: calendar status tracking -------------------------------------

test("a completed item advances its Calendar Entry with the new kit", async () => {
  const f = fakes();
  const marks: Array<{
    userId: string;
    planId: string;
    planItemId: string;
    assetKitId: string;
  }> = [];
  const queue = new GenerationQueueService({
    ...f,
    markCalendarGenerated: async (args) => {
      marks.push(args);
    },
  });

  await queue.processPlan(request([item({ id: "a", type: "promo" })]));

  assert.equal(marks.length, 1);
  assert.equal(marks[0].planId, "plan-1");
  assert.equal(marks[0].userId, "user-1");
  assert.equal(marks[0].planItemId, "a");
  // The same kit id the item itself was patched with — the entry and the plan
  // item must never point at different kits.
  const completed = f.updates.find((u) => u.patch.status === "completed");
  assert.equal(marks[0].assetKitId, completed?.patch.assetKitId);
});

test("a failed item leaves its Calendar Entry alone", async () => {
  // Decision (DEV-43): `failed` on an entry means *publish* failed, and its
  // retry path assumes an Asset Kit exists. A generation failure has none, so
  // the entry stays `planned` and the item's own Retry on /plan owns recovery.
  const f = fakes();
  let marked = false;
  const queue = new GenerationQueueService({
    ...f,
    graphic: async () => {
      throw new Error("model exploded");
    },
    markCalendarGenerated: async () => {
      marked = true;
    },
  });

  const result = await queue.processPlan(request([item({ id: "a", type: "promo" })]));

  assert.equal(result.failed, 1);
  assert.equal(marked, false);
});

test("a calendar write failure never fails the generation", async () => {
  // The generation is the expensive, user-visible work; calendar bookkeeping is
  // secondary and must not be able to take it down.
  const f = fakes();
  const queue = new GenerationQueueService({
    ...f,
    markCalendarGenerated: async () => {
      throw new Error("db unreachable");
    },
  });

  const result = await queue.processPlan(request([item({ id: "a", type: "promo" })]));

  assert.equal(result.completed, 1);
  assert.equal(result.failed, 0);
  assert.ok(result.totalCost > 0);
  // And the item is still recorded as completed, not failed.
  assert.ok(f.updates.some((u) => u.patch.status === "completed"));
  assert.ok(!f.updates.some((u) => u.patch.status === "failed"));
});
