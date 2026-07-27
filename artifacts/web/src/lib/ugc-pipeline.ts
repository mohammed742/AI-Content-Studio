/**
 * DEV-33: UGC Pipeline orchestrator — the step that wires the whole Phase-3
 * UGC video pipeline (DEV-27→31) together behind the review UI (CONTEXT.md →
 * "UGC Pipeline", DESIGN §9.6).
 *
 * Two responsibilities, split so each unit-tests cleanly:
 *
 *  - `propose(...)` — the agent proposes a build: writes the ~15s script
 *    (DEV-27) and pre-selects the best-matching presenter for the brand's
 *    audience, then derives the step list. B-roll + assembly only appear when a
 *    product image is available (talking-head-only otherwise), so a job's step
 *    list is fixed up front and a retry resumes against a stable list.
 *
 *  - `run(job)` — executes the job's steps in order starting from the first
 *    non-`completed` one: voiceover (DEV-28) → talking head (DEV-29) → B-roll
 *    (DEV-30) → assembly (DEV-32) → reframe (DEV-31) → finalize (R2 upload +
 *    multi-format Asset Kit). Each step's status + intermediate output URL is
 *    persisted as it finishes (via the `updateJob` seam), so the review UI
 *    polls live progress and a failed step *resumes* rather than restarts the
 *    2–5 min pipeline (the AC's "retry from that step").
 *
 * Testability mirrors `generation-queue.ts`: every collaborator (each step +
 * the job writer) is an injectable seam, so routing, resume, cost accumulation,
 * and failure isolation unit-test with fakes. Defaults lazily load the real
 * DEV-27…32 services so the module loads under the bare Node test runner.
 *
 * Unlike the content-plan queue, UGC steps are strictly sequential inside one
 * request (each feeds the next), so the job row is rewritten whole after each
 * step — no concurrent-writer jsonb-merge dance is needed.
 */
import type {
  AssetKitMedia,
  BusinessProfile,
  UgcJobOutputs,
  UgcJobRow,
  UgcScriptRecord,
  UgcStepKey,
  UgcStepRecord,
} from "@/db/schema";
import type { UgcBusinessContext, UgcProduct } from "./ugc-script.ts";
import {
  PRESENTERS,
  type AudienceTag,
  type Presenter,
} from "./presenters.ts";

/** UGC ads are TikTok-native; used for the script voice + the kit's platform. */
export const DEFAULT_UGC_PLATFORM = "tiktok";

/** Friendly, no-jargon step labels shown in the progress UI (DESIGN §9.6). */
export const STEP_LABELS: Record<UgcStepKey, string> = {
  voiceover: "Writing the voiceover…",
  talking_head: "Creating your presenter video…",
  broll: "Adding product shots…",
  assembly: "Putting it all together…",
  reframe: "Formatting for your platforms…",
  finalize: "Finishing up…",
};

/** Full ordered step list (product image available). */
export const FULL_STEP_KEYS: UgcStepKey[] = [
  "voiceover",
  "talking_head",
  "broll",
  "assembly",
  "reframe",
  "finalize",
];

/** Talking-head-only step list (no product image → no B-roll/assembly). */
export const TALKING_HEAD_STEP_KEYS: UgcStepKey[] = [
  "voiceover",
  "talking_head",
  "reframe",
  "finalize",
];

/**
 * Map a business type to the audience tags its customers tend to read well as,
 * so the agent can pre-select a fitting presenter without any user input.
 */
const BUSINESS_TYPE_TAGS: Record<BusinessProfile["businessType"], AudienceTag[]> =
  {
    restaurant: ["foodies", "families"],
    "e-commerce": ["trend-followers", "young-professionals"],
    salon: ["beauty-wellness", "luxury-shoppers"],
    gym: ["fitness-enthusiasts", "young-professionals"],
    real_estate: ["homeowners", "families"],
    fashion: ["trend-followers", "luxury-shoppers"],
    freelancer: ["entrepreneurs", "young-professionals"],
    other: [],
  };

