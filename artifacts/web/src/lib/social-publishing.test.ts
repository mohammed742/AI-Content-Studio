/**
 * DEV-35 (STU-31): Unit tests for the Social Publishing connection service.
 *
 * Node built-in runner + native TS type-stripping (see PROGRESS.md → DEV-15).
 * The Muapi social client and the DB upsert/list are injected as fakes, so
 * platform resolution, connect-url request building, the Muapi→row mapping
 * (including the defensive platform inference), and the sync upsert flow all
 * verify without network or DB.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  SocialPublishingService,
  resolvePlatform,
  buildConnectUrlBody,
  inferPlatform,
  mapMuapiAccount,
  normalizeNickname,
  MAX_NICKNAME_LENGTH,
  resolvePrivacy,
  buildYouTubePublishParams,
  MAX_PUBLISH_TITLE_LENGTH,
  type SocialMuapiClient,
  type MuapiSocialAccount,
  type SocialAccountUpserter,
  type SocialAccountLister,
  type SocialAccountGetter,
  type SocialAccountRenamer,
  type SocialAccountRemover,
  type PublishMuapiClient,
} from "./social-publishing.ts";
import type {
  InsertPublishJob,
  InsertSocialAccount,
  PublishJob,
  SocialAccount,
} from "@/db/schema";

function fakeRow(values: InsertSocialAccount): SocialAccount {
  return {
    id: `row_${values.muapiAccountId}`,
    userId: values.userId,
    platform: values.platform,
    muapiAccountId: values.muapiAccountId,
    platformName: values.platformName,
    accountName: values.accountName,
    nickname: values.nickname ?? null,
    connectedAt: new Date("2026-07-28T00:00:00Z"),
  };
}

test("resolvePlatform accepts the three platforms and rejects others", () => {
  assert.equal(resolvePlatform("youtube"), "youtube");
  assert.equal(resolvePlatform("tiktok"), "tiktok");
  assert.equal(resolvePlatform("instagram"), "instagram");
  assert.throws(() => resolvePlatform("facebook"), /Unsupported social platform/);
  assert.throws(() => resolvePlatform(""), /Unsupported social platform/);
});

test("buildConnectUrlBody maps + trims and validates its inputs", () => {
  assert.deepEqual(
    buildConnectUrlBody("  clerk_123 ", " https://app.example.com/api/social/callback "),
    {
      external_user_id: "clerk_123",
      redirect_to: "https://app.example.com/api/social/callback",
    },
  );
  assert.throws(() => buildConnectUrlBody("", "https://x.com"), /external_user_id is required/);
  assert.throws(() => buildConnectUrlBody("clerk_1", ""), /redirect_to must be an http/);
  assert.throws(() => buildConnectUrlBody("clerk_1", "app.example.com"), /redirect_to must be an http/);
});

test("inferPlatform reads an explicit slug, else infers from platform_name", () => {
  assert.equal(inferPlatform({ id: 1, platform: "youtube" }), "youtube");
  assert.equal(inferPlatform({ id: 2, platform_name: "TikTok Business" }), "tiktok");
  assert.equal(inferPlatform({ id: 3, platform_name: "Instagram" }), "instagram");
  assert.equal(inferPlatform({ id: 4, platform_name: "Facebook Page" }), null);
  assert.equal(inferPlatform({ id: 5 }), null);
});

test("mapMuapiAccount maps a full account, stringifying a numeric id", () => {
  assert.deepEqual(
    mapMuapiAccount("user_1", {
      id: 42,
      platform: "youtube",
      platform_name: "YouTube",
      account_name: "Acme Channel",
    }),
    {
      userId: "user_1",
      platform: "youtube",
      muapiAccountId: "42",
      platformName: "YouTube",
      accountName: "Acme Channel",
    },
  );
});

test("mapMuapiAccount falls back accountName to the id and returns null on bad input", () => {
  const mapped = mapMuapiAccount("user_1", { id: 7, platform_name: "TikTok" });
  assert.equal(mapped?.accountName, "7");
  assert.equal(mapped?.platform, "tiktok");
  // Unknown platform → null (never guess).
  assert.equal(mapMuapiAccount("user_1", { id: 9, platform_name: "LinkedIn" }), null);
  // Missing id → null.
  assert.equal(mapMuapiAccount("user_1", { id: "", platform: "youtube" }), null);
});

test("getConnectUrl resolves the platform, builds the body, and returns the url", async () => {
  const calls: Array<{ platform: string; body: unknown }> = [];
  const muapi: SocialMuapiClient = {
    getConnectUrl: async (platform, body) => {
      calls.push({ platform, body });
      return "https://accounts.google.com/o/oauth2/auth?x=1";
    },
    listAccounts: async () => [],
    disconnectAccount: async () => {},
  };
  const service = new SocialPublishingService({ muapi });
  const result = await service.getConnectUrl({
    platform: "youtube",
    externalUserId: "clerk_123",
    redirectTo: "https://app.example.com/api/social/callback",
  });
  assert.equal(result.url, "https://accounts.google.com/o/oauth2/auth?x=1");
  assert.equal(result.platform, "youtube");
  assert.deepEqual(calls, [
    {
      platform: "youtube",
      body: {
        external_user_id: "clerk_123",
        redirect_to: "https://app.example.com/api/social/callback",
      },
    },
  ]);
});

test("getConnectUrl validates before calling Muapi and rejects an empty url", async () => {
  let called = false;
  const muapi: SocialMuapiClient = {
    getConnectUrl: async () => {
      called = true;
      return "";
    },
    listAccounts: async () => [],
    disconnectAccount: async () => {},
  };
  const service = new SocialPublishingService({ muapi });
  // Bad redirect → throws before Muapi is called.
  await assert.rejects(
    service.getConnectUrl({ platform: "youtube", externalUserId: "c1", redirectTo: "nope" }),
    /redirect_to must be an http/,
  );
  assert.equal(called, false);
  // Muapi returns an empty url → surfaced as an error.
  await assert.rejects(
    service.getConnectUrl({
      platform: "youtube",
      externalUserId: "c1",
      redirectTo: "https://x.com/cb",
    }),
    /did not return a connect URL/,
  );
});

test("syncAccounts upserts every connected + mappable account, skipping the rest", async () => {
  const accounts: MuapiSocialAccount[] = [
    { id: 1, platform: "youtube", platform_name: "YouTube", account_name: "Chan" },
    { id: 2, platform: "tiktok", platform_name: "TikTok", account_name: "TT", connected: true },
    // disconnected → skipped
    { id: 3, platform: "instagram", account_name: "IG", connected: false },
    // unmappable platform → skipped
    { id: 4, platform_name: "LinkedIn", account_name: "LI" },
  ];
  const muapi: SocialMuapiClient = {
    getConnectUrl: async () => "u",
    listAccounts: async (ext) => {
      assert.equal(ext, "clerk_123");
      return accounts;
    },
    disconnectAccount: async () => {},
  };
  const upserted: InsertSocialAccount[] = [];
  const upsert: SocialAccountUpserter = async (values) => {
    upserted.push(values);
    return fakeRow(values);
  };
  const service = new SocialPublishingService({ muapi, upsert });
  const saved = await service.syncAccounts({ userId: "user_1", externalUserId: "clerk_123" });
  assert.equal(saved.length, 2);
  assert.deepEqual(
    upserted.map((v) => `${v.platform}:${v.muapiAccountId}`),
    ["youtube:1", "tiktok:2"],
  );
});

test("listAccounts passes through to the DB lister", async () => {
  const rows: SocialAccount[] = [
    fakeRow({
      userId: "user_1",
      platform: "youtube",
      muapiAccountId: "1",
      platformName: "YouTube",
      accountName: "Chan",
    }),
  ];
  const list: SocialAccountLister = async (userId) => {
    assert.equal(userId, "user_1");
    return rows;
  };
  const service = new SocialPublishingService({ list });
  assert.deepEqual(await service.listAccounts("user_1"), rows);
});

// --- DEV-34: rename (local nickname) + disconnect ------------------------

test("normalizeNickname trims, maps blank to null, and rejects overlong input", () => {
  assert.equal(normalizeNickname("  Main channel "), "Main channel");
  assert.equal(normalizeNickname(""), null);
  assert.equal(normalizeNickname("   "), null);
  assert.equal(normalizeNickname("x".repeat(MAX_NICKNAME_LENGTH)), "x".repeat(MAX_NICKNAME_LENGTH));
  assert.throws(
    () => normalizeNickname("x".repeat(MAX_NICKNAME_LENGTH + 1)),
    /characters or fewer/,
  );
});

test("renameAccount normalizes the nickname and updates the owned row", async () => {
  const calls: Array<{ userId: string; accountId: string; nickname: string | null }> = [];
  const rename: SocialAccountRenamer = async (userId, accountId, nickname) => {
    calls.push({ userId, accountId, nickname });
    return fakeRow({
      userId,
      platform: "youtube",
      muapiAccountId: "1",
      platformName: "YouTube",
      accountName: "Chan",
      nickname,
    });
  };
  const service = new SocialPublishingService({ rename });
  const row = await service.renameAccount({
    userId: "user_1",
    accountId: "row_1",
    nickname: "  My Brand  ",
  });
  assert.equal(row.nickname, "My Brand");
  assert.deepEqual(calls, [{ userId: "user_1", accountId: "row_1", nickname: "My Brand" }]);
});

test("renameAccount clears the nickname when given a blank value", async () => {
  let received: string | null = "unset";
  const rename: SocialAccountRenamer = async (userId, accountId, nickname) => {
    received = nickname;
    return fakeRow({
      userId,
      platform: "youtube",
      muapiAccountId: "1",
      platformName: "YouTube",
      accountName: "Chan",
      nickname,
    });
  };
  const service = new SocialPublishingService({ rename });
  const row = await service.renameAccount({ userId: "user_1", accountId: "row_1", nickname: "   " });
  assert.equal(received, null);
  assert.equal(row.nickname, null);
});

test("renameAccount throws when the row isn't found (or not owned)", async () => {
  const rename: SocialAccountRenamer = async () => null;
  const service = new SocialPublishingService({ rename });
  await assert.rejects(
    service.renameAccount({ userId: "user_1", accountId: "nope", nickname: "x" }),
    /Account not found/,
  );
});

test("disconnectAccount revokes on Muapi then deletes the local row, in order", async () => {
  const order: string[] = [];
  const account = fakeRow({
    userId: "user_1",
    platform: "youtube",
    muapiAccountId: "42",
    platformName: "YouTube",
    accountName: "Chan",
  });
  const getOwned: SocialAccountGetter = async (userId, accountId) => {
    order.push(`get:${userId}:${accountId}`);
    return account;
  };
  const muapi: SocialMuapiClient = {
    getConnectUrl: async () => "u",
    listAccounts: async () => [],
    disconnectAccount: async (muapiAccountId, externalUserId) => {
      order.push(`muapi:${muapiAccountId}:${externalUserId}`);
    },
  };
  const remove: SocialAccountRemover = async (userId, accountId) => {
    order.push(`remove:${userId}:${accountId}`);
  };
  const service = new SocialPublishingService({ muapi, getOwned, remove });
  await service.disconnectAccount({
    userId: "user_1",
    accountId: "row_42",
    externalUserId: "clerk_123",
  });
  assert.deepEqual(order, [
    "get:user_1:row_42",
    "muapi:42:clerk_123",
    "remove:user_1:row_42",
  ]);
});

test("disconnectAccount throws (and never calls Muapi/remove) for an unowned id", async () => {
  let touched = false;
  const getOwned: SocialAccountGetter = async () => null;
  const muapi: SocialMuapiClient = {
    getConnectUrl: async () => "u",
    listAccounts: async () => [],
    disconnectAccount: async () => {
      touched = true;
    },
  };
  const remove: SocialAccountRemover = async () => {
    touched = true;
  };
  const service = new SocialPublishingService({ muapi, getOwned, remove });
  await assert.rejects(
    service.disconnectAccount({ userId: "user_1", accountId: "nope", externalUserId: "c1" }),
    /Account not found/,
  );
  assert.equal(touched, false);
});

test("disconnectAccount does not delete the local row if Muapi revoke fails", async () => {
  let removed = false;
  const account = fakeRow({
    userId: "user_1",
    platform: "tiktok",
    muapiAccountId: "9",
    platformName: "TikTok",
    accountName: "TT",
  });
  const getOwned: SocialAccountGetter = async () => account;
  const muapi: SocialMuapiClient = {
    getConnectUrl: async () => "u",
    listAccounts: async () => [],
    disconnectAccount: async () => {
      throw new Error("Muapi disconnect failed (500)");
    },
  };
  const remove: SocialAccountRemover = async () => {
    removed = true;
  };
  const service = new SocialPublishingService({ muapi, getOwned, remove });
  await assert.rejects(
    service.disconnectAccount({ userId: "user_1", accountId: "row_9", externalUserId: "c1" }),
    /Muapi disconnect failed/,
  );
  assert.equal(removed, false);
});

// --- DEV-36: publish (Asset Kit → YouTube) -------------------------------

function ytAccount(): SocialAccount {
  return fakeRow({
    userId: "user_1",
    platform: "youtube",
    muapiAccountId: "42",
    platformName: "YouTube",
    accountName: "Acme Channel",
  });
}

function fakeJob(values: InsertPublishJob): PublishJob {
  return {
    id: values.id ?? "job_1",
    userId: values.userId,
    assetKitId: values.assetKitId ?? null,
    socialAccountId: values.socialAccountId ?? null,
    platform: values.platform,
    muapiRequestId: values.muapiRequestId ?? null,
    status: values.status ?? "processing",
    title: values.title,
    mediaUrl: values.mediaUrl,
    params: values.params,
    resultUrl: values.resultUrl ?? null,
    error: values.error ?? null,
    cost: values.cost ?? 0,
    createdAt: new Date("2026-07-29T00:00:00Z"),
    completedAt: values.completedAt ?? null,
  };
}

test("resolvePrivacy defaults to public, accepts the enum, rejects the rest", () => {
  assert.equal(resolvePrivacy(), "public");
  assert.equal(resolvePrivacy(""), "public");
  assert.equal(resolvePrivacy("  unlisted "), "unlisted");
  assert.equal(resolvePrivacy("private"), "private");
  assert.throws(() => resolvePrivacy("secret"), /Unsupported privacy/);
});

test("buildYouTubePublishParams maps + trims, coercing the text account id to an integer", () => {
  assert.deepEqual(
    buildYouTubePublishParams({
      muapiAccountId: "42",
      mediaUrl: " https://cdn.example.com/v.mp4 ",
      title: "  My Launch  ",
      description: "  A great video  ",
      tags: [" launch ", "", "sale"],
      privacy: "unlisted",
    }),
    {
      account_id: 42,
      media_url: "https://cdn.example.com/v.mp4",
      title: "My Launch",
      privacy: "unlisted",
      description: "A great video",
      tags: ["launch", "sale"],
    },
  );
});

test("buildYouTubePublishParams omits optional fields when absent/blank", () => {
  assert.deepEqual(
    buildYouTubePublishParams({
      muapiAccountId: "7",
      mediaUrl: "https://cdn.example.com/v.mp4",
      title: "Title",
      description: "   ",
      tags: ["  ", ""],
    }),
    { account_id: 7, media_url: "https://cdn.example.com/v.mp4", title: "Title", privacy: "public" },
  );
});

test("buildYouTubePublishParams fails loud on a non-integer account id", () => {
  assert.throws(
    () =>
      buildYouTubePublishParams({
        muapiAccountId: "not-a-number",
        mediaUrl: "https://cdn.example.com/v.mp4",
        title: "Title",
      }),
    /account_id must be an integer/,
  );
});

test("buildYouTubePublishParams rejects a bad media url, empty title, and overlong title", () => {
  const base = { muapiAccountId: "1", title: "Title" };
  assert.throws(
    () => buildYouTubePublishParams({ ...base, mediaUrl: "ftp://x/v.mp4" }),
    /media_url must be an http/,
  );
  assert.throws(
    () => buildYouTubePublishParams({ muapiAccountId: "1", mediaUrl: "https://x/v.mp4", title: "  " }),
    /title is required/,
  );
  assert.throws(
    () =>
      buildYouTubePublishParams({
        muapiAccountId: "1",
        mediaUrl: "https://x/v.mp4",
        title: "x".repeat(MAX_PUBLISH_TITLE_LENGTH + 1),
      }),
    /characters or fewer/,
  );
});

function fakePublishClient(
  overrides: Partial<PublishMuapiClient> = {},
): PublishMuapiClient {
  return {
    submitPublish: async () => ({ requestId: "req_1", cost: 0.01 }),
    pollPublish: async () => ({ status: "processing", cost: 0 }),
    ...overrides,
  };
}

test("publishAssetKit owns the account, builds params, submits, and records a processing job", async () => {
  const submits: Array<{ platform: string; params: unknown }> = [];
  let inserted: InsertPublishJob | undefined;
  const service = new SocialPublishingService({
    getOwned: async (userId, accountId) => {
      assert.equal(userId, "user_1");
      assert.equal(accountId, "acc_1");
      return ytAccount();
    },
    publishClient: fakePublishClient({
      submitPublish: async (platform, params) => {
        submits.push({ platform, params });
        return { requestId: "req_99", cost: 0.01 };
      },
    }),
    insertJob: async (values) => {
      inserted = values;
      return fakeJob(values);
    },
  });
  const job = await service.publishAssetKit({
    userId: "user_1",
    socialAccountId: "acc_1",
    assetKitId: "kit_1",
    mediaUrl: "https://cdn.example.com/v.mp4",
    title: "Launch",
    privacy: "public",
  });
  assert.equal(submits.length, 1);
  assert.equal(submits[0].platform, "youtube");
  assert.deepEqual(submits[0].params, {
    account_id: 42,
    media_url: "https://cdn.example.com/v.mp4",
    title: "Launch",
    privacy: "public",
  });
  assert.equal(inserted?.status, "processing");
  assert.equal(inserted?.muapiRequestId, "req_99");
  assert.equal(inserted?.socialAccountId, "row_42");
  assert.equal(inserted?.assetKitId, "kit_1");
  assert.equal(inserted?.cost, 0.01);
  assert.equal(job.status, "processing");
});

test("publishAssetKit rejects a non-YouTube account (this slice) without submitting", async () => {
  let submitted = false;
  const service = new SocialPublishingService({
    getOwned: async () =>
      fakeRow({
        userId: "user_1",
        platform: "tiktok",
        muapiAccountId: "9",
        platformName: "TikTok",
        accountName: "TT",
      }),
    publishClient: fakePublishClient({
      submitPublish: async () => {
        submitted = true;
        return { requestId: "x", cost: 0 };
      },
    }),
  });
  await assert.rejects(
    service.publishAssetKit({
      userId: "user_1",
      socialAccountId: "acc_1",
      assetKitId: "kit_1",
      mediaUrl: "https://cdn.example.com/v.mp4",
      title: "Launch",
    }),
    /Only YouTube publishing is supported/,
  );
  assert.equal(submitted, false);
});

test("publishAssetKit rejects an unowned account and never submits", async () => {
  let submitted = false;
  const service = new SocialPublishingService({
    getOwned: async () => null,
    publishClient: fakePublishClient({
      submitPublish: async () => {
        submitted = true;
        return { requestId: "x", cost: 0 };
      },
    }),
  });
  await assert.rejects(
    service.publishAssetKit({
      userId: "user_1",
      socialAccountId: "nope",
      assetKitId: "kit_1",
      mediaUrl: "https://cdn.example.com/v.mp4",
      title: "Launch",
    }),
    /Account not found/,
  );
  assert.equal(submitted, false);
});

test("refreshPublishJob persists a completed transition with the result URL", async () => {
  const params = { account_id: 42, media_url: "https://x/v.mp4", title: "T", privacy: "public" };
  const processing = fakeJob({
    userId: "user_1",
    platform: "youtube",
    muapiRequestId: "req_1",
    status: "processing",
    title: "T",
    mediaUrl: "https://x/v.mp4",
    params,
    cost: 0.01,
  });
  let patch: unknown = null;
  const service = new SocialPublishingService({
    getJob: async () => processing,
    publishClient: fakePublishClient({
      pollPublish: async (requestId) => {
        assert.equal(requestId, "req_1");
        return { status: "completed", resultUrl: "https://youtu.be/abc", cost: 0 };
      },
    }),
    updateJob: async (_userId, _jobId, p) => {
      patch = p;
      return fakeJob({ ...processing, ...p, params });
    },
  });
  const job = await service.refreshPublishJob("user_1", "job_1");
  assert.equal(job.status, "completed");
  assert.equal(job.resultUrl, "https://youtu.be/abc");
  assert.equal((patch as { cost: number }).cost, 0.01);
  assert.ok((patch as { completedAt: Date }).completedAt instanceof Date);
});

test("refreshPublishJob persists a failed transition with the error", async () => {
  const params = { account_id: 42, media_url: "https://x/v.mp4", title: "T", privacy: "public" };
  const processing = fakeJob({
    userId: "user_1",
    platform: "youtube",
    muapiRequestId: "req_1",
    status: "processing",
    title: "T",
    mediaUrl: "https://x/v.mp4",
    params,
  });
  const service = new SocialPublishingService({
    getJob: async () => processing,
    publishClient: fakePublishClient({
      pollPublish: async () => ({ status: "failed", error: "quota exceeded", cost: 0 }),
    }),
    updateJob: async (_u, _j, p) => fakeJob({ ...processing, ...p, params }),
  });
  const job = await service.refreshPublishJob("user_1", "job_1");
  assert.equal(job.status, "failed");
  assert.equal(job.error, "quota exceeded");
});

test("refreshPublishJob leaves a still-processing job untouched (no terminal write)", async () => {
  const params = { account_id: 42, media_url: "https://x/v.mp4", title: "T", privacy: "public" };
  const processing = fakeJob({
    userId: "user_1",
    platform: "youtube",
    muapiRequestId: "req_1",
    status: "processing",
    title: "T",
    mediaUrl: "https://x/v.mp4",
    params,
  });
  let updated = false;
  const service = new SocialPublishingService({
    getJob: async () => processing,
    publishClient: fakePublishClient({
      pollPublish: async () => ({ status: "processing", cost: 0 }),
    }),
    updateJob: async (_u, _j, p) => {
      updated = true;
      return fakeJob({ ...processing, ...p, params });
    },
  });
  const job = await service.refreshPublishJob("user_1", "job_1");
  assert.equal(job.status, "processing");
  assert.equal(updated, false);
});

test("refreshPublishJob never polls a job that is not processing", async () => {
  const params = { account_id: 42, media_url: "https://x/v.mp4", title: "T", privacy: "public" };
  const done = fakeJob({
    userId: "user_1",
    platform: "youtube",
    muapiRequestId: "req_1",
    status: "completed",
    title: "T",
    mediaUrl: "https://x/v.mp4",
    params,
    resultUrl: "https://youtu.be/abc",
  });
  let polled = false;
  const service = new SocialPublishingService({
    getJob: async () => done,
    publishClient: fakePublishClient({
      pollPublish: async () => {
        polled = true;
        return { status: "completed", cost: 0 };
      },
    }),
  });
  const job = await service.refreshPublishJob("user_1", "job_1");
  assert.equal(job.status, "completed");
  assert.equal(polled, false);
});

test("listPublishJobs advances processing jobs on read and isolates poll errors", async () => {
  const params = { account_id: 42, media_url: "https://x/v.mp4", title: "T", privacy: "public" };
  const good = fakeJob({
    id: "job_good", userId: "user_1", platform: "youtube", muapiRequestId: "req_good",
    status: "processing", title: "T", mediaUrl: "https://x/v.mp4", params,
  });
  const bad = fakeJob({
    id: "job_bad", userId: "user_1", platform: "youtube", muapiRequestId: "req_bad",
    status: "processing", title: "T", mediaUrl: "https://x/v.mp4", params,
  });
  const settled = fakeJob({
    id: "job_done", userId: "user_1", platform: "youtube", muapiRequestId: "req_done",
    status: "completed", title: "T", mediaUrl: "https://x/v.mp4", params, resultUrl: "https://youtu.be/z",
  });
  const service = new SocialPublishingService({
    listJobs: async () => [good, bad, settled],
    publishClient: fakePublishClient({
      pollPublish: async (requestId) => {
        if (requestId === "req_bad") throw new Error("network blip");
        return { status: "completed", resultUrl: "https://youtu.be/g", cost: 0 };
      },
    }),
    updateJob: async (_u, jobId, p) =>
      fakeJob({ ...(jobId === "job_good" ? good : bad), ...p, params }),
  });
  const jobs = await service.listPublishJobs("user_1");
  assert.equal(jobs[0].status, "completed"); // good advanced
  assert.equal(jobs[1].status, "processing"); // bad isolated, unchanged
  assert.equal(jobs[2].status, "completed"); // settled untouched
});

test("retryPublishJob resubmits the stored params and resets the same row to processing", async () => {
  const params = { account_id: 42, media_url: "https://x/v.mp4", title: "T", privacy: "public" };
  const failed = fakeJob({
    userId: "user_1", platform: "youtube", muapiRequestId: "req_old",
    status: "failed", title: "T", mediaUrl: "https://x/v.mp4", params,
    error: "boom", cost: 0.01,
  });
  let submittedParams: unknown = null;
  let patch: unknown = null;
  const service = new SocialPublishingService({
    getJob: async () => failed,
    publishClient: fakePublishClient({
      submitPublish: async (_platform, p) => {
        submittedParams = p;
        return { requestId: "req_new", cost: 0.01 };
      },
    }),
    updateJob: async (_u, _j, p) => {
      patch = p;
      return fakeJob({ ...failed, ...p, params });
    },
  });
  const job = await service.retryPublishJob("user_1", "job_1");
  assert.deepEqual(submittedParams, params); // exact same parameters (AC #3)
  assert.equal(job.status, "processing");
  assert.equal((patch as { muapiRequestId: string }).muapiRequestId, "req_new");
  assert.equal((patch as { error: string | null }).error, null);
  assert.equal((patch as { resultUrl: string | null }).resultUrl, null);
  assert.equal((patch as { cost: number }).cost, 0.02); // accumulated
});

test("retryPublishJob refuses to retry a job that is not failed", async () => {
  const params = { account_id: 42, media_url: "https://x/v.mp4", title: "T", privacy: "public" };
  let submitted = false;
  const service = new SocialPublishingService({
    getJob: async () =>
      fakeJob({
        userId: "user_1", platform: "youtube", muapiRequestId: "req_1",
        status: "processing", title: "T", mediaUrl: "https://x/v.mp4", params,
      }),
    publishClient: fakePublishClient({
      submitPublish: async () => {
        submitted = true;
        return { requestId: "x", cost: 0 };
      },
    }),
  });
  await assert.rejects(
    service.retryPublishJob("user_1", "job_1"),
    /Only failed publishes can be retried/,
  );
  assert.equal(submitted, false);
});

test("listPublishJobs passes through the DB lister for a user with no in-flight jobs", async () => {
  const service = new SocialPublishingService({ listJobs: async () => [] });
  assert.deepEqual(await service.listPublishJobs("user_1"), []);
});
