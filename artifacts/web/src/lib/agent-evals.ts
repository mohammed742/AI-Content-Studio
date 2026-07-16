/**
 * DEV-25: Agent Evals — the agent's self-checks (CONTEXT.md → "Agent Eval").
 *
 * Three responsibilities:
 *  1. Plan quality scoring — `scorePlanQuality` gives a proposed plan a 0-100
 *     score; the Content Planner auto-regenerates plans below 60 before the
 *     user ever sees them ("Plan Quality Score").
 *  2. Performance feedback loop — `getPerformanceInsights` aggregates a user's
 *     thumbs up/down (generation_feedback, DEV-26) by content type into a
 *     plain-English summary fed back into the planner prompt, so the agent
 *     proposes more of what an audience likes.
 *  3. Pipeline reliability — `getPipelineReliability` aggregates pipeline_logs
 *     (DEV-25) into per-step success rate / duration / cost (Admin, Phase 7).
 *
 * `scorePlanQuality` is pure (imported by the planner). The two aggregations
 * take injectable fetch seams so they unit-test with fakes; the defaults lazily
 * load Drizzle, keeping the module importable under the bare Node test runner.
 */
import type { ContentType } from "./industry-templates.ts";
import type { FeedbackRating } from "@/db/schema";

// ---------------------------------------------------------------------------
// 1. Plan quality scoring (pure)
// ---------------------------------------------------------------------------

export interface ScorableItem {
  type: string;
  title: string;
  platform: string;
  scheduledDay: string;
}

/** Plans scoring below this are silently regenerated (CONTEXT.md). */
export const MIN_PLAN_SCORE = 60;

/**
 * Score a proposed plan 0-100 across four axes (25 pts each): platform
 * coverage, content-type diversity, product rotation (unique titles), and
 * day-spread with a seasonal bonus. Pure — no side effects.
 */
export function scorePlanQuality(items: ScorableItem[]): number {
  if (items.length === 0) {
    return 0;
  }
  const n = items.length;
  const distinct = (xs: string[]): number => new Set(xs).size;

  const platforms = distinct(items.map((i) => i.platform));
  const types = distinct(items.map((i) => i.type));
  const titles = distinct(items.map((i) => i.title.trim().toLowerCase()));
  const days = distinct(items.map((i) => i.scheduledDay));
  const hasSeasonal = items.some((i) => i.type === "seasonal");

  const platformScore = (Math.min(platforms, 2) / 2) * 25;
  const diversityScore = (Math.min(types, 4) / 4) * 25;
  const rotationScore = (titles / n) * 25;
  const daySpread = Math.min(days, Math.min(n, 5)) / Math.min(n, 5);
  const spreadScore = Math.min(daySpread * 20 + (hasSeasonal ? 5 : 0), 25);

  return Math.round(platformScore + diversityScore + rotationScore + spreadScore);
}

// ---------------------------------------------------------------------------
// 2. Performance feedback loop
// ---------------------------------------------------------------------------

export interface FeedbackRow {
  contentType: ContentType;
  rating: FeedbackRating;
}

export interface TypePerformance {
  up: number;
  down: number;
  total: number;
  /** Fraction liked, 0-1. */
  likeRate: number;
}

export interface PerformanceInsights {
  byType: Record<string, TypePerformance>;
  /** Plain-English summary injected into the planner prompt ("" if no data). */
  summary: string;
  hasData: boolean;
}

/** Minimum ratings for a content type to influence the summary. */
const MIN_RATINGS_FOR_SIGNAL = 2;

export type FeedbackFetcher = (userId: string) => Promise<FeedbackRow[]>;

/** Aggregate raw feedback rows into per-type like rates. Pure. */
export function aggregateFeedback(rows: FeedbackRow[]): Record<string, TypePerformance> {
  const byType: Record<string, TypePerformance> = {};
  for (const row of rows) {
    const perf = (byType[row.contentType] ??= { up: 0, down: 0, total: 0, likeRate: 0 });
    if (row.rating === "up") perf.up += 1;
    else perf.down += 1;
    perf.total += 1;
    perf.likeRate = perf.up / perf.total;
  }
  return byType;
}

