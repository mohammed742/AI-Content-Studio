/**
 * STU-C3 (DEV-62): Unit tests for the Media Library service.
 *
 * Node built-in runner + native TS type-stripping (see PROGRESS.md → DEV-15).
 * The R2 upload and the DB save/list/remove are injected as fakes, so
 * validation, magic-byte type detection, object-key building, upload/save
 * ordering, and ownership-scoped delete all verify without network or DB.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  MediaLibraryService,
  detectImageType,
  validateMediaUpload,
  mediaObjectKey,
  MAX_MEDIA_BYTES,
  type MediaUploader,
  type MediaSaver,
  type MediaLister,
  type MediaRemover,
} from "./media-library.ts";
import type { MediaLibraryItem } from "@/db/schema";

// Minimal valid file headers.
function pngBuffer(size = 64): Buffer {
  const b = Buffer.alloc(size);
  b.set([0x89, 0x50, 0x4e, 0x47], 0);
  return b;
}
function jpegBuffer(size = 64): Buffer {
  const b = Buffer.alloc(size);
  b.set([0xff, 0xd8, 0xff], 0);
  return b;
}
function webpBuffer(size = 64): Buffer {
  const b = Buffer.alloc(size);
  b.set(Buffer.from("RIFF", "ascii"), 0);
  b.set(Buffer.from("WEBP", "ascii"), 8);
  return b;
}

test("detectImageType reads magic bytes for png/jpeg/webp and rejects others", () => {
  assert.equal(detectImageType(pngBuffer()), "image/png");
  assert.equal(detectImageType(jpegBuffer()), "image/jpeg");
  assert.equal(detectImageType(webpBuffer()), "image/webp");
  // GIF header — not an allowed business-photo type.
  assert.equal(detectImageType(Buffer.from("GIF89a")), null);
  assert.equal(detectImageType(Buffer.alloc(2)), null);
});

test("validateMediaUpload accepts a valid PNG and returns its content type", () => {
  const result = validateMediaUpload(pngBuffer());
  assert.deepEqual(result, { ok: true, contentType: "image/png", extension: "png" });
});

test("validateMediaUpload rejects an empty buffer", () => {
  const result = validateMediaUpload(Buffer.alloc(0));
  assert.equal(result.ok, false);
  assert.match(result.ok === false ? result.error : "", /empty/i);
});

test("validateMediaUpload rejects an oversized file before any content check", () => {
  const result = validateMediaUpload(pngBuffer(MAX_MEDIA_BYTES + 1));
  assert.equal(result.ok, false);
  assert.match(result.ok === false ? result.error : "", /MB or smaller/i);
});

test("validateMediaUpload rejects a disallowed type (content mismatch)", () => {
  const result = validateMediaUpload(Buffer.from("GIF89a and then some bytes"));
  assert.equal(result.ok, false);
  assert.match(result.ok === false ? result.error : "", /PNG, JPG, or WEBP/i);
});

test("mediaObjectKey scopes the key under the user and stamps the time", () => {
  assert.equal(
    mediaObjectKey("user-1", "png", 1_700_000_000_000),
    "media-library/user-1/1700000000000.png",
  );
});

test("uploadFromBuffer validates, then uploads, then saves — returning the row", async () => {
  const calls: string[] = [];
  const upload: MediaUploader = async (key, buffer, contentType) => {
    calls.push(`upload:${key}:${contentType}:${buffer.length}`);
    return `https://cdn.example/${key}`;
  };
  const save: MediaSaver = async (values) => {
    calls.push(`save:${values.r2Key}:${values.mediaUrl}:${values.contentType}:${values.source}`);
    return { id: "m1", createdAt: new Date(), ...values } as MediaLibraryItem;
  };
  const service = new MediaLibraryService({ upload, save, now: () => 1_700_000_000_000 });

  const item = await service.uploadFromBuffer({
    userId: "user-1",
    buffer: pngBuffer(),
    label: "storefront",
  });

  assert.equal(item.id, "m1");
  assert.equal(item.mediaUrl, "https://cdn.example/media-library/user-1/1700000000000.png");
  assert.equal(item.label, "storefront");
  // Upload must happen before save, and the saved row must carry R2's URL/key.
  assert.deepEqual(calls, [
    "upload:media-library/user-1/1700000000000.png:image/png:64",
    "save:media-library/user-1/1700000000000.png:https://cdn.example/media-library/user-1/1700000000000.png:image/png:upload",
  ]);
});

test("uploadFromBuffer rejects an invalid file before uploading anything", async () => {
  let uploaded = false;
  const upload: MediaUploader = async () => {
    uploaded = true;
    return "nope";
  };
  const service = new MediaLibraryService({ upload });
  await assert.rejects(
    () => service.uploadFromBuffer({ userId: "user-1", buffer: Buffer.from("GIF89a") }),
    /PNG, JPG, or WEBP/i,
  );
  assert.equal(uploaded, false);
});

test("list passes the userId through to the lister", async () => {
  let seen = "";
  const list: MediaLister = async (userId) => {
    seen = userId;
    return [];
  };
  const service = new MediaLibraryService({ list });
  await service.list("user-42");
  assert.equal(seen, "user-42");
});

test("remove is ownership-scoped (passes both userId and id)", async () => {
  const seen: Array<{ userId: string; id: string }> = [];
  const remove: MediaRemover = async (userId, id) => {
    seen.push({ userId, id });
    return true;
  };
  const service = new MediaLibraryService({ remove });
  const ok = await service.remove("user-1", "m1");
  assert.equal(ok, true);
  assert.deepEqual(seen, [{ userId: "user-1", id: "m1" }]);
});
