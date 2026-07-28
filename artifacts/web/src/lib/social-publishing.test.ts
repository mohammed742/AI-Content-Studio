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
  type SocialMuapiClient,
  type MuapiSocialAccount,
  type SocialAccountUpserter,
  type SocialAccountLister,
} from "./social-publishing.ts";
import type { InsertSocialAccount, SocialAccount } from "@/db/schema";

function fakeRow(values: InsertSocialAccount): SocialAccount {
  return {
    id: `row_${values.muapiAccountId}`,
    userId: values.userId,
    platform: values.platform,
    muapiAccountId: values.muapiAccountId,
    platformName: values.platformName,
    accountName: values.accountName,
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
