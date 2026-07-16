/**
 * DEV-23: Unit tests for Asset Kit assembly.
 *
 * Node built-in runner + native TS type-stripping (see PROGRESS.md → DEV-15).
 * All four side effects (download / upload / save / embed) are injected as
 * fakes, so assembly order, key/extension handling, and failure semantics
 * verify without the network, R2, or DB.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  AssetKitService,
  extensionFor,
  type AssembleRequest,
  type MediaDownloader,
  type MediaUploader,
  type KitSaver,
  type GenerationEmbedder,
} from "./asset-kit.ts";
import type { AssetKit, InsertAssetKit } from "../db/schema.ts";

function request(overrides: Partial<AssembleRequest> = {}): AssembleRequest {
  return {
    userId: "user-1",
    title: "Savor the Margherita",
    contentType: "product_showcase",
    platform: "instagram",
    sourceMediaUrl: "https://muapi-output/img.png",
    mediaType: "image",
    caption: "Fresh from the oven 🍕",
    hashtags: ["pizza", "foodie"],
    cost: 0.09,
    ...overrides,
  };
}

function fakes(overrides: Partial<{ downloadContentType: string }> = {}) {
  const calls: string[] = [];
  const uploads: Array<{ key: string; contentType: string }> = [];
  const saved: InsertAssetKit[] = [];
  const embedded: Array<{ userId: string; content: string; sourceId: string }> = [];

  const download: MediaDownloader = async (url) => {
    calls.push(`download:${url}`);
    return {
      buffer: Buffer.from("media-bytes"),
      contentType: overrides.downloadContentType ?? "image/png",
    };
  };
  const upload: MediaUploader = async (key, _buffer, contentType) => {
    calls.push("upload");
    uploads.push({ key, contentType });
    return `https://r2.example/${key}`;
  };
  const save: KitSaver = async (values) => {
    calls.push("save");
    saved.push(values);
    return {
      ...values,
      id: "kit-1",
      hashtags: values.hashtags ?? [],
      cost: values.cost ?? 0,
      status: values.status ?? "ready",
      createdAt: new Date(),
      updatedAt: new Date(),
    } as AssetKit;
  };
  const embed: GenerationEmbedder = async (userId, content, sourceId) => {
    calls.push("embed");
    embedded.push({ userId, content, sourceId });
  };

  return { download, upload, save, embed, calls, uploads, saved, embedded };
}

test("extensionFor maps known content types and falls back by media type", () => {
  assert.equal(extensionFor("image/jpeg", "image"), "jpg");
  assert.equal(extensionFor("image/png; charset=binary", "image"), "png");
  assert.equal(extensionFor("video/mp4", "video"), "mp4");
  assert.equal(extensionFor("application/octet-stream", "image"), "png");
  assert.equal(extensionFor("application/octet-stream", "video"), "mp4");
});

test("assemble runs download → upload → save → embed and returns the kit", async () => {
  const f = fakes();
  const service = new AssetKitService({ ...f, now: () => 1234 });

  const kit = await service.assemble(request());

  assert.deepEqual(f.calls, [
    "download:https://muapi-output/img.png",
    "upload",
    "save",
    "embed",
  ]);
  // R2 key: asset-kits/{userId}/{ts}.{ext}, content type preserved.
  assert.equal(f.uploads[0].key, "asset-kits/user-1/1234.png");
  assert.equal(f.uploads[0].contentType, "image/png");
  // Saved row points at R2, not the source URL, and keeps text + cost.
  assert.equal(f.saved[0].mediaUrl, "https://r2.example/asset-kits/user-1/1234.png");
  assert.deepEqual(f.saved[0].hashtags, ["pizza", "foodie"]);
  assert.equal(f.saved[0].cost, 0.09);
  assert.equal(f.saved[0].status, "ready");
  assert.equal(kit.id, "kit-1");
});

test("embeds the kit's title + caption as a generation embedding", async () => {
  const f = fakes();
  const service = new AssetKitService(f);

  await service.assemble(request());

  assert.equal(f.embedded.length, 1);
  assert.equal(f.embedded[0].userId, "user-1");
  assert.match(f.embedded[0].content, /Savor the Margherita/);
  assert.match(f.embedded[0].content, /Fresh from the oven/);
  assert.equal(f.embedded[0].sourceId, "kit-1");
});

test("a failing embed is non-fatal — the kit is still returned", async () => {
  const f = fakes();
  const failingEmbed: GenerationEmbedder = async () => {
    throw new Error("openai down");
  };
  const service = new AssetKitService({ ...f, embed: failingEmbed });

  const kit = await service.assemble(request());

  assert.equal(kit.id, "kit-1"); // saved despite the embed failure
});

test("a failing download is fatal — nothing is uploaded or saved", async () => {
  const f = fakes();
  const failingDownload: MediaDownloader = async () => {
    throw new Error("404 from CDN");
  };
  const service = new AssetKitService({ ...f, download: failingDownload });

  await assert.rejects(() => service.assemble(request()), /404 from CDN/);
  assert.ok(!f.calls.includes("upload"));
  assert.ok(!f.calls.includes("save"));
});

test("video media gets a video extension in the R2 key", async () => {
  const f = fakes({ downloadContentType: "video/mp4" });
  const service = new AssetKitService({ ...f, now: () => 99 });

  await service.assemble(request({ mediaType: "video" }));

  assert.equal(f.uploads[0].key, "asset-kits/user-1/99.mp4");
});
