/**
 * DEV-35 (STU-31): Social Publishing — account connection flow (CONTEXT.md →
 * "Social Account"). The Phase-4 foundation the publish slices build on.
 *
 * Flow (verified live 2026-07-28, ARCHITECTURE.md §5):
 *   1. `getConnectUrl` → POST /social/{platform}/connect-url → { url }. We send
 *      the user to that OAuth URL.
 *   2. Muapi owns the OAuth callback itself and captures the token, then bounces
 *      the user back to our `redirect_to`. Our callback holds **no** OAuth code
 *      and **no** tokens — it just calls `syncAccounts`.
 *   3. `syncAccounts` → GET /social/ext/accounts?external_user_id=… → upsert the
 *      connected accounts into `social_accounts`.
 *
 * `external_user_id` is the Clerk id; `userId` is our internal `users.id`.
 *
 * Testability mirrors every Phase-2/3 service: the Muapi social client and the
 * DB upsert/list are injectable, so the pure mapping + flow unit-test without
 * network or DB. The default singleton wires the real endpoints + a lazy
 * `MUAPI_API_KEY` read so the module still imports under the bare Node runner.
 */
import type {
  InsertPublishJob,
  InsertSocialAccount,
  PublishJob,
  PublishJobParams,
  SocialAccount,
  SocialPlatform,
  TikTokPublishParams,
  YouTubePublishParams,
} from "@/db/schema";

/** Muapi's social publishing base — same host as the generation API. */
export const SOCIAL_MUAPI_BASE_URL = "https://api.muapi.ai/api/v1";

/**
 * Runtime platform list. The DB enum (`SOCIAL_PLATFORMS` in schema.ts) is the
 * canonical set; this is typed `readonly SocialPlatform[]` so it can't drift to
 * an invalid value. Kept local because lib modules only `import type` from
 * `@/db/schema` — a runtime value import doesn't resolve under the bare Node
 * test runner (see PROGRESS.md → DEV-15).
 */
const PLATFORMS: readonly SocialPlatform[] = ["youtube", "tiktok", "instagram"];

// --- pure helpers ---------------------------------------------------------

/** Narrow an arbitrary string to a supported platform, or throw (fail-loud). */
export function resolvePlatform(value: string): SocialPlatform {
  if ((PLATFORMS as readonly string[]).includes(value)) {
    return value as SocialPlatform;
  }
  throw new Error(`Unsupported social platform: ${value || "(empty)"}`);
}

export interface ConnectUrlRequestBody {
  external_user_id: string;
  redirect_to: string;
}

/** Build + validate the connect-url request body. */
export function buildConnectUrlBody(
  externalUserId: string,
  redirectTo: string,
): ConnectUrlRequestBody {
  const ext = externalUserId?.trim();
  if (!ext) {
    throw new Error("external_user_id is required");
  }
  const redirect = redirectTo?.trim();
  if (!redirect || !/^https?:\/\//i.test(redirect)) {
    throw new Error("redirect_to must be an http(s) URL");
  }
  return { external_user_id: ext, redirect_to: redirect };
}

/**
 * One connected account as returned by GET /social/ext/accounts. Field names
 * per the Muapi docs; the per-item `platform` slug shape isn't confirmed until
 * a real account connects (human-gated QA), so {@link inferPlatform} reads it
 * defensively rather than trusting one exact key.
 */
export interface MuapiSocialAccount {
  id: number | string;
  platform?: string;
  platform_name?: string;
  account_name?: string;
  platform_user_id?: string | number;
  connected?: boolean;
  connected_at?: string;
}

/**
 * Resolve our platform enum from an explicit `platform` slug, else infer it
 * from `platform_name` (e.g. "TikTok Business" → tiktok). Returns null when it
 * can't be resolved — callers skip rather than guess.
 */
export function inferPlatform(raw: MuapiSocialAccount): SocialPlatform | null {
  for (const candidate of [raw.platform, raw.platform_name]) {
    if (!candidate) continue;
    const lower = candidate.toLowerCase();
    for (const platform of PLATFORMS) {
      if (lower.includes(platform)) {
        return platform;
      }
    }
  }
  return null;
}

/**
 * Map a Muapi account to our insert row, or null if it can't be safely mapped
 * (unknown platform or missing id). `muapiAccountId` is stringified for id
 * parity; `accountName` falls back to the id when Muapi omits a handle.
 */