/** Turn per-type performance into a one-line planner hint. Pure. */
export function summarizeInsights(byType: Record<string, TypePerformance>): string {
  const ranked = Object.entries(byType)
    .filter(([, p]) => p.total >= MIN_RATINGS_FOR_SIGNAL)
    .sort((a, b) => b[1].likeRate - a[1].likeRate);
  if (ranked.length === 0) {
    return "";
  }
  const pct = (r: number) => Math.round(r * 100);
  const [bestType, best] = ranked[0];
  const parts = [
    `Your audience responds best to ${bestType} content (${pct(best.likeRate)}% liked) — favor more of it.`,
  ];
  if (ranked.length > 1) {
    const [worstType, worst] = ranked[ranked.length - 1];
    if (worst.likeRate < best.likeRate) {
      parts.push(`They respond least to ${worstType} (${pct(worst.likeRate)}% liked) — use it sparingly.`);
    }
  }
  return parts.join(" ");
}

// ---------------------------------------------------------------------------
// 3. Pipeline reliability
// ---------------------------------------------------------------------------

export interface LogRow {
  step: string;
  success: boolean;
  durationMs: number;
  cost: number;
}

export interface StepReliability {
  count: number;
  successRate: number;
  avgDurationMs: number;
  totalCost: number;
}

export interface PipelineReliability {
  byStep: Record<string, StepReliability>;
  overallSuccessRate: number;
  totalRuns: number;
}

export type LogsFetcher = () => Promise<LogRow[]>;

/** Aggregate raw pipeline-log rows into per-step reliability. Pure. */
export function aggregateReliability(rows: LogRow[]): PipelineReliability {
  const acc: Record<string, { count: number; ok: number; duration: number; cost: number }> = {};
  let ok = 0;
  for (const row of rows) {
    const a = (acc[row.step] ??= { count: 0, ok: 0, duration: 0, cost: 0 });
    a.count += 1;
    a.duration += row.durationMs;
    a.cost += row.cost;
    if (row.success) {
      a.ok += 1;
      ok += 1;
    }
  }
  const byStep: Record<string, StepReliability> = {};
  for (const [step, a] of Object.entries(acc)) {
    byStep[step] = {
      count: a.count,
      successRate: a.count ? a.ok / a.count : 0,
      avgDurationMs: a.count ? Math.round(a.duration / a.count) : 0,
      totalCost: a.cost,
    };
  }
  return {
    byStep,
    overallSuccessRate: rows.length ? ok / rows.length : 0,
    totalRuns: rows.length,
  };
}

export interface AgentEvalsConfig {
  fetchFeedback?: FeedbackFetcher;
  fetchLogs?: LogsFetcher;
}

export class AgentEvalsService {
  private readonly fetchFeedback: FeedbackFetcher;
  private readonly fetchLogs: LogsFetcher;

  constructor(config: AgentEvalsConfig = {}) {
    this.fetchFeedback = config.fetchFeedback ?? defaultFetchFeedback;
    this.fetchLogs = config.fetchLogs ?? defaultFetchLogs;
  }

  scorePlanQuality = scorePlanQuality;

  /** Aggregate a user's ratings into insights for the planner. */
  async getPerformanceInsights(userId: string): Promise<PerformanceInsights> {
    const rows = await this.fetchFeedback(userId);
    const byType = aggregateFeedback(rows);
    const summary = summarizeInsights(byType);
    return { byType, summary, hasData: rows.length > 0 };
  }

  /** Aggregate pipeline logs into per-step reliability metrics. */
  async getPipelineReliability(): Promise<PipelineReliability> {
    return aggregateReliability(await this.fetchLogs());
  }
}

/** Default feedback fetch — generation_feedback joined to asset_kits by type. */
const defaultFetchFeedback: FeedbackFetcher = async (userId) => {
  const [{ db }, { assetKits, generationFeedback }, { eq }] = await Promise.all([
    import("@/db"),
    import("@/db/schema"),
    import("drizzle-orm"),
  ]);
  return db
    .select({
      contentType: assetKits.contentType,
      rating: generationFeedback.rating,
    })
    .from(generationFeedback)
    .innerJoin(assetKits, eq(generationFeedback.assetKitId, assetKits.id))
    .where(eq(generationFeedback.userId, userId));
};

/** Default logs fetch — all pipeline_logs rows. */
const defaultFetchLogs: LogsFetcher = async () => {
  const [{ db }, { pipelineLogs }] = await Promise.all([
    import("@/db"),
    import("@/db/schema"),
  ]);
  return db
    .select({
      step: pipelineLogs.step,
      success: pipelineLogs.success,
      durationMs: pipelineLogs.durationMs,
      cost: pipelineLogs.cost,
    })
    .from(pipelineLogs);
};

export const agentEvalsService = new AgentEvalsService();