/** Every audience tag whose keyword appears in the free-text target customers. */
function tagsFromTargetCustomers(text: string | null | undefined): AudienceTag[] {
  if (!text) return [];
  const haystack = text.toLowerCase();
  const keywords: Record<AudienceTag, string[]> = {
    "young-professionals": ["professional", "young", "career", "urban"],
    families: ["family", "families", "parent", "kids", "children"],
    students: ["student", "college", "university", "gen z", "teen"],
    "fitness-enthusiasts": ["fitness", "gym", "athlete", "workout", "active"],
    "beauty-wellness": ["beauty", "wellness", "skincare", "self-care", "spa"],
    "luxury-shoppers": ["luxury", "premium", "high-end", "affluent", "designer"],
    "trend-followers": ["trend", "fashion", "style", "influencer"],
    homeowners: ["homeowner", "home", "property", "diy", "renovation"],
    entrepreneurs: ["entrepreneur", "business owner", "founder", "small business", "startup"],
    foodies: ["foodie", "food", "dining", "restaurant", "culinary"],
  };
  const out: AudienceTag[] = [];
  for (const [tag, words] of Object.entries(keywords) as [AudienceTag, string[]][]) {
    if (words.some((w) => haystack.includes(w))) out.push(tag);
  }
  return out;
}

/**
 * The audience tags the agent infers for a business, from its type plus any
 * keywords in its free-text target customers. Order/dedup is deterministic so
 * presenter selection is stable.
 */
export function inferAudienceTags(
  businessType: BusinessProfile["businessType"],
  targetCustomers?: string | null,
): AudienceTag[] {
  const merged = [
    ...BUSINESS_TYPE_TAGS[businessType],
    ...tagsFromTargetCustomers(targetCustomers),
  ];
  return [...new Set(merged)];
}

/**
 * Pre-select the presenter that best fits the inferred audience: the one with
 * the most overlapping audience tags. Ties break by roster order (stable); no
 * overlap at all falls back to the first presenter (there's always a presenter).
 */
export function selectPresenter(
  audienceTags: readonly AudienceTag[],
  presenters: readonly Presenter[] = PRESENTERS,
): Presenter {
  const roster = presenters.length > 0 ? presenters : PRESENTERS;
  let best = roster[0];
  let bestScore = -1;
  for (const presenter of roster) {
    const score = presenter.targetAudienceTags.filter((t) =>
      audienceTags.includes(t),
    ).length;
    if (score > bestScore) {
      best = presenter;
      bestScore = score;
    }
  }
  return best;
}

/** Look up a presenter's portrait URL by id (talking-head input). */
export function presenterImageUrl(
  presenterId: string,
  presenters: readonly Presenter[] = PRESENTERS,
): string {
  const presenter = presenters.find((p) => p.id === presenterId);
  if (!presenter) {
    throw new Error(`Unknown presenter: ${presenterId}`);
  }
  return presenter.imageUrl;
}

/** Build the pending step list for a job (product image gates B-roll/assembly). */
export function buildStepList(hasProductImage: boolean): UgcStepRecord[] {
  const keys = hasProductImage ? FULL_STEP_KEYS : TALKING_HEAD_STEP_KEYS;
  return keys.map((key) => ({
    key,
    label: STEP_LABELS[key],
    status: "pending" as const,
  }));
}

// ---- Propose --------------------------------------------------------------

export interface ProposeUgcRequest {
  userId: string;
  business: UgcBusinessContext;
  product: UgcProduct;
  /** Route-resolved product photo (Media Library). Null → talking-head-only. */
  productImageUrl?: string | null;
  /** Target platform (default {@link DEFAULT_UGC_PLATFORM}). */
  platform?: string;
}

export interface UgcProposal {
  script: UgcScriptRecord;
  /** LLM cost of the script (seeds the job's totalCost). */
  scriptCost: number;
  presenterId: string;
  productImageUrl: string | null;
  steps: UgcStepRecord[];
}

// ---- Run ------------------------------------------------------------------

/** The subset of a UGC job row the runner reads (structurally, DB-decoupled). */
export interface RunnableJob {
  id: string;
  userId: string;
  productName: string;
  productImageUrl?: string | null;
  presenterId: string;
  script: UgcScriptRecord;
  steps: UgcStepRecord[];
  outputs: UgcJobOutputs;
  totalCost: number;
}

