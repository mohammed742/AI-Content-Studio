/**
 * Muapi.ai integration service — the Execute step of the Agent Loop
 * (Plan → Retrieve → Route → **Execute** → Assemble → Publish).
 *
 * DEV-8 built the minimal submit-then-poll client for the tracer. DEV-15
 * turns it into the real service every Phase-2 generation slice depends on:
 * API wrapper + credit tracking + error handling + retry with exponential
 * backoff.
 *
 * Muapi's contract (verified live in DEV-8, https://muapi.ai/docs/api-reference):
 *   1. POST https://api.muapi.ai/api/v1/{model}            -> { request_id, status, cost }
 *   2. GET  https://api.muapi.ai/api/v1/predictions/{id}/result   (polled until "completed")
 * Auth is an `x-api-key` header (not Bearer). Cost (COGS) is read from the
 * `X-MuAPI-Cost-USD` response header, falling back to the body's
 * `cost.amount_usd`.
 *
 * Testability: all side-effecting collaborators (`fetch`, `sleep`, the clock,
 * the API key, the logger) are injectable via the constructor, so unit tests
 * exercise every retry/backoff/timeout path instantly without the network or a
 * real key. The default singleton wires in the real `fetch`, a console-backed
 * pipeline logger, and lazily reads `MUAPI_API_KEY` from the validated env.
 */

import { persistentPipelineLogger } from "./pipeline-log.ts";

export interface MuapiGenerateParams {
  prompt?: string;
  [key: string]: unknown;
}

export interface MuapiGenerateResult {
  /** All output URLs returned by the model (images, and later video clips). */
  outputs: string[];
  /** Convenience alias for `outputs[0]` — the primary generated asset. */
  imageUrl: string;
  /** Cost of this generation in USD (COGS), from `X-MuAPI-Cost-USD`. */
  cost: number;
  model: string;
  requestId: string;
}

/**
 * One row's worth of a `pipeline_logs` entry (CONTEXT.md → "Pipeline Log").
 * The table doesn't exist yet (created in a later DB slice), so DEV-15 emits
 * these through an injectable logger and defers persistence.
 */
export interface PipelineLogEntry {
  step: string;
  model: string;
  durationMs: number;
  success: boolean;
  cost: number;
  error?: string;
}

export type PipelineLogger = (entry: PipelineLogEntry) => void;

export interface MuapiServiceConfig {
  /** API key. Omit to lazily read `MUAPI_API_KEY` from the validated env. */
  apiKey?: string;
  baseUrl?: string;
  fetchFn?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
  /** Retries after the first attempt for network errors, 429, and 5xx. */
  maxRetries?: number;
  baseDelayMs?: number;
  pollIntervalMs?: number;
  pollTimeoutMs?: number;
  logger?: PipelineLogger;
}

export interface MuapiGenerateOptions {
  /** Pipeline step label recorded in the log entry. Defaults to "execute". */
  step?: string;
  /** Per-call logger override (falls back to the service's logger). */
  logger?: PipelineLogger;
}

export class MuapiError extends Error {
  readonly status?: number;
  readonly retryable: boolean;

  constructor(
    message: string,
    options: { status?: number; retryable?: boolean; cause?: unknown } = {},
  ) {
    super(message, options.cause !== undefined ? { cause: options.cause } : undefined);
    this.name = "MuapiError";
    this.status = options.status;
    this.retryable = options.retryable ?? false;
  }
}

const DEFAULT_BASE_URL = "https://api.muapi.ai/api/v1";
const DEFAULT_MAX_RETRIES = 3;
const DEFAULT_BASE_DELAY_MS = 500;
const DEFAULT_POLL_INTERVAL_MS = 2000;
const DEFAULT_POLL_TIMEOUT_MS = 60_000;
/** The Agent Loop step this service performs (CONTEXT.md → "Execute Step"). */
const DEFAULT_STEP = "execute";

interface MuapiSubmitResponseBody {
  request_id?: string;
  status?: string;
  cost?: { amount_usd?: number };
}

interface MuapiResultResponseBody {
  id?: string;
  status?: string;
  outputs?: string[];
  error?: string;
  cost?: { amount_usd?: number };
}

function parseCost(
  response: Response,
  body: { cost?: { amount_usd?: number } },
): number {
  const headerCost = response.headers.get("X-MuAPI-Cost-USD");
  if (headerCost) {
    const parsed = Number.parseFloat(headerCost);
    if (!Number.isNaN(parsed)) {
      return parsed;
    }
  }
  return body.cost?.amount_usd ?? 0;
}

function isRetryableStatus(status: number): boolean {
  return status === 429 || status >= 500;
}

export class MuapiService {
  private readonly apiKey?: string;
  private readonly baseUrl: string;
  private readonly fetchFn: typeof fetch;
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly now: () => number;
  private readonly maxRetries: number;
  private readonly baseDelayMs: number;
  private readonly pollIntervalMs: number;
  private readonly pollTimeoutMs: number;
  private readonly logger?: PipelineLogger;

  constructor(config: MuapiServiceConfig = {}) {
    this.apiKey = config.apiKey;
    this.baseUrl = config.baseUrl ?? DEFAULT_BASE_URL;
    // Wrap so a global `fetch` isn't called with the wrong `this`.
    this.fetchFn = config.fetchFn ?? ((input, init) => fetch(input, init));
    this.sleep =
      config.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
    this.now = config.now ?? (() => Date.now());
    this.maxRetries = config.maxRetries ?? DEFAULT_MAX_RETRIES;
    this.baseDelayMs = config.baseDelayMs ?? DEFAULT_BASE_DELAY_MS;
    this.pollIntervalMs = config.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS;
    this.pollTimeoutMs = config.pollTimeoutMs ?? DEFAULT_POLL_TIMEOUT_MS;
    this.logger = config.logger;
  }

