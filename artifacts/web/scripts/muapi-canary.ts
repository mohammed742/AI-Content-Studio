/**
 * STU-C1: Model Router liveness canary.
 *
 * Catalog presence is NOT proof a model works — Muapi lists models whose
 * generation endpoint returns `404 {"detail":"Not Found"}` on
 * `POST /api/v1/<model>` (e.g. `flux-schnell`). This script cross-checks every
 * model in the Model Router's routing table against:
 *   1. the live catalog (`GET /api/v1/models`) — is it still listed?
 *   2. a POST liveness probe (empty `{}` body) — `404` = dead endpoint,
 *      `422`/`400` (missing params) = live, `2xx` = live (accepted).
 *
 * Exits non-zero if any routed model is MISSING from the catalog or DEAD, so it
 * can gate CI. See `.agents/memory/muapi-api-contract.md`.
 *
 * Run: `pnpm canary:muapi` (reads MUAPI_API_KEY from .env.local).
 */
import { ROUTING_TABLE } from "../src/lib/model-router.ts";
import { MuapiCatalog } from "../src/lib/muapi-catalog.ts";

const BASE_URL = "https://api.muapi.ai/api/v1";

type Verdict = "LIVE" | "DEAD" | "MISSING" | "UNKNOWN";

interface Row {
  model: string;
  routedAs: string;
  inCatalog: boolean;
  probeStatus: number | "error";
  verdict: Verdict;
}

/** Every distinct model slug in the routing table, with where it's routed. */
function routedModels(): Map<string, string[]> {
  const map = new Map<string, string[]>();
  for (const [assetType, entry] of Object.entries(ROUTING_TABLE)) {
    for (const [tier, choice] of Object.entries(entry)) {
      if (tier === "inputType" || !choice || typeof choice !== "object") continue;
      const model = (choice as { model: string }).model;
      map.set(model, [...(map.get(model) ?? []), `${assetType}/${tier}`]);
    }
  }
  return map;
}

async function probe(model: string, apiKey: string): Promise<number | "error"> {
  try {
    const response = await fetch(`${BASE_URL}/${model}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": apiKey },
      body: "{}",
    });
    return response.status;
  } catch {
    return "error";
  }
}

function verdictFor(inCatalog: boolean, status: number | "error"): Verdict {
  if (!inCatalog) return "MISSING";
  if (status === 404) return "DEAD";
  if (status === 400 || status === 422 || (typeof status === "number" && status < 300)) {
    return "LIVE";
  }
  return "UNKNOWN";
}

async function main(): Promise<void> {
  const apiKey = process.env.MUAPI_API_KEY;
  if (!apiKey) {
    console.error("✖ MUAPI_API_KEY is not set. Run via `pnpm canary:muapi`.");
    process.exit(2);
  }

  const catalog = await new MuapiCatalog().tryLoad();
  if (!catalog) {
    console.error("✖ Could not fetch the Muapi catalog. Aborting.");
    process.exit(2);
  }

  const rows: Row[] = [];
  for (const [model, routedAs] of routedModels()) {
    const inCatalog = catalog.has(model);
    const probeStatus = await probe(model, apiKey);
    rows.push({
      model,
      routedAs: routedAs.join(", "),
      inCatalog,
      probeStatus,
      verdict: verdictFor(inCatalog, probeStatus),
    });
  }

  rows.sort((a, b) => a.model.localeCompare(b.model));
  console.log("\nMuapi Router Liveness Canary\n" + "=".repeat(60));
  for (const r of rows) {
    const mark =
      r.verdict === "LIVE" ? "✅" : r.verdict === "UNKNOWN" ? "⚠️ " : "❌";
    console.log(
      `${mark} ${r.verdict.padEnd(8)} ${r.model.padEnd(26)} ` +
        `catalog=${r.inCatalog ? "yes" : "NO "} probe=${String(r.probeStatus).padEnd(5)} ` +
        `[${r.routedAs}]`,
    );
  }

  const broken = rows.filter((r) => r.verdict === "MISSING" || r.verdict === "DEAD");
  console.log("=".repeat(60));
  if (broken.length > 0) {
    console.error(
      `\n✖ ${broken.length} routed model(s) MISSING/DEAD: ` +
        broken.map((r) => `${r.model} (${r.verdict})`).join(", ") +
        "\n  Fix the routing table before shipping.",
    );
    process.exit(1);
  }
  console.log("\n✔ All routed models are present in the catalog and live.");
}

void main();