export function mapMuapiAccount(
  userId: string,
  raw: MuapiSocialAccount,
): InsertSocialAccount | null {
  const platform = inferPlatform(raw);
  if (platform === null) {
    return null;
  }
  const muapiAccountId = String(raw.id ?? "").trim();
  if (!muapiAccountId) {
    return null;
  }
  return {
    userId,
    platform,
    muapiAccountId,
    platformName: (raw.platform_name ?? platform).trim(),
    accountName: (raw.account_name ?? "").trim() || muapiAccountId,
  };
}

/** Max length of a user-set account nickname (DEV-34). */
export const MAX_NICKNAME_LENGTH = 60;

/**
 * Normalize a rename request into a stored nickname: trim, treat blank as null
 * (clears the nickname → display falls back to the platform handle), and reject
 * anything longer than {@link MAX_NICKNAME_LENGTH}.
 */
export function normalizeNickname(value: string): string | null {
  const trimmed = (value ?? "").trim();
  if (!trimmed) {
    return null;
  }
  if (trimmed.length > MAX_NICKNAME_LENGTH) {
    throw new Error(
      `Nickname must be ${MAX_NICKNAME_LENGTH} characters or fewer`,
    );
  }
  return trimmed;
}

// --- DEV-36: publish (Asset Kit → connected account) ----------------------

/** YouTube's video-privacy options (the live `youtube-publish` `privacy` enum). */
export const PUBLISH_PRIVACIES = ["public", "private", "unlisted"] as const;
export type PublishPrivacy = (typeof PUBLISH_PRIVACIES)[number];

/** YouTube caps: title ≤ 100 chars, description ≤ 5000. Validate before spending. */
export const MAX_PUBLISH_TITLE_LENGTH = 100;
export const MAX_PUBLISH_DESCRIPTION_LENGTH = 5000;

/** Narrow/normalize a privacy value, defaulting to `public`, or throw. */
export function resolvePrivacy(value?: string): PublishPrivacy {
  const v = (value ?? "").trim() || "public";
  if ((PUBLISH_PRIVACIES as readonly string[]).includes(v)) {
    return v as PublishPrivacy;
  }
  throw new Error(`Unsupported privacy: ${value}`);
}

/** Coerce our text `muapiAccountId` to the integer `account_id` Muapi requires. */
function resolveAccountId(muapiAccountId: string): number {
  const accountId = Number(muapiAccountId);
  if (!Number.isInteger(accountId)) {
    throw new Error(
      `account_id must be an integer (got ${JSON.stringify(muapiAccountId)})`,
    );
  }
  return accountId;
}

/** Trim + require an http(s) media URL (the video to publish), or throw. */
function resolveMediaUrl(mediaUrl: string): string {
  const url = mediaUrl?.trim();
  if (!url || !/^https?:\/\//i.test(url)) {
    throw new Error("media_url must be an http(s) URL");
  }
  return url;
}

export interface BuildYouTubePublishParamsInput {
  /** Muapi account id (text in our DB, integer in Muapi's schema). */
  muapiAccountId: string;
  mediaUrl: string;
  title: string;
  description?: string;
  tags?: string[];
  privacy?: string;
}

/**
 * Build + validate the `youtube-publish` request body from a connected account
 * and the fields the user chose. Fail-loud on every axis so a bad request never
 * reaches Muapi (and never spends the $0.01). Coerces our text `muapiAccountId`
 * to the integer `account_id` the live schema requires (verified DEV-36).
 */
export function buildYouTubePublishParams(
  input: BuildYouTubePublishParamsInput,
): YouTubePublishParams {
  const title = input.title?.trim();
  if (!title) {
    throw new Error("title is required");
  }
  if (title.length > MAX_PUBLISH_TITLE_LENGTH) {
    throw new Error(
      `title must be ${MAX_PUBLISH_TITLE_LENGTH} characters or fewer`,
    );
  }
  const params: YouTubePublishParams = {
    account_id: resolveAccountId(input.muapiAccountId),
    media_url: resolveMediaUrl(input.mediaUrl),
    title,
    privacy: resolvePrivacy(input.privacy),
  };
  const description = input.description?.trim();
  if (description) {
    if (description.length > MAX_PUBLISH_DESCRIPTION_LENGTH) {
      throw new Error(
        `description must be ${MAX_PUBLISH_DESCRIPTION_LENGTH} characters or fewer`,
      );
    }
    params.description = description;
  }
  if (input.tags?.length) {
    const tags = input.tags.map((t) => t.trim()).filter(Boolean);
    if (tags.length) {
      params.tags = tags;
    }
  }
  return params;
}

// --- DEV-37: TikTok publish -----------------------------------------------