  /**
   * Submit a generation to `model` and poll until it completes, returning the
   * output URL(s) and cost. Retries transient failures with exponential
   * backoff and throws a {@link MuapiError} on terminal failure or timeout.
   */
  async generate(
    model: string,
    params: MuapiGenerateParams,
    options: MuapiGenerateOptions = {},
  ): Promise<MuapiGenerateResult> {
    const step = options.step ?? DEFAULT_STEP;
    const logger = options.logger ?? this.logger;
    const startedAt = this.now();
    let cost = 0;

    try {
      const apiKey = await this.resolveApiKey();

      const submitResponse = await this.fetchWithRetry(`${this.baseUrl}/${model}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": apiKey,
        },
        body: JSON.stringify(params),
      });
      if (!submitResponse.ok) {
        throw await this.toError(submitResponse, "submit");
      }

      const submitBody = (await submitResponse.json()) as MuapiSubmitResponseBody;
      cost = parseCost(submitResponse, submitBody) || cost;

      const requestId = submitBody.request_id;
      if (!requestId) {
        throw new MuapiError("Muapi submit response did not include a request_id");
      }

      const resultUrl = `${this.baseUrl}/predictions/${requestId}/result`;
      const deadline = this.now() + this.pollTimeoutMs;

      for (;;) {
        const resultResponse = await this.fetchWithRetry(resultUrl, {
          headers: { "x-api-key": apiKey },
        });
        if (!resultResponse.ok) {
          throw await this.toError(resultResponse, "poll");
        }

        const resultBody = (await resultResponse.json()) as MuapiResultResponseBody;
        cost = parseCost(resultResponse, resultBody) || cost;

        if (resultBody.status === "completed") {
          const outputs = resultBody.outputs ?? [];
          if (outputs.length === 0) {
            throw new MuapiError(
              "Muapi generation completed but returned no outputs",
            );
          }
          const result: MuapiGenerateResult = {
            outputs,
            imageUrl: outputs[0],
            cost,
            model,
            requestId,
          };
          this.log(logger, {
            step,
            model,
            durationMs: this.now() - startedAt,
            success: true,
            cost,
          });
          return result;
        }

        if (resultBody.status === "failed" || resultBody.status === "cancelled") {
          throw new MuapiError(
            `Muapi generation ${resultBody.status}: ${resultBody.error ?? "no error detail"}`,
          );
        }

        if (this.now() >= deadline) {
          throw new MuapiError(
            `Muapi generation timed out after ${this.pollTimeoutMs}ms (request_id: ${requestId})`,
            { retryable: true },
          );
        }

        await this.sleep(this.pollIntervalMs);
      }
    } catch (error) {
      this.log(logger, {
        step,
        model,
        durationMs: this.now() - startedAt,
        success: false,
        cost,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  private async resolveApiKey(): Promise<string> {
    if (this.apiKey !== undefined) {
      return this.apiKey;
    }
    // Lazy so the module is importable in unit tests without a validated env.
    const { env } = await import("@/env");
    return env.MUAPI_API_KEY;
  }

  /**
   * Fetch with retry + exponential backoff. Retries network errors, HTTP 429,
   * and HTTP 5xx up to `maxRetries` times. Returns the final `Response` (the
   * caller inspects `.ok`); throws only when a network error is unrecoverable.
   */
  private async fetchWithRetry(url: string, init: RequestInit): Promise<Response> {
    let attempt = 0;
    for (;;) {
      let response: Response;
      try {
        response = await this.fetchFn(url, init);
      } catch (cause) {
        if (attempt < this.maxRetries) {
          attempt += 1;
          await this.sleep(this.backoffMs(attempt));
          continue;
        }
        throw new MuapiError(
          `Muapi request to ${url} failed: ${cause instanceof Error ? cause.message : String(cause)}`,
          { retryable: true, cause },
        );
      }

      if (response.ok) {
        return response;
      }
      if (isRetryableStatus(response.status) && attempt < this.maxRetries) {
        attempt += 1;
        await this.sleep(this.backoffMs(attempt));
        continue;
      }
      return response;
    }
  }

  /** Exponential backoff: baseDelay * 2^(attempt-1) for a 1-based attempt. */
  private backoffMs(attempt: number): number {
    return this.baseDelayMs * 2 ** (attempt - 1);
  }

  private async toError(response: Response, phase: string): Promise<MuapiError> {
    const body = await response.text().catch(() => "");
    return new MuapiError(
      `Muapi ${phase} failed (${response.status} ${response.statusText}): ${body}`,
      {
        status: response.status,
        retryable: isRetryableStatus(response.status),
      },
    );
  }

  private log(logger: PipelineLogger | undefined, entry: PipelineLogEntry): void {
    if (!logger) {
      return;
    }
    try {
      logger(entry);
    } catch (loggerError) {
      // A logging failure must never break a generation.
      console.error("[muapi] pipeline logger threw:", loggerError);
    }
  }
}

/** Default console-backed pipeline logger (used until pipeline_logs exists). */
export const consolePipelineLogger: PipelineLogger = (entry) => {
  const detail = `step=${entry.step} model=${entry.model} duration=${entry.durationMs}ms cost=$${entry.cost.toFixed(4)}`;
  if (entry.success) {
    console.info(`[muapi] ${detail}`);
  } else {
    console.error(`[muapi] ${detail} error=${entry.error ?? "unknown"}`);
  }
};

export const muapiService = new MuapiService({
  logger: persistentPipelineLogger,
});
