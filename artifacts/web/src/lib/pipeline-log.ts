/**
 * DEV-25: Persistent pipeline logger.
 *
 * The default `PipelineLogger` (DEV-15 shape) for every Agent Loop service.
 * Logs to the console for local visibility AND fire-and-forgets a row into the
 * `pipeline_logs` table so AgentEvalsService.getPipelineReliability() has data
 * ("Every pipeline step → pipeline_logs row"). Persistence is non-blocking and
 * self-swallowing — a logging failure must never affect a generation.
 *
 * The DB import is lazy so services that import this module still load under
 * the bare Node test runner (no top-level `@/…` value imports).
 */
import type { PipelineLogEntry, PipelineLogger } from "./muapi.ts";

async function persist(entry: PipelineLogEntry): Promise<void> {
  try {
    const [{ db }, { pipelineLogs }] = await Promise.all([
      import("@/db"),
      import("@/db/schema"),
    ]);
    await db.insert(pipelineLogs).values({
      step: entry.step,
      model: entry.model,
      durationMs: entry.durationMs,
      success: entry.success,
      cost: entry.cost,
      error: entry.error ?? null,
    });
  } catch (error) {
    console.error("[pipeline-log] persist failed:", error);
  }
}

export const persistentPipelineLogger: PipelineLogger = (entry) => {
  const detail = `step=${entry.step} model=${entry.model} duration=${entry.durationMs}ms cost=$${entry.cost.toFixed(6)}`;
  if (entry.success) {
    console.info(`[pipeline] ${detail}`);
  } else {
    console.error(`[pipeline] ${detail} error=${entry.error ?? "unknown"}`);
  }
  void persist(entry);
};