/**
 * TikTok's `privacy_level` enum (the live `tiktok-publish` schema, verified
 * DEV-37) — nothing like YouTube's public/unlisted/private.
 *
 * ⚠️ QA note: an app in TikTok's unaudited/sandbox state may only permit
 * `SELF_ONLY` until content-posting is approved — a live-publish concern, not a
 * validation one.
 */
export const TIKTOK_PRIVACY_LEVELS = [
  "PUBLIC_TO_EVERYONE",
  "MUTUAL_FOLLOW_FRIENDS",
  "FOLLOWER_OF_CREATOR",
  "SELF_ONLY",
] as const;
export type TikTokPrivacyLevel = (typeof TIKTOK_PRIVACY_LEVELS)[number];

/** TikTok caption cap (the schema documents `title` as "max 150 chars"). */
export const MAX_TIKTOK_CAPTION_LENGTH = 150;

/** Narrow/normalize a TikTok privacy level, defaulting to public, or throw. */
export function resolvePrivacyLevel(value?: string): TikTokPrivacyLevel {
  const v = (value ?? "").trim() || "PUBLIC_TO_EVERYONE";
  if ((TIKTOK_PRIVACY_LEVELS as readonly string[]).includes(v)) {
    return v as TikTokPrivacyLevel;
  }
  throw new Error(`Unsupported privacy_level: ${value}`);
}

export interface BuildTikTokPublishParamsInput {
  muapiAccountId: string;
  mediaUrl: string;
  /** The caption (TikTok's `title`); optional, ≤150 chars. */
  title?: string;
  privacyLevel?: string;
  allowComment?: boolean;
  allowDuet?: boolean;
  allowStitch?: boolean;
  isAiGenerated?: boolean;
}

/**
 * Build + validate the `tiktok-publish` request body. Fail-loud on account id,
 * media URL, caption length, and privacy level before spending the $0.02.
 *
 * Interaction toggles default open (allow_comment/duet/stitch = true), matching
 * TikTok's own defaults. `is_ai_generated` defaults **true** — every Asset Kit
 * this app publishes is AI-generated, and TikTok requires that disclosure.
 */
export function buildTikTokPublishParams(
  input: BuildTikTokPublishParamsInput,
): TikTokPublishParams {
  const params: TikTokPublishParams = {
    account_id: resolveAccountId(input.muapiAccountId),
    media_url: resolveMediaUrl(input.mediaUrl),
    privacy_level: resolvePrivacyLevel(input.privacyLevel),
    allow_comment: input.allowComment ?? true,
    allow_duet: input.allowDuet ?? true,
    allow_stitch: input.allowStitch ?? true,
    is_ai_generated: input.isAiGenerated ?? true,
  };
  const caption = input.title?.trim();
  if (caption) {
    if (caption.length > MAX_TIKTOK_CAPTION_LENGTH) {
      throw new Error(
        `caption must be ${MAX_TIKTOK_CAPTION_LENGTH} characters or fewer`,
      );
    }
    params.title = caption;
  }
  return params;
}

/**
 * Dispatch to the platform-specific params builder and derive the denormalized
 * job title (the history label). Instagram publishing lands in DEV-38, so it
 * fails loud here rather than silently building an unsupported body.
 */
function buildPublishParams(
  account: SocialAccount,
  request: PublishAssetKitRequest,
): { params: PublishJobParams; jobTitle: string } {
  if (account.platform === "youtube") {
    const params = buildYouTubePublishParams({
      muapiAccountId: account.muapiAccountId,
      mediaUrl: request.mediaUrl,
      title: request.title ?? "",
      description: request.description,
      tags: request.tags,
      privacy: request.privacy,
    });
    return { params, jobTitle: params.title };
  }
  if (account.platform === "tiktok") {
    const params = buildTikTokPublishParams({
      muapiAccountId: account.muapiAccountId,
      mediaUrl: request.mediaUrl,
      title: request.title,
      privacyLevel: request.privacyLevel,
      allowComment: request.allowComment,
      allowDuet: request.allowDuet,
      allowStitch: request.allowStitch,
      isAiGenerated: request.isAiGenerated,
    });
    // Caption is optional — fall back to a stable label so history is readable.
    const jobTitle =
      params.title || request.title?.trim() || "Untitled TikTok video";
    return { params, jobTitle };
  }
  throw new Error("Instagram publishing isn't available yet");
}

// --- injectable seams -----------------------------------------------------

/**
 * The Muapi social HTTP surface (connect-url + list + disconnect). Injectable.
 * `disconnectAccount` revokes the connection on Muapi's side; the id is the
 * account's `muapiAccountId`.
 */