export interface UgcRunResult {
  status: "completed" | "failed";
  assetKitId?: string;
  totalCost: number;
  /** The step that failed, if any (for the friendly UI message). */
  failedStep?: UgcStepKey;
}

// Injectable step seams — the real DEV-27…32 services sit behind the defaults.
export type ScriptStep = (
  request: ProposeUgcRequest,
) => Promise<{ script: UgcScriptRecord; cost: number }>;
export type VoiceoverStep = (args: {
  text: string;
}) => Promise<{ audioUrl: string; cost: number }>;
export type TalkingHeadStep = (args: {
  presenterImageUrl: string;
  audioUrl: string;
}) => Promise<{ videoUrl: string; cost: number }>;
export type BrollStep = (args: {
  productImageUrl: string;
}) => Promise<{ videoUrl: string; cost: number }>;
export type AssemblyStep = (args: {
  clips: string[];
}) => Promise<{ videoUrl: string; cost: number }>;
export type ReframeStep = (args: {
  videoUrl: string;
}) => Promise<{ variants: AssetKitMedia[]; cost: number }>;
export type FinalizeStep = (args: {
  userId: string;
  productName: string;
  caption: string;
  variants: AssetKitMedia[];
  cost: number;
}) => Promise<{ assetKitId: string; media: AssetKitMedia[] }>;

/** Persist a patch to the job row (status / steps / outputs / cost / kit id). */
export type JobUpdater = (
  jobId: string,
  patch: Partial<
    Pick<
      UgcJobRow,
      "status" | "steps" | "outputs" | "totalCost" | "assetKitId"
    >
  >,
) => Promise<void>;

export interface UgcPipelineConfig {
  script?: ScriptStep;
  voiceover?: VoiceoverStep;
  talkingHead?: TalkingHeadStep;
  broll?: BrollStep;
  assembly?: AssemblyStep;
  reframe?: ReframeStep;
  finalize?: FinalizeStep;
  updateJob?: JobUpdater;
  presenters?: readonly Presenter[];
}

export class UgcPipelineService {
  private readonly script: ScriptStep;
  private readonly voiceover: VoiceoverStep;
  private readonly talkingHead: TalkingHeadStep;
  private readonly broll: BrollStep;
  private readonly assembly: AssemblyStep;
  private readonly reframe: ReframeStep;
  private readonly finalize: FinalizeStep;
  private readonly updateJob: JobUpdater;
  private readonly presenters: readonly Presenter[];

  constructor(config: UgcPipelineConfig = {}) {
    this.script = config.script ?? defaultScript;
    this.voiceover = config.voiceover ?? defaultVoiceover;
    this.talkingHead = config.talkingHead ?? defaultTalkingHead;
    this.broll = config.broll ?? defaultBroll;
    this.assembly = config.assembly ?? defaultAssembly;
    this.reframe = config.reframe ?? defaultReframe;
    this.finalize = config.finalize ?? defaultFinalize;
    this.updateJob = config.updateJob ?? defaultUpdateJob;
    this.presenters = config.presenters ?? PRESENTERS;
  }

  /** Propose a build: write the script + pre-select a presenter + step list. */
  async propose(request: ProposeUgcRequest): Promise<UgcProposal> {
    const { script, cost } = await this.script(request);
    const tags = inferAudienceTags(
      request.business.businessType,
      request.business.targetCustomers,
    );
    const presenter = selectPresenter(tags, this.presenters);
    const productImageUrl = request.productImageUrl ?? null;
    return {
      script,
      scriptCost: cost,
      presenterId: presenter.id,
      productImageUrl,
      steps: buildStepList(Boolean(productImageUrl)),
    };
  }

