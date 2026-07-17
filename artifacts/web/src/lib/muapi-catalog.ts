/**
 * STU-C1: Live Muapi model catalog service.
 *
 * The Model Router's routing table is hand-transcribed config; models get
 * renamed, repriced, and retired on Muapi's side without warning (this is the
 * class of drift that shipped a routed `seedream-v4` that no longer exists in
 * the catalog). This service fetches the live catalog so the router can:
 *   - override its stale hard-coded costs with live prices, and
 *   - fail loud when a routed model id has vanished from the catalog.
 *
 * The catalog endpoint (`GET /api/v1/models`) is public — no API key. It is
 * cached in memory for ~1h and is **never allowed to block or break a
 * generation**: on a fetch error we serve the last good snapshot if we have
 * one, and `tryLoad` returns `null` (rather than throwing) so callers can tell
 * "catalog unreachable" (→ silent fallback) apart from "model absent"
 * (→ fail loud). See `.agents/memory/muapi-api-contract.md`.
 */

const DEFAULT_CATALOG_URL = "https://api.muapi.ai/api/v1/models";
const DEFAULT_TTL_MS = 60 * 60 * 1000; // ~1 hour

/** What the generation UI must ask the user to supply for a model. */
export type InputType = "text" | "image" | "text+image";

/** A single model as exposed by the catalog (only the fields we consume). */
export interface CatalogModel {
  name: string;
  /** e.g. "Text to Image", "Image to Image", "Audio to Video". */
  category: string;
  /** Base cost in USD. Note: `dynamicPricing` models bill from the real body. */
  cost: number;
  dynamicPricing: boolean;
  /** `POST` here with a real body for an accurate per-request estimate. */
  estimateEndpoint?: string;
}

/** Raw shape of a catalog entry as returned by the API. */
interface RawCatalogModel {
  name: string;
  category: string;
  cost: number;
  dynamic_pricing?: boolean;
  estimate_endpoint?: string;
}

/**
 * Map a catalog `category` to the input a user must provide. Only "Text to X"
 * categories are pure-text; everything else (Image/Audio/Video to X) needs an
 * image or clip from the user.
 */
export function inputTypeForCategory(category: string): InputType {
  return category.startsWith("Text to ") ? "text" : "image";
}

/**
 * Minimal port the Model Router depends on, so tests can inject a stub without
 * touching the network.
 */
export interface CatalogPort {
  /**
   * Load the catalog as a `name → model` map, or `null` when it is unreachable
   * and no cached snapshot exists. Never throws.
   */
  tryLoad(): Promise<Map<string, CatalogModel> | null>;
}

export interface MuapiCatalogConfig {
  fetchFn?: typeof fetch;
  now?: () => number;
  ttlMs?: number;
  url?: string;
  /** API key for `estimateCost`. Omit to lazily read `MUAPI_API_KEY` from env. */
  apiKey?: string;
}

export class MuapiCatalog implements CatalogPort {
  private readonly fetchFn: typeof fetch;
  private readonly now: () => number;
  private readonly ttlMs: number;
  private readonly url: string;
  private readonly apiKey?: string;

  private cache?: { at: number; models: Map<string, CatalogModel> };
  private inflight?: Promise<Map<string, CatalogModel>>;

  constructor(config: MuapiCatalogConfig = {}) {
    this.fetchFn = config.fetchFn ?? ((input, init) => fetch(input, init));
    this.now = config.now ?? (() => Date.now());
    this.ttlMs = config.ttlMs ?? DEFAULT_TTL_MS;
    this.url = config.url ?? DEFAULT_CATALOG_URL;
    this.apiKey = config.apiKey;
  }

  /**
   * Return the cached catalog if fresh; otherwise fetch it. On a fetch failure,
   * serve the last good snapshot (however stale) rather than failing. Throws
   * only when there is no cache to fall back on — use {@link tryLoad} to get a
   * non-throwing `null` instead.
   */
  async load(): Promise<Map<string, CatalogModel>> {
    if (this.cache && this.now() - this.cache.at < this.ttlMs) {
      return this.cache.models;
    }
    // Single-flight: concurrent callers share one in-flight fetch.
    if (!this.inflight) {
      this.inflight = this.fetchCatalog()
        .then((models) => {
          this.cache = { at: this.now(), models };
          return models;
        })
        .catch((error) => {
          if (this.cache) {
            return this.cache.models; // stale-on-error
          }
          throw error;
        })
        .finally(() => {
          this.inflight = undefined;
        });
    }
    return this.inflight;
  }

  /** Non-throwing {@link load}: `null` when unreachable with no cached snapshot. */
  async tryLoad(): Promise<Map<string, CatalogModel> | null> {
    try {
      return await this.load();
    } catch {
      return null;
    }
  }

  /** Look up one model by name, or `undefined` if absent/unreachable. */
  async getModel(name: string): Promise<CatalogModel | undefined> {
    const models = await this.tryLoad();
    return models?.get(name);
  }

  /**
   * Live per-request cost estimate via `POST /models/{name}/estimate-cost`.
   * Returns `undefined` on any failure — callers fall back to the catalog's
   * base cost. Requires the API key (lazily read from env).
   */
  async estimateCost(
    name: string,
    body: Record<string, unknown>,
  ): Promise<number | undefined> {
    try {
      const apiKey = await this.resolveApiKey();
      const base = this.url.replace(/\/models$/, "");
      const response = await this.fetchFn(`${base}/models/${name}/estimate-cost`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-api-key": apiKey },
        body: JSON.stringify(body),
      });
      if (!response.ok) {
        return undefined;
      }
      const parsed = (await response.json()) as {
        cost?: number;
        amount_usd?: number;
      };
      return parsed.cost ?? parsed.amount_usd;
    } catch {
      return undefined;
    }
  }

  private async fetchCatalog(): Promise<Map<string, CatalogModel>> {
    const response = await this.fetchFn(this.url);
    if (!response.ok) {
      throw new Error(
        `Muapi catalog fetch failed: ${response.status} ${response.statusText}`,
      );
    }
    const body = (await response.json()) as { models?: RawCatalogModel[] };
    const models = new Map<string, CatalogModel>();
    for (const raw of body.models ?? []) {
      models.set(raw.name, {
        name: raw.name,
        category: raw.category,
        cost: raw.cost,
        dynamicPricing: Boolean(raw.dynamic_pricing),
        estimateEndpoint: raw.estimate_endpoint,
      });
    }
    return models;
  }

  private async resolveApiKey(): Promise<string> {
    if (this.apiKey !== undefined) {
      return this.apiKey;
    }
    // Lazy so the module is importable in unit tests without a validated env.
    const { env } = await import("@/env");
    return env.MUAPI_API_KEY;
  }
}

/** Default singleton — real `fetch`, 1h cache. */
export const muapiCatalog = new MuapiCatalog();