export interface SocialMuapiClient {
  getConnectUrl(
    platform: SocialPlatform,
    body: ConnectUrlRequestBody,
  ): Promise<string>;
  listAccounts(externalUserId: string): Promise<MuapiSocialAccount[]>;
  disconnectAccount(
    muapiAccountId: string,
    externalUserId: string,
  ): Promise<void>;
}

/** Upsert a connected account (idempotent on user + Muapi account id). */
export type SocialAccountUpserter = (
  values: InsertSocialAccount,
) => Promise<SocialAccount>;
/** List a user's connected accounts, newest first. */
export type SocialAccountLister = (userId: string) => Promise<SocialAccount[]>;
/** Fetch one of a user's accounts by id (ownership-scoped), or null. */
export type SocialAccountGetter = (
  userId: string,
  accountId: string,
) => Promise<SocialAccount | null>;
/** Set an account's nickname (ownership-scoped); returns the row, or null if not found. */
export type SocialAccountRenamer = (
  userId: string,
  accountId: string,
  nickname: string | null,
) => Promise<SocialAccount | null>;
/** Delete one of a user's accounts (ownership-scoped). */
export type SocialAccountRemover = (
  userId: string,
  accountId: string,
) => Promise<void>;

/** Result of submitting a publish job to Muapi (before polling). */
export interface PublishSubmitResult {
  requestId: string;
  cost: number;
}
/** One poll of a publish job's async result. Non-terminal states → `processing`. */
export interface PublishPollResult {
  status: "processing" | "completed" | "failed";
  /** The live post URL, present once `completed`. */
  resultUrl?: string;
  error?: string;
  cost: number;
}

/**
 * Muapi's publish surface — a separate seam from {@link SocialMuapiClient} so the
 * connect/disconnect fakes don't have to know about publishing. Publish is a
 * Muapi model slug (`{platform}-publish`, $0.01) with the standard submit→poll
 * async shape, so this splits the two halves for advance-on-read polling.
 */
export interface PublishMuapiClient {
  submitPublish(
    platform: SocialPlatform,
    params: PublishJobParams,
  ): Promise<PublishSubmitResult>;
  pollPublish(requestId: string): Promise<PublishPollResult>;
}

/** Fields we ever patch on an in-flight publish job. */
export type PublishJobPatch = Partial<
  Pick<
    PublishJob,
    "status" | "muapiRequestId" | "resultUrl" | "error" | "cost" | "completedAt"
  >
>;
/** Insert a publish job row. */
export type PublishJobInserter = (values: InsertPublishJob) => Promise<PublishJob>;
/** Update an owned publish job (scoped by user + id); null if not found. */
export type PublishJobUpdater = (
  userId: string,
  jobId: string,
  patch: PublishJobPatch,
) => Promise<PublishJob | null>;
/** Fetch one owned publish job, or null. */
export type PublishJobGetter = (
  userId: string,
  jobId: string,
) => Promise<PublishJob | null>;
/** List a user's publish jobs, newest first. */
export type PublishJobLister = (userId: string) => Promise<PublishJob[]>;

export interface SocialPublishingServiceConfig {
  muapi?: SocialMuapiClient;
  upsert?: SocialAccountUpserter;
  list?: SocialAccountLister;
  getOwned?: SocialAccountGetter;
  rename?: SocialAccountRenamer;
  remove?: SocialAccountRemover;
  publishClient?: PublishMuapiClient;
  insertJob?: PublishJobInserter;
  updateJob?: PublishJobUpdater;
  getJob?: PublishJobGetter;
  listJobs?: PublishJobLister;
}

export interface PublishAssetKitRequest {
  userId: string;
  socialAccountId: string;
  /** The Asset Kit being published (stored on the job for history/retry). */
  assetKitId: string;
  /** The kit's R2 media URL (the route resolves this from the owned kit). */
  mediaUrl: string;
  /** Title (YouTube) / caption (TikTok). Required for YouTube; optional for TikTok. */
  title?: string;
  // YouTube-only fields.
  description?: string;
  tags?: string[];
  privacy?: string;
  // TikTok-only fields.
  privacyLevel?: string;
  allowComment?: boolean;
  allowDuet?: boolean;
  allowStitch?: boolean;
  isAiGenerated?: boolean;
}

export interface GetConnectUrlRequest {
  platform: string;
  externalUserId: string;
  redirectTo: string;
}

export interface SyncAccountsRequest {
  userId: string;
  externalUserId: string;
}

