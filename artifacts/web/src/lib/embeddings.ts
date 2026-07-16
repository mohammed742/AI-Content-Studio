/**
 * DEV-17: Brand Knowledge Base embedding pipeline.
 *
 * Turns a user's Business Profile into embedded chunks stored in pgvector
 * (the `brand_embeddings` table), so the Retrieve step of the Agent Loop
 * (DEV-16) can later pull the most relevant brand context for a generation.
 * CONTEXT.md → "Brand Knowledge Base", "Embedding", "Auto-Embedding".
 *
 * Testability mirrors the Muapi service (DEV-15): the two side-effecting
 * collaborators — the OpenAI embedder and the database store — are injectable,
 * so the chunking, cost, replace-semantics, and logging behaviour are unit
 * tested with fakes and never touch the network or DB. The default singleton
 * lazily wires in the AI SDK, the Drizzle store, and the validated env, so the
 * module stays importable under the bare Node test runner (no `@/…` value
 * imports at the top).
 */
import type { PipelineLogger } from "@/lib/muapi";
import { persistentPipelineLogger } from "./pipeline-log.ts";

export const EMBEDDING_MODEL = "text-embedding-3-small";
export const EMBEDDING_DIMENSIONS = 1536;
// OpenAI text-embedding-3-small pricing: $0.02 / 1M tokens.
const COST_PER_TOKEN = 0.02 / 1_000_000;
// The Agent Loop step this pipeline serves, for pipeline-log entries.
const EMBED_STEP = "embed";

export type BrandEmbeddingKind =
  | "product"
  | "brand_guideline"
  | "generation"
  | "caption_edit";

/** The embedding kinds a Business Profile sync owns (and replaces). */
export const PROFILE_EMBEDDING_KINDS: BrandEmbeddingKind[] = [
  "product",
  "brand_guideline",
];

export interface EmbeddingChunk {
  kind: BrandEmbeddingKind;
  content: string;
  sourceId?: string;
}

export interface EmbeddingRow extends EmbeddingChunk {
  embedding: number[];
}

/** The Business Profile fields the pipeline reads (structural, DB-decoupled). */
export interface EmbeddableProfile {
  businessName: string;
  businessType: string;
  brandTone: string;
  targetCustomers?: string | null;
  industry?: string | null;
  products: { name: string; description?: string | null }[];
}

/** Low-level batch embedder: text[] → vectors + USD cost. Injectable. */
export type Embedder = (
  texts: string[],
) => Promise<{ embeddings: number[][]; cost: number }>;

/** Persists a user's profile-derived embeddings with replace semantics. */
export type EmbeddingStore = (
  userId: string,
  kinds: BrandEmbeddingKind[],
  rows: EmbeddingRow[],
) => Promise<void>;

/**
 * Break a Business Profile into the text chunks worth embedding: one per
 * product, plus a single brand-guideline chunk. Pure — no side effects.
 */
export function businessProfileToChunks(
  profile: EmbeddableProfile,
): EmbeddingChunk[] {
  const chunks: EmbeddingChunk[] = [];

  for (const product of profile.products) {
    const name = product.name.trim();
    if (!name) {
      continue;
    }
    const description = product.description?.trim();
    chunks.push({
      kind: "product",
      content: description ? `${name} — ${description}` : name,
      sourceId: name,
    });
  }

  const guidelineParts = [
    `Business name: ${profile.businessName}.`,
    `Business type: ${profile.businessType}.`,
    `Brand tone: ${profile.brandTone}.`,
  ];
  if (profile.industry?.trim()) {
    guidelineParts.push(`Industry: ${profile.industry.trim()}.`);
  }
  if (profile.targetCustomers?.trim()) {
    guidelineParts.push(`Target customers: ${profile.targetCustomers.trim()}.`);
  }
  chunks.push({
    kind: "brand_guideline",
    content: guidelineParts.join(" "),
    sourceId: "profile",
  });

  return chunks;
}

