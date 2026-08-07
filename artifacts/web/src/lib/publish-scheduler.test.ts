/**
 * DEV-42: Unit tests for the Publish Scheduler.
 *
 * Node built-in runner + native TS type-stripping (see PROGRESS.md → DEV-15).
 * The whole run is exercised through injected seams, so due-detection, the
 * claim race, platform routing, caption capping, and every status transition
 * verify with no DB and no Muapi call — which matters more here than anywhere
 * else in the codebase, because the real thing spends money and posts publicly.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  composeCaption,
  entryDueAt,
  isEntryDue,
  parseEntryTime,
  resolvePublishPlatform,
  PublishSchedulerService,
  type PublishSchedulerConfig,
  type PublishableKit,
} from "./publish-scheduler.ts";
import type {
  CalendarEntry,
  PublishJob,
  SocialAccount,
} from "@/db/schema";
import type { PublishAssetKitRequest } from "./social-publishing.ts";

// --- fixtures -------------------------------------------------------------

/** 2026-06-15 is a UTC Monday; entries default to 09:00 on it. */
const DAY = new Date(Date.UTC(2026, 5, 15));

function entry(over: Partial<CalendarEntry> = {}): CalendarEntry {
  return {
    id: "entry-1",
    userId: "user-1",
    contentPlanId: "plan-1",
    assetKitId: "kit-1",
    planItemId: "item-1",
    date: DAY,
    time: "09:00",
    platform: "youtube",
    contentType: "product_showcase",
    title: "Sunday roast promo",
    status: "scheduled",
    publishJobId: null,
    publishAttemptedAt: null,
    createdAt: DAY,
    updatedAt: DAY,
    ...over,
  };
}

function account(over: Partial<SocialAccount> = {}): SocialAccount {
  return {
    id: "acct-1",
    userId: "user-1",
    platform: "youtube",
    muapiAccountId: "42",
    platformName: "YouTube",
    accountName: "@roasthouse",
    nickname: null,
    connectedAt: DAY,
    ...over,
  };
}

function kit(over: Partial<PublishableKit> = {}): PublishableKit {
  return {
    id: "kit-1",
    mediaUrl: "https://media.example.com/kit-1.mp4",
    caption: "Fresh out of the oven",
    hashtags: ["#roast", "#sunday"],
    ...over,
  };
}

function job(over: Partial<PublishJob> = {}): PublishJob {
  return {
    id: "job-1",
    userId: "user-1",
    assetKitId: "kit-1",
    socialAccountId: "acct-1",
    platform: "youtube",
    muapiRequestId: "req-1",
    status: "processing",
    title: "Sunday roast promo",
    mediaUrl: "https://media.example.com/kit-1.mp4",
    params: { account_id: 42, media_url: "https://media.example.com/kit-1.mp4", title: "x" },
    resultUrl: null,
    error: null,
    cost: 0.01,
    createdAt: DAY,
    completedAt: null,
    ...over,
  };
}

/**
 * A scheduler whose seams all default to "nothing to do", so each test only
 * declares the seams it actually cares about.
 */
function scheduler(over: Partial<PublishSchedulerConfig> = {}) {
  return new PublishSchedulerService({
    listDueEntries: async () => [],
    listInFlightEntries: async () => [],
    claimEntry: async (entryId) => entry({ id: entryId }),
    patchEntry: async () => null,
    getPublishableKit: async () => kit(),
    listAccounts: async () => [account()],
    publishKit: async () => job(),
    refreshJob: async () => job(),
    ...over,
  });
}

// --- pure helpers ---------------------------------------------------------

test("parseEntryTime reads a HH:MM time-of-day", () => {
  assert.deepEqual(parseEntryTime("09:00"), { hours: 9, minutes: 0 });
  assert.deepEqual(parseEntryTime("23:59"), { hours: 23, minutes: 59 });
  assert.deepEqual(parseEntryTime(" 7:05 "), { hours: 7, minutes: 5 });
});

test("parseEntryTime throws on a malformed or out-of-range time", () => {
  // Fail-loud like weekdayOffset: a corrupt time must not silently become
  // midnight, which would publish the entry ~9 hours early.
  assert.throws(() => parseEntryTime("9am"), /time/i);
  assert.throws(() => parseEntryTime("25:00"), /time/i);
  assert.throws(() => parseEntryTime("12:60"), /time/i);
  assert.throws(() => parseEntryTime(""), /time/i);
});