  /**
   * Run the job from its first non-`completed` step. Marks each step
   * generating → completed (or failed) and persists after every transition;
   * stops at the first failure so the UI can offer Retry (which resumes here).
   */
  async run(job: RunnableJob): Promise<UgcRunResult> {
    const steps = job.steps.map((s) => ({ ...s }));
    const outputs: UgcJobOutputs = { ...job.outputs };
    let totalCost = job.totalCost;

    for (let i = 0; i < steps.length; i += 1) {
      const step = steps[i];
      if (step.status === "completed") continue;

      step.status = "generating";
      step.error = null;
      await this.persist(job.id, steps, outputs, totalCost);

      try {
        const cost = await this.runStep(step.key, job, outputs);
        totalCost += cost;
        step.status = "completed";
        await this.persist(job.id, steps, outputs, totalCost);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        step.status = "failed";
        step.error = message;
        await this.updateJob(job.id, {
          status: "failed",
          steps,
          outputs,
          totalCost,
        });
        return { status: "failed", totalCost, failedStep: step.key };
      }
    }

    await this.updateJob(job.id, {
      status: "completed",
      steps,
      outputs,
      totalCost,
      assetKitId: outputs.assetKitId,
    });
    return { status: "completed", assetKitId: outputs.assetKitId, totalCost };
  }

  /** Execute one step, mutating `outputs` with its result. Returns its cost. */
  private async runStep(
    key: UgcStepKey,
    job: RunnableJob,
    outputs: UgcJobOutputs,
  ): Promise<number> {
    switch (key) {
      case "voiceover": {
        const { audioUrl, cost } = await this.voiceover({
          text: job.script.spokenText,
        });
        outputs.audioUrl = audioUrl;
        return cost;
      }
      case "talking_head": {
        const audioUrl = required(outputs.audioUrl, "voiceover audio");
        const { videoUrl, cost } = await this.talkingHead({
          presenterImageUrl: presenterImageUrl(job.presenterId, this.presenters),
          audioUrl,
        });
        outputs.talkingHeadUrl = videoUrl;
        // With no assembly step, the talking head IS the master to reframe.
        if (!job.steps.some((s) => s.key === "assembly")) {
          outputs.masterUrl = videoUrl;
        }
        return cost;
      }
      case "broll": {
        const productImageUrl = required(
          job.productImageUrl,
          "product image",
        );
        const { videoUrl, cost } = await this.broll({ productImageUrl });
        outputs.brollUrl = videoUrl;
        return cost;
      }
      case "assembly": {
        const talkingHeadUrl = required(outputs.talkingHeadUrl, "talking head");
        const brollUrl = required(outputs.brollUrl, "B-roll clip");
        const { videoUrl, cost } = await this.assembly({
          clips: [talkingHeadUrl, brollUrl],
        });
        outputs.masterUrl = videoUrl;
        return cost;
      }
      case "reframe": {
        const source = required(
          outputs.masterUrl ?? outputs.talkingHeadUrl,
          "master video",
        );
        const { variants, cost } = await this.reframe({ videoUrl: source });
        outputs.variants = variants;
        return cost;
      }
      case "finalize": {
        const variants = outputs.variants ?? [];
        if (variants.length === 0) {
          throw new Error("No reframed variants to finalize");
        }
        const { assetKitId, media } = await this.finalize({
          userId: job.userId,
          productName: job.productName,
          caption: job.script.hook,
          variants,
          cost: 0,
        });
        outputs.assetKitId = assetKitId;
        // Replace the Muapi variant URLs with the durable R2 media so the
        // completed job carries the Result step's format URLs directly.
        outputs.variants = media;
        return 0;
      }
      default: {
        // Exhaustiveness guard — a new step key must be handled above.
        const _never: never = key;
        throw new Error(`Unhandled UGC step: ${String(_never)}`);
      }
    }
  }

  private async persist(
    jobId: string,
    steps: UgcStepRecord[],
    outputs: UgcJobOutputs,
    totalCost: number,
  ): Promise<void> {
    await this.updateJob(jobId, {
      status: "generating",
      steps,
      outputs,
      totalCost,
    });
  }
}

/** Assert a required intermediate output is present, else fail loud. */
function required<T>(value: T | null | undefined, what: string): T {
  if (value === null || value === undefined || value === "") {
    throw new Error(`Missing ${what} — cannot continue`);
  }
  return value;
}

// ---- Default seams (the real DEV-27…32 services, lazily loaded) -----------

const defaultScript: ScriptStep = async (request) => {
  const { ugcScriptService } = await import("@/lib/ugc-script");
  const full = await ugcScriptService.generateScript({
    userId: request.userId,
    business: request.business,
    product: request.product,
    platform: request.platform ?? DEFAULT_UGC_PLATFORM,
  });
  const { cost, ...rest } = full;
  return {
    script: {
      hook: rest.hook,
      body: rest.body,
      cta: rest.cta,
      spokenText: rest.spokenText,
      wordCount: rest.wordCount,
      estimatedSeconds: rest.estimatedSeconds,
    },
    cost,
  };
};