export interface BrandKnowledgeBaseConfig {
  embedder?: Embedder;
  store?: EmbeddingStore;
  logger?: PipelineLogger;
  now?: () => number;
}

export class BrandKnowledgeBase {
  private readonly embedder: Embedder;
  private readonly store: EmbeddingStore;
  private readonly logger?: PipelineLogger;
  private readonly now: () => number;

  constructor(config: BrandKnowledgeBaseConfig = {}) {
    this.embedder = config.embedder ?? openAIEmbedder;
    this.store = config.store ?? defaultStore;
    this.logger = config.logger;
    this.now = config.now ?? (() => Date.now());
  }

  /**
   * Embed a user's Business Profile and persist it, replacing any previous
   * profile-derived embeddings for that user (product + brand_guideline
   * kinds). Throws on failure — callers decide whether that's fatal.
   */
  async syncBusinessProfile(
    userId: string,
    profile: EmbeddableProfile,
  ): Promise<{ chunks: number; cost: number }> {
    const startedAt = this.now();
    let cost = 0;
    try {
      const chunks = businessProfileToChunks(profile);
      const { embeddings, cost: embedCost } =
        chunks.length > 0
          ? await this.embedder(chunks.map((chunk) => chunk.content))
          : { embeddings: [], cost: 0 };
      cost = embedCost;

      const rows: EmbeddingRow[] = chunks.map((chunk, i) => ({
        ...chunk,
        embedding: embeddings[i],
      }));

      await this.store(userId, PROFILE_EMBEDDING_KINDS, rows);

      this.log({
        step: EMBED_STEP,
        model: EMBEDDING_MODEL,
        durationMs: this.now() - startedAt,
        success: true,
        cost,
      });
      return { chunks: chunks.length, cost };
    } catch (error) {
      this.log({
        step: EMBED_STEP,
        model: EMBEDDING_MODEL,
        durationMs: this.now() - startedAt,
        success: false,
        cost,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  private log(entry: Parameters<PipelineLogger>[0]): void {
    if (!this.logger) {
      return;
    }
    try {
      this.logger(entry);
    } catch (loggerError) {
      console.error("[embeddings] pipeline logger threw:", loggerError);
    }
  }
}

/**
 * OpenAI `text-embedding-3-small` batch embedder via the Vercel AI SDK — the
 * default for the knowledge base and reused by the retrieval service (DEV-16)
 * so the embedding model + cost live in one place.
 */
export const openAIEmbedder: Embedder = async (texts) => {
  const [{ embedMany }, { openai }, { env }] = await Promise.all([
    import("ai"),
    import("@ai-sdk/openai"),
    import("@/env"),
  ]);
  // `openai()` reads OPENAI_API_KEY from process.env; touch env so Zod has run.
  void env.OPENAI_API_KEY;

  const { embeddings, usage } = await embedMany({
    model: openai.embedding(EMBEDDING_MODEL),
    values: texts,
  });
  const cost = (usage?.tokens ?? 0) * COST_PER_TOKEN;
  return { embeddings, cost };
};

/** Default store — Drizzle/Neon, replacing the given kinds for the user. */
const defaultStore: EmbeddingStore = async (userId, kinds, rows) => {
  const [{ db }, { brandEmbeddings }, { and, eq, inArray }] = await Promise.all([
    import("@/db"),
    import("@/db/schema"),
    import("drizzle-orm"),
  ]);

  await db
    .delete(brandEmbeddings)
    .where(
      and(
        eq(brandEmbeddings.userId, userId),
        inArray(brandEmbeddings.kind, kinds),
      ),
    );

  if (rows.length > 0) {
    await db.insert(brandEmbeddings).values(
      rows.map((row) => ({
        userId,
        kind: row.kind,
        content: row.content,
        embedding: row.embedding,
        sourceId: row.sourceId ?? null,
      })),
    );
  }
};

export const brandKnowledgeBase = new BrandKnowledgeBase({
  logger: persistentPipelineLogger,
});
