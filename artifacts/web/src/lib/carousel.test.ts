/**
 * STU-C5 (DEV-67): Unit tests for the Carousel assembly pipeline.
 *
 * Node built-in runner + native TS type-stripping (see PROGRESS.md → DEV-15).
 * A carousel = N already-generated frames stitched into one Asset Kit that
 * shares a single caption/hashtag set. The orchestration (download each frame
 * in order → upload to R2 → save one kit) tests with fakes; the ordering and
 * cover-frame rules are the load-bearing behaviour (the AC: order is preserved
 * in the kit payload).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  CarouselService,
  buildCarouselMediaKey,
  CAROUSEL_MIN_FRAMES,
  CAROUSEL_MAX_FRAMES,
  type FrameDownloader,
  type CarouselUploader,
  type CarouselKitSaver,
  type GenerationEmbedder,
} from "./carousel.ts";
import type { AssetKit, InsertAssetKit } from "@/db/schema";

// --- pure: buildCarouselMediaKey -----------------------------------------

test("buildCarouselMediaKey scopes to the user, timestamp, and zero-padded index", () => {
  assert.equal(
    buildCarouselMediaKey("user_1", 1234, 0, "png"),
    "asset-kits/user_1/1234-carousel-00.png",
  );
  assert.equal(
    buildCarouselMediaKey("user_1", 1234, 9, "jpg"),
    "asset-kits/user_1/1234-carousel-09.jpg",
  );
});

// --- service orchestration (fakes) ----------------------------------------

function fakeKit(values: InsertAssetKit): AssetKit {
  return {
    id: "kit_1",
    createdAt: new Date(),
    updatedAt: new Date(),
    ...values,
    media: values.media ?? [],
    hashtags: values.hashtags ?? [],
    cost: values.cost ?? 0,
    status: values.status ?? "ready",
  } as AssetKit;
}

test("assemble downloads every frame in order, uploads each, and saves one ordered kit", async () => {
  const downloaded: string[] = [];
  const download: FrameDownloader = async (url) => {
    downloaded.push(url);
    return { buffer: Buffer.from(`img:${url}`), contentType: "image/png" };
  };
  const uploadedKeys: string[] = [];
  const upload: CarouselUploader = async (key, _buf, contentType) => {
    uploadedKeys.push(key);
    assert.equal(contentType, "image/png");
    return `https://cdn.example/${key}`;
  };
  const savedRows: InsertAssetKit[] = [];
  const save: CarouselKitSaver = async (values) => {
    savedRows.push(values);
    return fakeKit(values);
  };

  const service = new CarouselService({ download, upload, save, embed: async () => {}, now: () => 1234 });
  const kit = await service.assemble({
    userId: "user_1",
    title: "How to fold a fitted sheet",
    contentType: "tip",
    platform: "instagram",
    caption: "Step by step 👇",
    hashtags: ["#howto", "#tips"],
    cost: 0.06,
    frames: [
      { sourceMediaUrl: "https://muapi/step1.png" },
      { sourceMediaUrl: "https://muapi/step2.png" },
      { sourceMediaUrl: "https://muapi/step3.png" },
    ],
  });

  // Every frame downloaded, left-to-right, in the given order.
  assert.deepEqual(downloaded, [
    "https://muapi/step1.png",
    "https://muapi/step2.png",
    "https://muapi/step3.png",
  ]);
  // Keys are index-ordered.
  assert.deepEqual(uploadedKeys, [
    "asset-kits/user_1/1234-carousel-00.png",
    "asset-kits/user_1/1234-carousel-01.png",
    "asset-kits/user_1/1234-carousel-02.png",
  ]);

  assert.equal(savedRows.length, 1);
  const saved = savedRows[0];
  // The kit payload preserves frame order (the AC).
  assert.deepEqual(
    saved.media,
    uploadedKeys.map((key) => ({ url: `https://cdn.example/${key}`, mediaType: "image" })),
  );
  // Cover mirrors frame 0 so the gallery thumbnail needs no special-casing.
  assert.equal(saved.mediaUrl, `https://cdn.example/${uploadedKeys[0]}`);
  assert.equal(saved.mediaType, "image");
  assert.equal(saved.contentType, "tip");
  assert.deepEqual(saved.hashtags, ["#howto", "#tips"]);
  assert.equal(saved.cost, 0.06);
  assert.equal(saved.status, "ready");
  assert.equal(kit.id, "kit_1");
});

test("assemble rejects fewer than the minimum frame count before any side effect", async () => {
  let touched = false;
  const service = new CarouselService({
    download: async () => {
      touched = true;
      return { buffer: Buffer.from("x"), contentType: "image/png" };
    },
    upload: async (k) => {
      touched = true;
      return k;
    },
    save: async (v) => {
      touched = true;
      return fakeKit(v);
    },
    embed: async () => {},
  });
  await assert.rejects(
    () =>
      service.assemble({
        userId: "u",
        title: "t",
        contentType: "tip",
        platform: "instagram",
        caption: "c",
        cost: 0,
        frames: [{ sourceMediaUrl: "only-one.png" }],
      }),
    new RegExp(`at least ${CAROUSEL_MIN_FRAMES}`),
  );
  assert.equal(touched, false);
});

test("assemble rejects more than the maximum frame count before any side effect", async () => {
  let touched = false;
  const service = new CarouselService({
    download: async () => {
      touched = true;
      return { buffer: Buffer.from("x"), contentType: "image/png" };
    },
    upload: async (k) => k,
    save: async (v) => fakeKit(v),
    embed: async () => {},
  });
  const frames = Array.from({ length: CAROUSEL_MAX_FRAMES + 1 }, (_, i) => ({
    sourceMediaUrl: `f${i}.png`,
  }));
  await assert.rejects(
    () =>
      service.assemble({
        userId: "u",
        title: "t",
        contentType: "tip",
        platform: "instagram",
        caption: "c",
        cost: 0,
        frames,
      }),
    new RegExp(`at most ${CAROUSEL_MAX_FRAMES}`),
  );
  assert.equal(touched, false);
});

test("assemble derives each frame's extension from its own content type", async () => {
  const service = new CarouselService({
    download: async (url) => ({
      buffer: Buffer.from(url),
      contentType: url.endsWith("jpg") ? "image/jpeg" : "image/png",
    }),
    upload: async (key) => `https://cdn/${key}`,
    save: async (v) => fakeKit(v),
    embed: async () => {},
    now: () => 7,
  });
  const kit = await service.assemble({
    userId: "u",
    title: "Lookbook",
    contentType: "product_showcase",
    platform: "instagram",
    caption: "Fall drop",
    cost: 0,
    frames: [{ sourceMediaUrl: "a.png" }, { sourceMediaUrl: "b.jpg" }],
  });
  assert.deepEqual(
    kit.media.map((m) => m.url),
    ["https://cdn/asset-kits/u/7-carousel-00.png", "https://cdn/asset-kits/u/7-carousel-01.jpg"],
  );
});

test("assemble embeds the kit's title + caption back into the knowledge base (non-fatal)", async () => {
  const embedded: Array<{ userId: string; content: string; sourceId: string }> = [];
  const embed: GenerationEmbedder = async (userId, content, sourceId) => {
    embedded.push({ userId, content, sourceId });
  };
  const service = new CarouselService({
    download: async () => ({ buffer: Buffer.from("x"), contentType: "image/png" }),
    upload: async (k) => `https://cdn/${k}`,
    save: async (v) => fakeKit(v),
    embed,
    now: () => 1,
  });
  await service.assemble({
    userId: "user_9",
    title: "Style guide",
    contentType: "tip",
    platform: "instagram",
    caption: "Mix and match",
    cost: 0,
    frames: [{ sourceMediaUrl: "a.png" }, { sourceMediaUrl: "b.png" }],
  });
  assert.equal(embedded.length, 1);
  assert.equal(embedded[0].userId, "user_9");
  assert.equal(embedded[0].content, "Style guide. Mix and match");
  assert.equal(embedded[0].sourceId, "kit_1");
});

test("assemble still returns the kit when the embed-back throws", async () => {
  const service = new CarouselService({
    download: async () => ({ buffer: Buffer.from("x"), contentType: "image/png" }),
    upload: async (k) => `https://cdn/${k}`,
    save: async (v) => fakeKit(v),
    embed: async () => {
      throw new Error("embedding service down");
    },
  });
  const kit = await service.assemble({
    userId: "u",
    title: "t",
    contentType: "tip",
    platform: "instagram",
    caption: "c",
    cost: 0,
    frames: [{ sourceMediaUrl: "a.png" }, { sourceMediaUrl: "b.png" }],
  });
  assert.equal(kit.id, "kit_1");
  assert.equal(kit.media.length, 2);
});

test("assemble propagates a frame download failure and never uploads or saves", async () => {
  let uploaded = false;
  let saved = false;
  const service = new CarouselService({
    download: async (url) => {
      if (url.includes("bad")) throw new Error("Failed to download carousel frame (404)");
      return { buffer: Buffer.from("x"), contentType: "image/png" };
    },
    upload: async (k) => {
      uploaded = true;
      return k;
    },
    save: async (v) => {
      saved = true;
      return fakeKit(v);
    },
    embed: async () => {},
  });
  await assert.rejects(
    () =>
      service.assemble({
        userId: "u",
        title: "t",
        contentType: "tip",
        platform: "instagram",
        caption: "c",
        cost: 0,
        frames: [{ sourceMediaUrl: "ok.png" }, { sourceMediaUrl: "bad.png" }],
      }),
    /Failed to download carousel frame/,
  );
  assert.equal(uploaded, false);
  assert.equal(saved, false);
});
