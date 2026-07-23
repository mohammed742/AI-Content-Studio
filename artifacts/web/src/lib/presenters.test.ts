/**
 * STU-C7 (DEV-64): Unit tests for the Presenter Library.
 * Node built-in runner + native TS type-stripping (see PROGRESS.md → DEV-15).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  PRESENTERS,
  AUDIENCE_TAGS,
  listPresenters,
  filterPresentersByTags,
  audienceTagCounts,
  type AudienceTag,
} from "./presenters.ts";

test("ships at least 8 presenters (AC minimum)", () => {
  assert.ok(PRESENTERS.length >= 8, `expected >= 8, got ${PRESENTERS.length}`);
});

test("presenter ids are unique", () => {
  const ids = PRESENTERS.map((p) => p.id);
  assert.equal(new Set(ids).size, ids.length);
});

test("every presenter has the required fields populated", () => {
  for (const p of PRESENTERS) {
    assert.ok(p.id, "id");
    assert.ok(p.name, `name for ${p.id}`);
    assert.ok(p.imageUrl, `imageUrl for ${p.id}`);
    assert.ok(p.gender, `gender for ${p.id}`);
    assert.ok(p.ageRange, `ageRange for ${p.id}`);
    assert.ok(p.style, `style for ${p.id}`);
    assert.ok(
      p.targetAudienceTags.length > 0,
      `at least one audience tag for ${p.id}`,
    );
  }
});

test("every presenter tag is a member of the AUDIENCE_TAGS catalog", () => {
  const known = new Set<string>(AUDIENCE_TAGS.map((t) => t.value));
  for (const p of PRESENTERS) {
    for (const tag of p.targetAudienceTags) {
      assert.ok(known.has(tag), `unknown tag "${tag}" on ${p.id}`);
    }
  }
});

test("every catalog tag is used by at least one presenter (no dead filters)", () => {
  const used = new Set<string>(PRESENTERS.flatMap((p) => p.targetAudienceTags));
  for (const tag of AUDIENCE_TAGS) {
    assert.ok(used.has(tag.value), `catalog tag "${tag.value}" has no presenter`);
  }
});

test("listPresenters returns all presenters", () => {
  assert.equal(listPresenters().length, PRESENTERS.length);
});

test("filtering with no tags returns everyone", () => {
  assert.equal(filterPresentersByTags(PRESENTERS, []).length, PRESENTERS.length);
});

test("filtering by a single tag returns only presenters carrying it", () => {
  const tag: AudienceTag = "fitness-enthusiasts";
  const result = filterPresentersByTags(PRESENTERS, [tag]);
  assert.ok(result.length > 0);
  assert.ok(result.every((p) => p.targetAudienceTags.includes(tag)));
});

test("filtering by multiple tags is a union (matches ANY selected tag)", () => {
  const tags: AudienceTag[] = ["luxury-shoppers", "students"];
  const result = filterPresentersByTags(PRESENTERS, tags);
  const expected = PRESENTERS.filter((p) =>
    tags.some((t) => p.targetAudienceTags.includes(t)),
  );
  assert.equal(result.length, expected.length);
  assert.ok(
    result.every((p) => tags.some((t) => p.targetAudienceTags.includes(t))),
  );
});

test("audienceTagCounts tallies presenters per tag and covers the catalog", () => {
  const counts = audienceTagCounts();
  // Every catalog tag has an entry with a positive count.
  for (const tag of AUDIENCE_TAGS) {
    assert.ok((counts[tag.value] ?? 0) > 0, `count for ${tag.value}`);
  }
  // A tag's count matches a manual tally.
  const manual = PRESENTERS.filter((p) =>
    p.targetAudienceTags.includes("beauty-wellness"),
  ).length;
  assert.equal(counts["beauty-wellness"], manual);
});