test("entryDueAt combines the entry's UTC date with its time-of-day", () => {
  assert.equal(
    entryDueAt(entry({ time: "14:30" })).toISOString(),
    "2026-06-15T14:30:00.000Z",
  );
});

test("isEntryDue is true once the scheduled moment has passed", () => {
  const e = entry({ time: "09:00" });
  assert.equal(isEntryDue(e, new Date("2026-06-15T09:00:00.000Z")), true);
  assert.equal(isEntryDue(e, new Date("2026-06-15T09:00:01.000Z")), true);
  assert.equal(isEntryDue(e, new Date("2026-06-16T00:00:00.000Z")), true);
});

test("isEntryDue is false earlier the same day", () => {
  // The due-entry query is day-granular (date <= now), so the time-of-day check
  // is the only thing stopping a 21:00 post going out at 08:00.
  const e = entry({ time: "21:00" });
  assert.equal(isEntryDue(e, new Date("2026-06-15T08:00:00.000Z")), false);
  assert.equal(isEntryDue(e, new Date("2026-06-15T20:59:59.000Z")), false);
});

test("resolvePublishPlatform narrows the entry's free-text platform", () => {
  assert.equal(resolvePublishPlatform("youtube"), "youtube");
  assert.equal(resolvePublishPlatform("TikTok"), "tiktok");
  assert.equal(resolvePublishPlatform(" instagram "), "instagram");
});

test("resolvePublishPlatform returns null for a platform we can't publish to", () => {
  // Plan items use broader strings than the 3-value enum (CONTEXT.md).
  assert.equal(resolvePublishPlatform("linkedin"), null);
  assert.equal(resolvePublishPlatform("facebook"), null);
  assert.equal(resolvePublishPlatform(""), null);
});

test("composeCaption appends the kit's hashtags to its caption", () => {
  assert.equal(
    composeCaption(kit(), 200),
    "Fresh out of the oven #roast #sunday",
  );
});

test("composeCaption truncates to the platform's cap", () => {
  // The publish param builders throw above their caps, which would burn the
  // entry — so capping happens here, before the builder sees it.
  const long = composeCaption(
    kit({ caption: "x".repeat(200), hashtags: ["#a"] }),
    150,
  );
  assert.equal(long.length, 150);
});

test("composeCaption handles a kit with no hashtags", () => {
  assert.equal(composeCaption(kit({ hashtags: [] }), 200), "Fresh out of the oven");
});

// --- run: submitting due entries -----------------------------------------

test("runDuePublishes submits a due entry and records the job on it", async () => {
  const published: PublishAssetKitRequest[] = [];
  const patches: { entryId: string; patch: Record<string, unknown> }[] = [];
  const service = scheduler({
    listDueEntries: async () => [entry()],
    publishKit: async (request) => {
      published.push(request);
      return job({ id: "job-77" });
    },
    patchEntry: async (entryId, patch) => {
      patches.push({ entryId, patch: patch as Record<string, unknown> });
      return entry();
    },
  });

  const summary = await service.runDuePublishes({
    now: new Date("2026-06-15T09:30:00.000Z"),
  });

  assert.equal(summary.submitted, 1);
  assert.equal(published.length, 1);
  assert.equal(published[0].userId, "user-1");
  assert.equal(published[0].assetKitId, "kit-1");
  assert.equal(published[0].socialAccountId, "acct-1");
  assert.equal(published[0].mediaUrl, "https://media.example.com/kit-1.mp4");
  // Still `scheduled` — in flight, not published. Only a completed job publishes it.
  assert.equal(patches.length, 1);
  assert.equal(patches[0].patch.publishJobId, "job-77");
  assert.equal(patches[0].patch.status, undefined);
});

test("runDuePublishes leaves an entry alone until its time-of-day arrives", async () => {
  let publishCalls = 0;
  const service = scheduler({
    listDueEntries: async () => [entry({ time: "21:00" })],
    publishKit: async () => {
      publishCalls += 1;
      return job();
    },
  });

  const summary = await service.runDuePublishes({
    now: new Date("2026-06-15T09:30:00.000Z"),
  });

  assert.equal(publishCalls, 0);
  assert.equal(summary.submitted, 0);
  assert.equal(summary.skipped, 1);
});

