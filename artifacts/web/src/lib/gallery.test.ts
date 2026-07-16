/**
 * DEV-26: Unit tests for the pure Gallery helpers.
 * Node built-in runner + native TS type-stripping (see PROGRESS.md → DEV-15).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  parseGalleryQuery,
  pageOffset,
  toggleRating,
  GALLERY_PAGE_SIZE,
} from "./gallery.ts";

test("parseGalleryQuery applies safe defaults for empty input", () => {
  const q = parseGalleryQuery({});
  assert.deepEqual(q, { page: 1, sort: "newest", type: "all", platform: undefined });
});

test("parseGalleryQuery reads valid values", () => {
  const q = parseGalleryQuery(
    new URLSearchParams({ page: "3", sort: "oldest", type: "video", platform: "tiktok" }),
  );
  assert.deepEqual(q, { page: 3, sort: "oldest", type: "video", platform: "tiktok" });
});

test("parseGalleryQuery clamps a bad page to 1 and rejects unknown enums", () => {
  assert.equal(parseGalleryQuery({ page: "0" }).page, 1);
  assert.equal(parseGalleryQuery({ page: "-5" }).page, 1);
  assert.equal(parseGalleryQuery({ page: "abc" }).page, 1);
  assert.equal(parseGalleryQuery({ sort: "sideways" }).sort, "newest");
  assert.equal(parseGalleryQuery({ type: "gif" }).type, "all");
});

test("parseGalleryQuery treats platform 'all'/blank as no filter", () => {
  assert.equal(parseGalleryQuery({ platform: "all" }).platform, undefined);
  assert.equal(parseGalleryQuery({ platform: "  " }).platform, undefined);
  assert.equal(parseGalleryQuery({ platform: "instagram" }).platform, "instagram");
});

test("pageOffset computes a 0-based offset from a 1-based page", () => {
  assert.equal(pageOffset(1), 0);
  assert.equal(pageOffset(2), GALLERY_PAGE_SIZE);
  assert.equal(pageOffset(4), GALLERY_PAGE_SIZE * 3);
});

test("toggleRating clears on re-tap and switches otherwise", () => {
  assert.equal(toggleRating(null, "up"), "up");
  assert.equal(toggleRating("up", "up"), null); // re-tap clears
  assert.equal(toggleRating("up", "down"), "down"); // switch
  assert.equal(toggleRating("down", "up"), "up");
  assert.equal(toggleRating(undefined, "down"), "down");
});
