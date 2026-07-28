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

// --- injectable seams -----------------------------------------------------

/** The Muapi social HTTP surface (connect-url + list accounts). Injectable. */
export interface SocialMuapiClient {
  getConnectUrl(
    platform: SocialPlatform,
    body: ConnectUrlRequestBody,
  ): Promise<string>;
  listAccounts(externalUserId: string): Promise<MuapiSocialAccount[]>;
}

/** Upsert a connected account (idempotent on user + Muapi account id). */
export type SocialAccountUpserter = (
  values: InsertSocialAccount,
) => Promise<SocialAccount>;
/** List a user's connected accounts, newest first. */
export type SocialAccountLister = (userId: string) => Promise<SocialAccount[]>;

export interface SocialPublishingServiceConfig {
  muapi?: SocialMuapiClient;
  upsert?: SocialAccountUpserter;
  list?: SocialAccountLister;
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

export class SocialPublishingService {
  private readonly muapi: SocialMuapiClient;
  private readonly upsert: SocialAccountUpserter;
  private readonly lister: SocialAccountLister;

  constructor(config: SocialPublishingServiceConfig = {}) {
    this.muapi = config.muapi ?? defaultSocialMuapiClient;
    this.upsert = config.upsert ?? defaultUpsert;
    this.lister = config.list ?? defaultList;
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

export const socialPublishingService = new SocialPublishingService();
