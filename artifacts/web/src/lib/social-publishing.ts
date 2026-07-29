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
import type { InsertSocialAccount, SocialAccount, SocialPlatform } from "@/db/schema";

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

export interface SocialPublishingServiceConfig {
  muapi?: SocialMuapiClient;
  upsert?: SocialAccountUpserter;
  list?: SocialAccountLister;
  getOwned?: SocialAccountGetter;
  rename?: SocialAccountRenamer;
  remove?: SocialAccountRemover;
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

  constructor(config: SocialPublishingServiceConfig = {}) {
    this.muapi = config.muapi ?? defaultSocialMuapiClient;
    this.upsert = config.upsert ?? defaultUpsert;
    this.lister = config.list ?? defaultList;
    this.getOwned = config.getOwned ?? defaultGetOwned;
    this.rename = config.rename ?? defaultRename;
    this.remove = config.remove ?? defaultRemove;
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
}

// --- default (real) seams -------------------------------------------------

/** The live Muapi social client. Lazy env read keeps the module test-safe. */
class DefaultSocialMuapiClient implements SocialMuapiClient {
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
}

const defaultSocialMuapiClient: SocialMuapiClient = new DefaultSocialMuapiClient();

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

export const socialPublishingService = new SocialPublishingService();