test("runDuePublishes skips a platform we can't publish to, without claiming", async () => {
  let claims = 0;
  let publishCalls = 0;
  const service = scheduler({
    listDueEntries: async () => [entry({ platform: "linkedin" })],
    claimEntry: async (entryId) => {
      claims += 1;
      return entry({ id: entryId });
    },
    publishKit: async () => {
      publishCalls += 1;
      return job();
    },
  });

  const summary = await service.runDuePublishes({
    now: new Date("2026-06-15T09:30:00.000Z"),
  });

  // Claiming would set publish_attempted_at and permanently block the entry
  // from a later run — skips must be non-destructive.
  assert.equal(claims, 0);
  assert.equal(publishCalls, 0);
  assert.equal(summary.skipped, 1);
});

test("runDuePublishes skips an entry whose platform has no connected account", async () => {
  let publishCalls = 0;
  const service = scheduler({
    listDueEntries: async () => [entry({ platform: "tiktok" })],
    listAccounts: async () => [account({ platform: "youtube" })],
    publishKit: async () => {
      publishCalls += 1;
      return job();
    },
  });

  const summary = await service.runDuePublishes({
    now: new Date("2026-06-15T09:30:00.000Z"),
  });

  assert.equal(publishCalls, 0);
  assert.equal(summary.skipped, 1);
});

test("runDuePublishes skips an entry with no generated Asset Kit", async () => {
  let publishCalls = 0;
  const service = scheduler({
    listDueEntries: async () => [entry({ assetKitId: null })],
    publishKit: async () => {
      publishCalls += 1;
      return job();
    },
  });

  const summary = await service.runDuePublishes({
    now: new Date("2026-06-15T09:30:00.000Z"),
  });

  assert.equal(publishCalls, 0);
  assert.equal(summary.skipped, 1);
});

test("runDuePublishes does not publish when another run already claimed the entry", async () => {
  let publishCalls = 0;
  const service = scheduler({
    listDueEntries: async () => [entry()],
    // A lost claim race: the conditional UPDATE matched no row.
    claimEntry: async () => null,
    publishKit: async () => {
      publishCalls += 1;
      return job();
    },
  });

  const summary = await service.runDuePublishes({
    now: new Date("2026-06-15T09:30:00.000Z"),
  });

  // The whole point of claim-before-submit: no double post, no double charge.
  assert.equal(publishCalls, 0);
  assert.equal(summary.submitted, 0);
  assert.equal(summary.skipped, 1);
});

test("runDuePublishes marks an entry failed when the publish submit throws", async () => {
  const patches: Record<string, unknown>[] = [];
  const service = scheduler({
    listDueEntries: async () => [entry()],
    publishKit: async () => {
      throw new Error("Muapi 503");
    },
    patchEntry: async (_entryId, patch) => {
      patches.push(patch as Record<string, unknown>);
      return entry();
    },
  });

  const summary = await service.runDuePublishes({
    now: new Date("2026-06-15T09:30:00.000Z"),
  });

  assert.equal(summary.failed, 1);
  assert.equal(patches.length, 1);
  assert.equal(patches[0].status, "failed");
});

test("runDuePublishes isolates a failing entry from the rest of the batch", async () => {
  const service = scheduler({
    listDueEntries: async () => [
      entry({ id: "bad", assetKitId: "kit-bad" }),
      entry({ id: "good" }),
    ],
    getPublishableKit: async (_userId, kitId) =>
      kitId === "kit-bad" ? null : kit(),
  });

  const summary = await service.runDuePublishes({
    now: new Date("2026-06-15T09:30:00.000Z"),
  });

  assert.equal(summary.submitted, 1);
});

test("runDuePublishes caps how many entries one run touches", async () => {
  let seenLimit = 0;
  const service = scheduler({
    listDueEntries: async ({ limit }) => {
      seenLimit = limit;
      return [];
    },
  });

  await service.runDuePublishes({
    now: new Date("2026-06-15T09:30:00.000Z"),
    limit: 5,
  });

  assert.equal(seenLimit, 5);
});

