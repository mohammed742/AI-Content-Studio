/**
 * DEV-8: Minimal Muapi.ai client for the Agent Loop tracer.
 *
 * Wraps the Muapi `/v1/generate` endpoint used by the Execute step of the
 * Agent Loop (Plan → Retrieve → Route → **Execute** → Assemble → Publish).
 * Cost tracking reads the `X-MuAPI-Cost-USD` response header, per
 * ARCHITECTURE.md §2 (Execute) and §8 (COGS tracking).
 */
import { env } from "@/env";

const MUAPI_BASE_URL = "https://api.muapi.ai/v1";

export interface MuapiGenerateParams {
  prompt: string;
  [key: string]: unknown;
}

export interface MuapiGenerateResult {
  imageUrl: string;
  cost: number;
  model: string;
}

interface MuapiGenerateResponseBody {
  output?: string;
  url?: string;
  image_url?: string;
  imageUrl?: string;
}

export class MuapiService {
  async generate(
    model: string,
    params: MuapiGenerateParams,
  ): Promise<MuapiGenerateResult> {
    const response = await fetch(`${MUAPI_BASE_URL}/generate`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${env.MUAPI_API_KEY}`,
      },
      body: JSON.stringify({ model, ...params }),
    });

    if (!response.ok) {
      const body = await response.text().catch(() => "");
      throw new Error(
        `Muapi generate failed (${response.status} ${response.statusText}): ${body}`,
      );
    }

    const costHeader = response.headers.get("X-MuAPI-Cost-USD");
    const cost = costHeader ? Number.parseFloat(costHeader) : 0;

    const data = (await response.json()) as MuapiGenerateResponseBody;
    const imageUrl = data.output ?? data.url ?? data.image_url ?? data.imageUrl;

    if (!imageUrl) {
      throw new Error(
        "Muapi generate response did not include an image URL (checked output/url/image_url/imageUrl)",
      );
    }

    return { imageUrl, cost, model };
  }
}

export const muapiService = new MuapiService();
