/**
 * DEV-16: Retrieval service — the Retrieve step of the Agent Loop
 * (Plan → **Retrieve** → Route → Execute → Assemble → Publish).
 *
 * Given a generation request, embeds the query and runs a cosine-similarity
 * search over the user's Brand Knowledge Base (`brand_embeddings`, DEV-17),
 * returning only the top-k most relevant chunks — so later slices condition
 * generations on the *relevant* brand context instead of the whole profile.
 * CONTEXT.md → "Retrieve Step", "top-k".
 *
 * Testability mirrors the other Phase-2 services: the query embedder and the
 * vector search are injectable, so ranking/formatting/top-k/logging are unit
 * tested with fakes. The default query embedder reuses the OpenAI embedder
 * from DEV-17 (one source of truth for model + cost); the default search
 * lazy-loads Drizzle so the module stays importable under the Node test runner.
 */
import type { BrandEmbeddingKind } from "@/lib/embeddings";
import type { PipelineLogger } from "@/lib/muapi";
import { persistentPipelineLogger } from "./pipeline-log.ts";

// Default number of chunks retrieved per query (CONTEXT.md → "top-k").
export const DEFAULT_TOP_K = 8;
const RETRIEVE_STEP = "retrieve";
// Matches EMBEDDING_MODEL in embeddings.ts (kept local to avoid a value import
// that would break the bare Node test runner).
const QUERY_EMBEDDING_MODEL = "text-embedding-3-small";

export interface RetrievedChunk {
  content: string;
  kind: BrandEmbeddingKind;
  /** Cosine similarity in [0, 1]; higher is more relevant. */
  similarity: number;
}

/** Embeds a single query string → vector + USD cost. Injectable. */
export type QueryEmbedder = (
  text: string,
) => Promise<{ embedding: number[]; cost: number }>;

export interface VectorSearchOptions {
  k: number;
  kinds?: BrandEmbeddingKind[];
}

/** Cosine-similarity search over a user's embeddings. Injectable. */
export type VectorSearch = (
  userId: string,
  embedding: number[],
  options: VectorSearchOptions,
) => Promise<RetrievedChunk[]>;

export interface RetrieveOptions {
  k?: number;
  kinds?: BrandEmbeddingKind[];
}

/**
 * Format retrieved chunks into a compact block for prompt injection. Returns
 * an empty string when nothing was retrieved, so callers can concatenate it
 * unconditionally.
 */
export function formatRetrievedContext(chunks: RetrievedChunk[]): string {
  if (chunks.length === 0) {
    return "";
  }
  const lines = chunks.map((chunk) => `- ${chunk.content}`);
  return `Relevant brand context:\n${lines.join("\n")}`;
}

export interface RetrievalServiceConfig {
  embedder?: QueryEmbedder;
  search?: VectorSearch;
  logger?: PipelineLogger;
  now?: () => number;
}

export class RetrievalService {
  private readonly embedder: QueryEmbedder;
  private readonly search: VectorSearch;
  private readonly logger?: PipelineLogger;
  private readonly now: () => number;

  constructor(config: RetrievalServiceConfig = {}) {
    this.embedder = config.embedder ?? defaultQueryEmbedder;
    this.search = config.search ?? defaultSearch;
    this.logger = config.logger;
    this.now = config.now ?? (() => Date.now());
  }

  /**
   * Retrieve the top-k Brand Knowledge Base chunks most relevant to `query`
   * for `userId`. A blank query short-circuits to an empty result (no embed
   * call, no cost). Throws on embedder/search failure.
   */
  async retrieve(
    userId: string,
    query: string,
    options: RetrieveOptions = {},
  ): Promise<RetrievedChunk[]> {
    const k = options.k ?? DEFAULT_TOP_K;
    const startedAt = this.now();
    let cost = 0;

    if (query.trim().length === 0) {
      return [];
    }

    try {
      const { embedding, cost: embedCost } = await this.embedder(query);
      cost = embedCost;
      const chunks = await this.search(userId, embedding, {
        k,
        kinds: options.kinds,
      });
      this.log({
        step: RETRIEVE_STEP,
        model: QUERY_EMBEDDING_MODEL,
        durationMs: this.now() - startedAt,
        success: true,
        cost,
      });
      return chunks;
    } catch (error) {
      this.log({
        step: RETRIEVE_STEP,
        model: QUERY_EMBEDDING_MODEL,
        durationMs: this.now() - startedAt,
        success: false,
        cost,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Convenience wrapper returning the retrieved chunks plus a ready-to-inject
   * formatted context string.
   */
  async retrieveContext(
    userId: string,
    query: string,
    options: RetrieveOptions = {},
  ): Promise<{ chunks: RetrievedChunk[]; context: string }> {
    const chunks = await this.retrieve(userId, query, options);
    return { chunks, context: formatRetrievedContext(chunks) };
  }

  private log(entry: Parameters<PipelineLogger>[0]): void {
    if (!this.logger) {
      return;
    }
    try {
      this.logger(entry);
    } catch (loggerError) {
      console.error("[retrieval] pipeline logger threw:", loggerError);
    }
  }
}

/** Default query embedder — reuses the DEV-17 OpenAI batch embedder. */
const defaultQueryEmbedder: QueryEmbedder = async (text) => {
  const { openAIEmbedder } = await import("@/lib/embeddings");
  const { embeddings, cost } = await openAIEmbedder([text]);
  return { embedding: embeddings[0], cost };
};

/** Default vector search — Drizzle/Neon cosine similarity over pgvector. */
const defaultSearch: VectorSearch = async (userId, embedding, { k, kinds }) => {
  const [{ db }, { brandEmbeddings }, { and, cosineDistance, eq, inArray, sql }] =
    await Promise.all([
      import("@/db"),
      import("@/db/schema"),
      import("drizzle-orm"),
    ]);

  const distance = cosineDistance(brandEmbeddings.embedding, embedding);
  const where =
    kinds && kinds.length > 0
      ? and(
          eq(brandEmbeddings.userId, userId),
          inArray(brandEmbeddings.kind, kinds),
        )
      : eq(brandEmbeddings.userId, userId);

  const rows = await db
    .select({
      content: brandEmbeddings.content,
      kind: brandEmbeddings.kind,
      similarity: sql<number>`1 - (${distance})`,
    })
    .from(brandEmbeddings)
    .where(where)
    .orderBy(distance) // ascending distance = most similar first
    .limit(k);

  return rows;
};

export const retrievalService = new RetrievalService({
  logger: persistentPipelineLogger,
});