export interface RenameAccountRequest {
  userId: string;
  accountId: string;
  /** Raw nickname; blank clears it (normalized via {@link normalizeNickname}). */
  nickname: string;
}

export interface DisconnectAccountRequest {
  userId: string;
  accountId: string;
  /** Clerk id — Muapi scopes the revoke to this external user. */
  externalUserId: string;
}

export class SocialPublishingService {
  private readonly muapi: SocialMuapiClient;
  private readonly upsert: SocialAccountUpserter;
  private readonly lister: SocialAccountLister;
  private readonly getOwned: SocialAccountGetter;
  private readonly rename: SocialAccountRenamer;
  private readonly remove: SocialAccountRemover;
  private readonly publishClient: PublishMuapiClient;
  private readonly insertJob: PublishJobInserter;
  private readonly updateJob: PublishJobUpdater;
  private readonly getJob: PublishJobGetter;
  private readonly listJobs: PublishJobLister;

  constructor(config: SocialPublishingServiceConfig = {}) {
    this.muapi = config.muapi ?? defaultSocialMuapiClient;
    this.upsert = config.upsert ?? defaultUpsert;
    this.lister = config.list ?? defaultList;
    this.getOwned = config.getOwned ?? defaultGetOwned;
    this.rename = config.rename ?? defaultRename;
    this.remove = config.remove ?? defaultRemove;
    this.publishClient = config.publishClient ?? defaultSocialMuapiClient;
    this.insertJob = config.insertJob ?? defaultInsertJob;
    this.updateJob = config.updateJob ?? defaultUpdateJob;
    this.getJob = config.getJob ?? defaultGetJob;
    this.listJobs = config.listJobs ?? defaultListJobs;
  }

  /**
   * Generate the OAuth connect URL for a platform. Validates inputs before
   * touching Muapi; throws if Muapi returns no URL.
   */
  async getConnectUrl(
    request: GetConnectUrlRequest,
  ): Promise<{ url: string; platform: SocialPlatform }> {
    const platform = resolvePlatform(request.platform);
    const body = buildConnectUrlBody(request.externalUserId, request.redirectTo);
    const url = await this.muapi.getConnectUrl(platform, body);
    if (!url) {
      throw new Error("Muapi did not return a connect URL");
    }
    return { url, platform };
  }

  /**
   * Fetch the user's connected accounts from Muapi and upsert them. Skips
   * disconnected accounts and any whose platform can't be resolved. Idempotent
   * — safe to call on every callback return.
   */
  async syncAccounts(request: SyncAccountsRequest): Promise<SocialAccount[]> {
    const raw = await this.muapi.listAccounts(request.externalUserId);
    const saved: SocialAccount[] = [];
    for (const item of raw) {
      if (item.connected === false) {
        continue;
      }
      const values = mapMuapiAccount(request.userId, item);
      if (!values) {
        continue;
      }
      saved.push(await this.upsert(values));
    }
    return saved;
  }

  /** A user's connected accounts (for the /social page). */
  listAccounts(userId: string): Promise<SocialAccount[]> {
    return this.lister(userId);
  }

  /**
   * Rename an account — a local friendly label only (you can't rename a real
   * platform handle via API). Normalizes the input (blank clears it) and updates
   * the row scoped to the owner. Throws if the row isn't found or isn't theirs.
   */
  async renameAccount(request: RenameAccountRequest): Promise<SocialAccount> {
    const nickname = normalizeNickname(request.nickname);
    const row = await this.rename(request.userId, request.accountId, nickname);
    if (!row) {
      throw new Error("Account not found");
    }
    return row;
  }

  /**
   * Disconnect an account: revoke it on Muapi first, then delete our local row
   * (so a later callback re-sync can't resurrect it). Ownership-scoped — throws
   * before touching Muapi if the id isn't the user's. If the Muapi revoke fails
   * the local row is kept, so the two never silently drift.
   */
  async disconnectAccount(request: DisconnectAccountRequest): Promise<void> {
    const account = await this.getOwned(request.userId, request.accountId);
    if (!account) {
      throw new Error("Account not found");
    }
    await this.muapi.disconnectAccount(
      account.muapiAccountId,
      request.externalUserId,
    );
    await this.remove(request.userId, request.accountId);
  }

  // --- DEV-36: publish ----------------------------------------------------