const defaultVoiceover: VoiceoverStep = async ({ text }) => {
  const { ugcVoiceoverService } = await import("@/lib/ugc-voiceover");
  const { audioUrl, cost } = await ugcVoiceoverService.generateVoiceover({ text });
  return { audioUrl, cost };
};

const defaultTalkingHead: TalkingHeadStep = async ({ presenterImageUrl, audioUrl }) => {
  const { ugcLipsyncService } = await import("@/lib/ugc-lipsync");
  const { videoUrl, cost } = await ugcLipsyncService.generateTalkingHead({
    presenterImageUrl,
    audioUrl,
  });
  return { videoUrl, cost };
};

const defaultBroll: BrollStep = async ({ productImageUrl }) => {
  const { ugcBrollService } = await import("@/lib/ugc-broll");
  const { videoUrl, cost } = await ugcBrollService.generateBroll({ productImageUrl });
  return { videoUrl, cost };
};

const defaultAssembly: AssemblyStep = async ({ clips }) => {
  const { ugcAssemblyService } = await import("@/lib/ugc-assembly");
  const { videoUrl, cost } = await ugcAssemblyService.assembleVideo({ clips });
  return { videoUrl, cost };
};

const defaultReframe: ReframeStep = async ({ videoUrl }) => {
  const { ugcReframeService } = await import("@/lib/ugc-reframe");
  const { variants, totalCost } = await ugcReframeService.reframeToFormats({ videoUrl });
  return {
    variants: variants.map((v) => ({
      url: v.videoUrl,
      mediaType: "video" as const,
      aspectRatio: v.aspectRatio,
    })),
    cost: totalCost,
  };
};

/**
 * Default finalize: download each reframed variant, upload it to R2, then save
 * ONE multi-format video Asset Kit whose ordered `media` carries all variants
 * (the Carousel `media[]` pattern; the cover mirrors the first variant). The
 * three variants share one caption/hashtag set — like a carousel, but video.
 */
const defaultFinalize: FinalizeStep = async ({
  userId,
  productName,
  caption,
  variants,
}) => {
  const [{ r2Service }, { db }, { assetKits }, { extensionFor }] =
    await Promise.all([
      import("@/lib/r2"),
      import("@/db"),
      import("@/db/schema"),
      import("@/lib/asset-kit"),
    ]);

  const timestamp = Date.now();
  const media: AssetKitMedia[] = [];
  for (let i = 0; i < variants.length; i += 1) {
    const variant = variants[i];
    const response = await fetch(variant.url);
    if (!response.ok) {
      throw new Error(
        `Failed to download reframed variant (${response.status} ${response.statusText})`,
      );
    }
    const buffer = Buffer.from(await response.arrayBuffer());
    const contentType = response.headers.get("content-type") ?? "video/mp4";
    const extension = extensionFor(contentType, "video");
    const key = `asset-kits/${userId}/${timestamp}-ugc-${String(i).padStart(2, "0")}.${extension}`;
    const url = await r2Service.upload(key, buffer, contentType);
    media.push({ url, mediaType: "video", aspectRatio: variant.aspectRatio });
  }

  const cover = media[0];
  const [kit] = await db
    .insert(assetKits)
    .values({
      userId,
      title: `UGC ad — ${productName}`,
      contentType: "ugc_ad",
      platform: DEFAULT_UGC_PLATFORM,
      mediaUrl: cover.url,
      mediaType: "video",
      media,
      caption,
      hashtags: [],
      status: "ready",
    })
    .returning();
  return { assetKitId: kit.id, media };
};

const defaultUpdateJob: JobUpdater = async (jobId, patch) => {
  const [{ db }, { ugcJobs }, { eq }] = await Promise.all([
    import("@/db"),
    import("@/db/schema"),
    import("drizzle-orm"),
  ]);
  await db.update(ugcJobs).set(patch).where(eq(ugcJobs.id, jobId));
};

export const ugcPipelineService = new UgcPipelineService();
