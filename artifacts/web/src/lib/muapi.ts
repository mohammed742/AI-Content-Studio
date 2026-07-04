/**
 * DEV-8: Minimal Muapi.ai client for the Agent Loop tracer.
 *
 * Wraps Muapi's submit-then-poll generation flow used by the Execute step of
 * the Agent Loop (Plan → Retrieve → Route → **Execute** → Assemble →
 * Publish). Per Muapi's official docs (https://muapi.ai/docs/api-reference):
 *
 *   1. POST https://api.muapi.ai/api/v1/{model}   -> { request_id, status, cost }
 *   2. GET  https://api.muapi.ai/api/v1/predictions/{request_id}/result
 *      polled until status is "completed" (or "failed"/"cancelled")
 *
 * Auth is an `x-api-key` header (not Bearer). Cost tracking reads the
 * `X-MuAPI-Cost-USD` response header, per ARCHITECTURE.md §2 (Execute) and
 * §8 (COGS tracking).
 */
import { env } from "@/env";

const MUAPI_BASE_URL = "https://api.muapi.ai/api/v1";
const POLL_INTERVAL_MS = 2000;
const POLL_TIMEOUT_MS = 60000;

export interface MuapiGenerateParams {
  prompt: string;
  [key: string]: unknown;
}

export interface MuapiGenerateResult {
  imageUrl: string;
  cost: number;
  model: string;
}

interface MuapiSubmitResponseBody {
  request_id: string;
  status: string;
  cost?: { amount_usd?: number };
}

interface MuapiResultResponseBody {
  id: string;
  status: string;
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
    return Number.parseFloat(headerCost);
  }
  return body.cost?.amount_usd ?? 0;
}

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export class MuapiService {
  async generate(
    model: string,
    params: MuapiGenerateParams,
  ): Promise<MuapiGenerateResult> {
    const submitResponse = await fetch(`${MUAPI_BASE_URL}/${model}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": env.MUAPI_API_KEY,
      },
      body: JSON.stringify(params),
    });

    if (!submitResponse.ok) {
      const body = await submitResponse.text().catch(() => "");
      throw new Error(
        `Muapi submit failed (${submitResponse.status} ${submitResponse.statusText}): ${body}`,
      );
    }

    const submitBody =
      (await submitResponse.json()) as MuapiSubmitResponseBody;
    let cost = parseCost(submitResponse, submitBody);

    if (!submitBody.request_id) {
      throw new Error("Muapi submit response did not include a request_id");
    }

    const deadline = Date.now() + POLL_TIMEOUT_MS;

    while (Date.now() < deadline) {
      const resultResponse = await fetch(
        `${MUAPI_BASE_URL}/predictions/${submitBody.request_id}/result`,
        {
          headers: { "x-api-key": env.MUAPI_API_KEY },
        },
      );

      if (!resultResponse.ok) {
        const body = await resultResponse.text().catch(() => "");
        throw new Error(
          `Muapi poll failed (${resultResponse.status} ${resultResponse.statusText}): ${body}`,
        );
      }

      const resultBody =
        (await resultResponse.json()) as MuapiResultResponseBody;
      cost = parseCost(resultResponse, resultBody) || cost;

      if (resultBody.status === "completed") {
        const imageUrl = resultBody.outputs?.[0];
        if (!imageUrl) {
          throw new Error(
            "Muapi result completed but returned no outputs",
          );
        }
        return { imageUrl, cost, model };
      }

      if (resultBody.status === "failed" || resultBody.status === "cancelled") {
        throw new Error(
          `Muapi generation ${resultBody.status}: ${resultBody.error ?? "no error detail"}`,
        );
      }

      await sleep(POLL_INTERVAL_MS);
    }

    throw new Error(
      `Muapi generation timed out after ${POLL_TIMEOUT_MS}ms (request_id: ${submitBody.request_id})`,
    );
  }
}

export const muapiService = new MuapiService();
