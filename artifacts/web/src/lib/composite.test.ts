/**
 * STU-C4 (DEV-66): Unit tests for the Before/After Composite pipeline.
 *
 * Node built-in runner + native TS type-stripping (see PROGRESS.md → DEV-15).
 * Pure layout math + label-SVG building test directly; the orchestration
 * (fetch both photos → composite → upload → save kit) tests with fakes. One
 * real `sharp` integration test exercises the default compositor end to end.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  CompositeService,
  compositeLayout,
  buildLabelSvg,
  defaultCompositor,
  DEFAULT_BEFORE_LABEL,
  DEFAULT_AFTER_LABEL,
  type Compositor,
  type ImageFetcher,
  type CompositeUploader,
  type CompositeKitSaver,
} from "./composite.ts";
import type { AssetKit, InsertAssetKit } from "@/db/schema";

// --- pure: compositeLayout ------------------------------------------------

test("compositeLayout scales both photos to a common height and lays them side by side", () => {
  const layout = compositeLayout(
    { width: 400, height: 200 }, // 2:1
    { width: 300, height: 300 }, // 1:1
    { divider: 10, maxHeight: 1080 },
  );
  // Common height = min(200, 300, 1080) = 200
  assert.equal(layout.height, 200);
  assert.equal(layout.before.width, 400); // 400 * 200/200
  assert.equal(layout.after.width, 200); // 300 * 200/300
  assert.equal(layout.divider, 10);
  assert.equal(layout.before.left, 0);
  assert.equal(layout.after.left, 400 + 10);
  assert.equal(layout.width, 400 + 10 + 200);
});

test("compositeLayout caps the common height at maxHeight (no upscaling past it)", () => {
  const layout = compositeLayout(
    { width: 4000, height: 3000 },
    { width: 2000, height: 2000 },
    { maxHeight: 1080, divider: 0 },
  );
  assert.equal(layout.height, 1080);
  // 4000 * 1080/3000 = 1440 ; 2000 * 1080/2000 = 1080
  assert.equal(layout.before.width, 1440);
  assert.equal(layout.after.width, 1080);
  assert.equal(layout.width, 1440 + 1080);
});

// --- pure: buildLabelSvg --------------------------------------------------

test("buildLabelSvg embeds the label, sizes the canvas, and centers the text", () => {
  const svg = buildLabelSvg("BEFORE", 300, 48);
  assert.match(svg, /<svg width="300" height="48"/);
  assert.match(svg, />BEFORE</);
  assert.match(svg, /text-anchor="middle"/);
  // horizontally centered
  assert.match(svg, /x="150"/);
});

test("buildLabelSvg XML-escapes the label so it can't break the SVG", () => {
  const svg = buildLabelSvg('A & B <x> "50%"', 200, 40);
  assert.match(svg, /A &amp; B &lt;x&gt; &quot;50%&quot;/);
  assert.doesNotMatch(svg, /<x>/); // the raw tag must not survive
});

// --- service orchestration (fakes) ----------------------------------------

function fakeKit(values: InsertAssetKit): AssetKit {
  return {
    id: "kit_1",
    createdAt: new Date(),
    updatedAt: new Date(),
    ...values,
    hashtags: values.hashtags ?? [],
    cost: values.cost ?? 0,
    status: values.status ?? "ready",
  } as AssetKit;
}

test("generate fetches both photos, composites, uploads, and saves an asset kit", async () => {
  const calls: string[] = [];
  const fetched: string[] = [];
  const fetchImage: ImageFetcher = async (url) => {
    calls.push("fetch");
    fetched.push(url);
    return Buffer.from(`img:${url}`);
  };
  const compositor: Compositor = async (input) => {
    calls.push("composite");
    assert.equal(input.beforeLabel, DEFAULT_BEFORE_LABEL);
    assert.equal(input.afterLabel, DEFAULT_AFTER_LABEL);
    return { buffer: Buffer.from("composite"), contentType: "image/png", width: 800, height: 400 };
  };
  let uploadedKey = "";
  const upload: CompositeUploader = async (key, buffer, contentType) => {
    calls.push("upload");
    uploadedKey = key;
    assert.equal(contentType, "image/png");
    assert.equal(buffer.toString(), "composite");
    return `https://cdn.example/${key}`;
  };
  const savedRows: InsertAssetKit[] = [];
  const save: CompositeKitSaver = async (values) => {
    calls.push("save");
    savedRows.push(values);
    return fakeKit(values);
  };

  const service = new CompositeService({
    fetchImage,
    compositor,
    upload,
    save,
    now: () => 1234,
  });
  const kit = await service.generate({
    userId: "user_1",
    beforeUrl: "https://cdn.example/before.png",
    afterUrl: "https://cdn.example/after.png",
    title: "Fresh Fade",
    platform: "instagram",
    caption: "Look at this transformation",
  });

  // ordering: both fetches, then composite, then upload, then save
  assert.deepEqual(calls, ["fetch", "fetch", "composite", "upload", "save"]);
  assert.deepEqual(fetched, [
    "https://cdn.example/before.png",
    "https://cdn.example/after.png",
  ]);
  // R2 key is scoped to the user and time-stamped
  assert.match(uploadedKey, /^asset-kits\/user_1\/1234-before-after\.png$/);
  assert.equal(savedRows.length, 1);
  const saved = savedRows[0];
  assert.equal(saved.userId, "user_1");
  assert.equal(saved.mediaUrl, `https://cdn.example/${uploadedKey}`);
  assert.equal(saved.mediaType, "image");
  assert.equal(saved.contentType, "testimonial"); // default
  assert.equal(saved.cost, 0);
  assert.equal(saved.status, "ready");
  assert.equal(kit.id, "kit_1");
});

test("generate honors custom labels, content type, and hashtags", async () => {
  let seenLabels: [string, string] = ["", ""];
  const service = new CompositeService({
    fetchImage: async () => Buffer.from("x"),
    compositor: async (input) => {
      seenLabels = [input.beforeLabel, input.afterLabel];
      return { buffer: Buffer.from("c"), contentType: "image/png", width: 2, height: 1 };
    },
    upload: async (key) => `https://cdn/${key}`,
    save: async (values) => fakeKit(values),
    now: () => 1,
  });
  const kit = await service.generate({
    userId: "u",
    beforeUrl: "b",
    afterUrl: "a",
    beforeLabel: "Week 1",
    afterLabel: "Week 12",
    title: "12-week challenge",
    platform: "tiktok",
    caption: "results",
    contentType: "promo",
    hashtags: ["#fit", "#transform"],
  });
  assert.deepEqual(seenLabels, ["Week 1", "Week 12"]);
  assert.equal(kit.contentType, "promo");
  assert.deepEqual(kit.hashtags, ["#fit", "#transform"]);
});

test("generate propagates a source-fetch failure and never uploads or saves", async () => {
  let uploaded = false;
  let savedCount = 0;
  const service = new CompositeService({
    fetchImage: async () => {
      throw new Error("Failed to fetch source photo (404)");
    },
    compositor: async () => {
      throw new Error("should not composite");
    },
    upload: async (key) => {
      uploaded = true;
      return key;
    },
    save: async (values) => {
      savedCount += 1;
      return fakeKit(values);
    },
  });
  await assert.rejects(
    () =>
      service.generate({
        userId: "u",
        beforeUrl: "b",
        afterUrl: "a",
        title: "t",
        platform: "instagram",
        caption: "c",
      }),
    /Failed to fetch source photo/,
  );
  assert.equal(uploaded, false);
  assert.equal(savedCount, 0);
});

// --- default compositor (real sharp) --------------------------------------

test("defaultCompositor produces a valid side-by-side PNG with labels (real sharp)", async () => {
  const sharp = (await import("sharp")).default;
  const before = await sharp({
    create: { width: 200, height: 200, channels: 3, background: { r: 220, g: 90, b: 90 } },
  })
    .png()
    .toBuffer();
  const after = await sharp({
    create: { width: 300, height: 200, channels: 3, background: { r: 90, g: 140, b: 220 } },
  })
    .png()
    .toBuffer();

  const out = await defaultCompositor({
    before,
    after,
    beforeLabel: "BEFORE",
    afterLabel: "AFTER",
    divider: 10,
  });

  assert.equal(out.contentType, "image/png");
  // common height 200; widths 200 + 10 divider + 300
  assert.equal(out.height, 200);
  assert.equal(out.width, 200 + 10 + 300);
  // output really is a PNG of those dimensions
  const meta = await sharp(out.buffer).metadata();
  assert.equal(meta.format, "png");
  assert.equal(meta.width, out.width);
  assert.equal(meta.height, out.height);
});