  /**
   * Publish an Asset Kit to a connected account: resolve + own the account,
   * build the platform params (fail-loud before spending), submit to Muapi, and
   * record a `processing` job carrying the async request id + a params snapshot
   * (for Retry + history). Does NOT poll — the job advances on read.
   *
   * YouTube (DEV-36) + TikTok (DEV-37); Instagram is DEV-38.
   */
  async publishAssetKit(request: PublishAssetKitRequest): Promise<PublishJob> {
    const account = await this.getOwned(request.userId, request.socialAccountId);
    if (!account) {
      throw new Error("Account not found");
    }
    const { params, jobTitle } = buildPublishParams(account, request);
    const submit = await this.publishClient.submitPublish(account.platform, params);
    return this.insertJob({
      userId: request.userId,
      assetKitId: request.assetKitId,
      socialAccountId: account.id,
      platform: account.platform,
      muapiRequestId: submit.requestId,
      status: "processing",
      title: jobTitle,
      mediaUrl: params.media_url,
      params,
      cost: submit.cost,
    });
  }

  /**
   * Poll one owned job once and persist any terminal transition. A no-op for a
   * job that isn't `processing` (or has no request id).
   */
  async refreshPublishJob(userId: string, jobId: string): Promise<PublishJob> {
    const job = await this.getJob(userId, jobId);
    if (!job) {
      throw new Error("Publish job not found");
    }
    return this.advanceJob(job);
  }

  /** Poll + persist for a single job. Assumes the job is already owned. */
  private async advanceJob(job: PublishJob): Promise<PublishJob> {
    if (job.status !== "processing" || !job.muapiRequestId) {
      return job;
    }
    const poll = await this.publishClient.pollPublish(job.muapiRequestId);
    const cost = job.cost + poll.cost;
    if (poll.status === "completed") {
      return (
        (await this.updateJob(job.userId, job.id, {
          status: "completed",
          resultUrl: poll.resultUrl ?? null,
          error: null,
          cost,
          completedAt: new Date(),
        })) ?? job
      );
    }
    if (poll.status === "failed") {
      return (
        (await this.updateJob(job.userId, job.id, {
          status: "failed",
          error: poll.error ?? "Publish failed",
          cost,
          completedAt: new Date(),
        })) ?? job
      );
    }
    // Still processing — persist incremental cost only if Muapi reported some.
    if (poll.cost > 0) {
      return (await this.updateJob(job.userId, job.id, { cost })) ?? job;
    }
    return job;
  }

  /**
   * A user's publish jobs, newest first, advancing any `processing` job on read
   * (so the /social page's poll drives status without a separate cron). A poll
   * error for one job is isolated — it stays `processing` rather than breaking
   * the whole list.
   */
  async listPublishJobs(userId: string): Promise<PublishJob[]> {
    const jobs = await this.listJobs(userId);
    return Promise.all(
      jobs.map(async (job) => {
        if (job.status !== "processing" || !job.muapiRequestId) {
          return job;
        }
        try {
          return await this.advanceJob(job);
        } catch {
          return job;
        }
      }),
    );
  }

  /**
   * Retry a failed publish by resubmitting the exact stored params (AC #3) and
   * resetting the same row to `processing` with a fresh request id — one row per
   * publish intent, so history stays clean.
   */
  async retryPublishJob(userId: string, jobId: string): Promise<PublishJob> {
    const job = await this.getJob(userId, jobId);
    if (!job) {
      throw new Error("Publish job not found");
    }
    if (job.status !== "failed") {
      throw new Error("Only failed publishes can be retried");
    }
    const submit = await this.publishClient.submitPublish(job.platform, job.params);
    return (
      (await this.updateJob(userId, jobId, {
        status: "processing",
        muapiRequestId: submit.requestId,
        error: null,
        resultUrl: null,
        completedAt: null,
        cost: job.cost + submit.cost,
      })) ?? job
    );
  }
}

// --- default (real) seams -------------------------------------------------

/** Read COGS from the `X-MuAPI-Cost-USD` header, falling back to the body. */
function readCost(res: Response, body: { cost?: { amount_usd?: number } }): number {
  const header = res.headers.get("X-MuAPI-Cost-USD");
  if (header) {
    const parsed = Number.parseFloat(header);
    if (!Number.isNaN(parsed)) {
      return parsed;
    }
  }
  return body.cost?.amount_usd ?? 0;
}

/** The live Muapi social client. Lazy env read keeps the module test-safe. */
class DefaultSocialMuapiClient implements SocialMuapiClient, PublishMuapiClient {
  private readonly baseUrl: string;
  private readonly fetchFn: typeof fetch;

  constructor(
    baseUrl: string = SOCIAL_MUAPI_BASE_URL,
    fetchFn: typeof fetch = (input, init) => fetch(input, init),
  ) {
    this.baseUrl = baseUrl;
    this.fetchFn = fetchFn;
  }