// --- run: platform-specific publish requests ------------------------------

test("runDuePublishes sends the entry title + kit caption for YouTube", async () => {
  let request: PublishAssetKitRequest | null = null;
  const service = scheduler({
    listDueEntries: async () => [entry({ platform: "youtube" })],
    publishKit: async (req) => {
      request = req;
      return job();
    },
  });

  await service.runDuePublishes({ now: new Date("2026-06-15T09:30:00.000Z") });

  // YouTube needs a real title; the kit's caption is the natural description.
  assert.equal(request!.title, "Sunday roast promo");
  assert.equal(request!.description, "Fresh out of the oven #roast #sunday");
});

test("runDuePublishes sends a capped composed caption for TikTok", async () => {
  let request: PublishAssetKitRequest | null = null;
  const service = scheduler({
    listDueEntries: async () => [entry({ platform: "tiktok" })],
    listAccounts: async () => [account({ platform: "tiktok" })],
    getPublishableKit: async () => kit({ caption: "y".repeat(300) }),
    publishKit: async (req) => {
      request = req;
      return job();
    },
  });

  await service.runDuePublishes({ now: new Date("2026-06-15T09:30:00.000Z") });

  // 150 is TikTok's documented cap — one over and the param builder throws.
  assert.equal(request!.title!.length, 150);
  assert.equal(request!.description, undefined);
});

// --- run: advancing in-flight entries -------------------------------------

test("runDuePublishes marks an entry published once its job completes", async () => {
  const patches: { entryId: string; patch: Record<string, unknown> }[] = [];
  const service = scheduler({
    listInFlightEntries: async () => [
      entry({ id: "entry-9", publishJobId: "job-9" }),
    ],
    refreshJob: async () => job({ id: "job-9", status: "completed" }),
    patchEntry: async (entryId, patch) => {
      patches.push({ entryId, patch: patch as Record<string, unknown> });
      return entry();
    },
  });

  const summary = await service.runDuePublishes({
    now: new Date("2026-06-15T09:30:00.000Z"),
  });

  assert.equal(summary.published, 1);
  assert.equal(patches[0].entryId, "entry-9");
  assert.equal(patches[0].patch.status, "published");
});

test("runDuePublishes marks an entry failed when its job fails", async () => {
  const patches: Record<string, unknown>[] = [];
  const service = scheduler({
    listInFlightEntries: async () => [
      entry({ id: "entry-9", publishJobId: "job-9" }),
    ],
    refreshJob: async () =>
      job({ id: "job-9", status: "failed", error: "quota exceeded" }),
    patchEntry: async (_entryId, patch) => {
      patches.push(patch as Record<string, unknown>);
      return entry();
    },
  });

  const summary = await service.runDuePublishes({
    now: new Date("2026-06-15T09:30:00.000Z"),
  });

  assert.equal(summary.failed, 1);
  assert.equal(patches[0].status, "failed");
});

test("runDuePublishes leaves a still-processing entry in flight", async () => {
  let patchCalls = 0;
  const service = scheduler({
    listInFlightEntries: async () => [
      entry({ id: "entry-9", publishJobId: "job-9" }),
    ],
    refreshJob: async () => job({ id: "job-9", status: "processing" }),
    patchEntry: async () => {
      patchCalls += 1;
      return entry();
    },
  });

  const summary = await service.runDuePublishes({
    now: new Date("2026-06-15T09:30:00.000Z"),
  });

  assert.equal(patchCalls, 0);
  assert.equal(summary.published, 0);
  assert.equal(summary.failed, 0);
});

test("runDuePublishes survives a poll error and still submits due entries", async () => {
  const service = scheduler({
    listInFlightEntries: async () => [
      entry({ id: "entry-9", publishJobId: "job-9" }),
    ],
    refreshJob: async () => {
      throw new Error("Muapi timeout");
    },
    listDueEntries: async () => [entry({ id: "entry-due" })],
  });

  const summary = await service.runDuePublishes({
    now: new Date("2026-06-15T09:30:00.000Z"),
  });

  // A transient poll failure must not cost the run its submits — the entry
  // stays in flight and the next pass re-polls it.
  assert.equal(summary.submitted, 1);
  assert.equal(summary.failed, 0);
});