  private async apiKey(): Promise<string> {
    const { env } = await import("@/env");
    return env.MUAPI_API_KEY;
  }

  async getConnectUrl(
    platform: SocialPlatform,
    body: ConnectUrlRequestBody,
  ): Promise<string> {
    const key = await this.apiKey();
    const res = await this.fetchFn(`${this.baseUrl}/social/${platform}/connect-url`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": key },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      throw new Error(
        `Muapi connect-url failed (${res.status} ${res.statusText}): ${await res.text().catch(() => "")}`,
      );
    }
    const json = (await res.json()) as { url?: string };
    return json.url ?? "";
  }

  async listAccounts(externalUserId: string): Promise<MuapiSocialAccount[]> {
    const key = await this.apiKey();
    const res = await this.fetchFn(
      `${this.baseUrl}/social/ext/accounts?external_user_id=${encodeURIComponent(externalUserId)}`,
      { headers: { "x-api-key": key } },
    );
    if (!res.ok) {
      throw new Error(
        `Muapi list-accounts failed (${res.status} ${res.statusText}): ${await res.text().catch(() => "")}`,
      );
    }
    const json = await res.json();
    return Array.isArray(json) ? (json as MuapiSocialAccount[]) : [];
  }

  async disconnectAccount(
    muapiAccountId: string,
    externalUserId: string,
  ): Promise<void> {
    const key = await this.apiKey();
    // DELETE /social/ext/accounts/{id} — liveness-verified 2026-07-28 (DEV-34):
    // a bogus id returns a resource-specific 404 "Account not found", so the
    // route exists. external_user_id scopes the revoke to the owner.
    const res = await this.fetchFn(
      `${this.baseUrl}/social/ext/accounts/${encodeURIComponent(muapiAccountId)}?external_user_id=${encodeURIComponent(externalUserId)}`,
      { method: "DELETE", headers: { "x-api-key": key } },
    );
    // 404 = already gone on Muapi's side → idempotent success (we still drop our
    // local row). Any other non-2xx is a real failure and must not delete locally.
    if (!res.ok && res.status !== 404) {
      throw new Error(
        `Muapi disconnect failed (${res.status} ${res.statusText}): ${await res.text().catch(() => "")}`,
      );
    }
  }

  async submitPublish(
    platform: SocialPlatform,
    params: PublishJobParams,
  ): Promise<PublishSubmitResult> {
    const key = await this.apiKey();
    // Publish is a Muapi model slug: POST /{platform}-publish → { request_id }.
    // Verified live 2026-07-28 (DEV-36) for youtube-publish; $0.01 each.
    const res = await this.fetchFn(`${this.baseUrl}/${platform}-publish`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": key },
      body: JSON.stringify(params),
    });
    if (!res.ok) {
      throw new Error(
        `Muapi publish submit failed (${res.status} ${res.statusText}): ${await res.text().catch(() => "")}`,
      );
    }
    const json = (await res.json()) as {
      request_id?: string;
      cost?: { amount_usd?: number };
    };
    const requestId = json.request_id ?? "";
    if (!requestId) {
      throw new Error("Muapi publish submit did not return a request_id");
    }
    return { requestId, cost: readCost(res, json) };
  }

  async pollPublish(requestId: string): Promise<PublishPollResult> {
    const key = await this.apiKey();
    const res = await this.fetchFn(
      `${this.baseUrl}/predictions/${encodeURIComponent(requestId)}/result`,
      { headers: { "x-api-key": key } },
    );
    if (!res.ok) {
      throw new Error(
        `Muapi publish poll failed (${res.status} ${res.statusText}): ${await res.text().catch(() => "")}`,
      );
    }
    const json = (await res.json()) as {
      status?: string;
      outputs?: string[];
      error?: string;
      result_url?: string;
      url?: string;
      cost?: { amount_usd?: number };
    };
    const cost = readCost(res, json);
    if (json.status === "completed") {
      // The live post URL. Publish completion is human-gated QA (needs a real
      // OAuth'd channel), so read the most likely fields defensively.
      const resultUrl =
        json.outputs?.[0] ?? json.result_url ?? json.url ?? "";
      return { status: "completed", resultUrl, cost };
    }
    if (json.status === "failed" || json.status === "cancelled") {
      return { status: "failed", error: json.error ?? "Publish failed", cost };
    }
    return { status: "processing", cost };
  }
}

const defaultSocialMuapiClient = new DefaultSocialMuapiClient();

/** Default upsert — idempotent on the (user, Muapi account) unique index. */
const defaultUpsert: SocialAccountUpserter = async (values) => {
  const [{ db }, { socialAccounts }] = await Promise.all([
    import("@/db"),
    import("@/db/schema"),
  ]);
  const [row] = await db
    .insert(socialAccounts)
    .values(values)
    .onConflictDoUpdate({
      target: [socialAccounts.userId, socialAccounts.muapiAccountId],
      set: {
        platform: values.platform,
        platformName: values.platformName,
        accountName: values.accountName,
      },
    })
    .returning();
  return row;
};

/** Default lister — a user's accounts, newest connection first. */
const defaultList: SocialAccountLister = async (userId) => {
  const [{ db }, { socialAccounts }, { desc, eq }] = await Promise.all([
    import("@/db"),
    import("@/db/schema"),
    import("drizzle-orm"),
  ]);
  return db
    .select()
    .from(socialAccounts)
    .where(eq(socialAccounts.userId, userId))
    .orderBy(desc(socialAccounts.connectedAt));
};

/** Default getter — one account by id, scoped to the owner (null if not theirs). */
const defaultGetOwned: SocialAccountGetter = async (userId, accountId) => {
  const [{ db }, { socialAccounts }, { and, eq }] = await Promise.all([
    import("@/db"),
    import("@/db/schema"),
    import("drizzle-orm"),
  ]);
  const [row] = await db
    .select()
    .from(socialAccounts)
    .where(
      and(eq(socialAccounts.userId, userId), eq(socialAccounts.id, accountId)),
    )
    .limit(1);
  return row ?? null;
};

/** Default renamer — set the nickname on an owned row; returns it, or null. */
const defaultRename: SocialAccountRenamer = async (userId, accountId, nickname) => {
  const [{ db }, { socialAccounts }, { and, eq }] = await Promise.all([
    import("@/db"),
    import("@/db/schema"),
    import("drizzle-orm"),
  ]);
  const [row] = await db
    .update(socialAccounts)
    .set({ nickname })
    .where(
      and(eq(socialAccounts.userId, userId), eq(socialAccounts.id, accountId)),
    )
    .returning();
  return row ?? null;
};

/** Default remover — delete an owned row (no-op if it isn't theirs). */
const defaultRemove: SocialAccountRemover = async (userId, accountId) => {
  const [{ db }, { socialAccounts }, { and, eq }] = await Promise.all([
    import("@/db"),
    import("@/db/schema"),
    import("drizzle-orm"),
  ]);
  await db
    .delete(socialAccounts)
    .where(
      and(eq(socialAccounts.userId, userId), eq(socialAccounts.id, accountId)),
    );
};

/** Default insert — a new publish job row. */
const defaultInsertJob: PublishJobInserter = async (values) => {
  const [{ db }, { publishJobs }] = await Promise.all([
    import("@/db"),
    import("@/db/schema"),
  ]);
  const [row] = await db.insert(publishJobs).values(values).returning();
  return row;
};

/** Default update — patch an owned job (scoped by user + id); null if not found. */
const defaultUpdateJob: PublishJobUpdater = async (userId, jobId, patch) => {
  const [{ db }, { publishJobs }, { and, eq }] = await Promise.all([
    import("@/db"),
    import("@/db/schema"),
    import("drizzle-orm"),
  ]);
  const [row] = await db
    .update(publishJobs)
    .set(patch)
    .where(and(eq(publishJobs.userId, userId), eq(publishJobs.id, jobId)))
    .returning();
  return row ?? null;
};

/** Default getter — one owned job by id (null if not theirs). */
const defaultGetJob: PublishJobGetter = async (userId, jobId) => {
  const [{ db }, { publishJobs }, { and, eq }] = await Promise.all([
    import("@/db"),
    import("@/db/schema"),
    import("drizzle-orm"),
  ]);
  const [row] = await db
    .select()
    .from(publishJobs)
    .where(and(eq(publishJobs.userId, userId), eq(publishJobs.id, jobId)))
    .limit(1);
  return row ?? null;
};

/** Default lister — a user's publish jobs, newest first. */
const defaultListJobs: PublishJobLister = async (userId) => {
  const [{ db }, { publishJobs }, { desc, eq }] = await Promise.all([
    import("@/db"),
    import("@/db/schema"),
    import("drizzle-orm"),
  ]);
  return db
    .select()
    .from(publishJobs)
    .where(eq(publishJobs.userId, userId))
    .orderBy(desc(publishJobs.createdAt));
};

export const socialPublishingService = new SocialPublishingService();
