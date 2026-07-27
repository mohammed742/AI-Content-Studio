import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildStepList,
  FULL_STEP_KEYS,
  inferAudienceTags,
  presenterImageUrl,
  selectPresenter,
  STEP_LABELS,
  TALKING_HEAD_STEP_KEYS,
  UgcPipelineService,
  type ProposeUgcRequest,
  type RunnableJob,
  type UgcPipelineConfig,
} from "./ugc-pipeline.ts";
import type { Presenter } from "./presenters.ts";
import type {
  UgcJobOutputs,
  UgcJobRow,
  UgcScriptRecord,
  UgcStepRecord,
} from "@/db/schema";

// ---- Fixtures --------------------------------------------------------------

const PRESENTERS: Presenter[] = [
  {
    id: "foodie-fran",
    name: "Fran",
    imageUrl: "/presenters/fran.svg",
    gender: "female",
    ageRange: "25-34",
    style: "Warm",
    targetAudienceTags: ["foodies", "families"],
  },
  {
    id: "luxe-leo",
    name: "Leo",
    imageUrl: "/presenters/leo.svg",
    gender: "male",
    ageRange: "35-44",
    style: "Polished",
    targetAudienceTags: ["luxury-shoppers", "homeowners"],
  },
  {
    id: "fit-remy",
    name: "Remy",
    imageUrl: "/presenters/remy.svg",
    gender: "nonbinary",
    ageRange: "25-34",
    style: "Energetic",
    targetAudienceTags: ["fitness-enthusiasts", "young-professionals"],
  },
];

const SCRIPT: UgcScriptRecord = {
  hook: "You have to try this.",
  body: "It changed my routine.",
  cta: "Grab yours today.",
  spokenText: "You have to try this. It changed my routine. Grab yours today.",
  wordCount: 12,
  estimatedSeconds: 5,
};

function makeJob(overrides: Partial<RunnableJob> = {}): RunnableJob {
  return {
    id: "job-1",
    userId: "user-1",
    productName: "Glow Serum",
    productImageUrl: "https://cdn.test/product.jpg",
    presenterId: "foodie-fran",
    script: SCRIPT,
    steps: buildStepList(true),
    outputs: {},
    totalCost: 0.001, // seeded script cost
    ...overrides,
  };
}

/** Config whose steps record their calls and return canned outputs. */
function recordingConfig(): {
  config: UgcPipelineConfig;
  calls: string[];
  patches: Partial<UgcJobRow>[];
} {
  const calls: string[] = [];
  const patches: Partial<UgcJobRow>[] = [];
  const config: UgcPipelineConfig = {
    presenters: PRESENTERS,
    voiceover: async ({ text }) => {
      calls.push(`voiceover:${text.slice(0, 3)}`);
      return { audioUrl: "https://cdn.test/audio.mp3", cost: 0.003 };
    },
    talkingHead: async ({ presenterImageUrl, audioUrl }) => {
      calls.push(`talkingHead:${presenterImageUrl}:${audioUrl.endsWith("audio.mp3")}`);
      return { videoUrl: "https://cdn.test/head.mp4", cost: 0.28 };
    },
    broll: async ({ productImageUrl }) => {
      calls.push(`broll:${productImageUrl}`);
      return { videoUrl: "https://cdn.test/broll.mp4", cost: 0.225 };
    },
    assembly: async ({ clips }) => {
      calls.push(`assembly:${clips.join(",")}`);
      return { videoUrl: "https://cdn.test/master.mp4", cost: 0.05 };
    },
    reframe: async ({ videoUrl }) => {
      calls.push(`reframe:${videoUrl}`);
      return {
        variants: [
          { url: "https://cdn.test/9x16.mp4", mediaType: "video", aspectRatio: "9:16" },
          { url: "https://cdn.test/1x1.mp4", mediaType: "video", aspectRatio: "1:1" },
          { url: "https://cdn.test/16x9.mp4", mediaType: "video", aspectRatio: "16:9" },
        ],
        cost: 0.15,
      };
    },
    finalize: async ({ variants, caption }) => {
      calls.push(`finalize:${variants.length}:${caption}`);
      return {
        assetKitId: "kit-1",
        media: variants.map((v) => ({
          url: `https://r2.test/${v.aspectRatio}.mp4`,
          mediaType: "video" as const,
          aspectRatio: v.aspectRatio,
        })),
      };
    },
    updateJob: async (_id, patch) => {
      patches.push(structuredClone(patch));
    },
  };
  return { config, calls, patches };
}

// ---- Pure helpers ----------------------------------------------------------

test("STEP_LABELS covers every step key with no-jargon copy", () => {
  for (const key of FULL_STEP_KEYS) {
    assert.equal(typeof STEP_LABELS[key], "string");
    assert.ok(STEP_LABELS[key].length > 0);
  }
});

test("inferAudienceTags merges business-type + target-customer keywords, deduped", () => {
  const tags = inferAudienceTags("restaurant", "families who love food");
  assert.ok(tags.includes("foodies"));
  assert.ok(tags.includes("families"));
  // deduped — no repeats even though both sources yield foodies/families
  assert.equal(new Set(tags).size, tags.length);
});

test("inferAudienceTags on 'other' with no hints yields an empty list", () => {
  assert.deepEqual(inferAudienceTags("other", null), []);
});

test("selectPresenter picks the best audience overlap", () => {
  const chosen = selectPresenter(["luxury-shoppers"], PRESENTERS);
  assert.equal(chosen.id, "luxe-leo");
});

test("selectPresenter falls back to the first presenter on no overlap", () => {
  const chosen = selectPresenter(["students"], PRESENTERS);
  assert.equal(chosen.id, "foodie-fran");
});

test("presenterImageUrl resolves a known id and throws on unknown", () => {
  assert.equal(presenterImageUrl("fit-remy", PRESENTERS), "/presenters/remy.svg");
  assert.throws(() => presenterImageUrl("nobody", PRESENTERS), /Unknown presenter/);
});

test("buildStepList: full pipeline when a product image exists", () => {
  const steps = buildStepList(true);
  assert.deepEqual(steps.map((s) => s.key), FULL_STEP_KEYS);
  assert.ok(steps.every((s) => s.status === "pending"));
});

test("buildStepList: talking-head-only when no product image", () => {
  const steps = buildStepList(false);
  assert.deepEqual(steps.map((s) => s.key), TALKING_HEAD_STEP_KEYS);
  assert.ok(!steps.some((s) => s.key === "broll"));
  assert.ok(!steps.some((s) => s.key === "assembly"));
});

// ---- propose ---------------------------------------------------------------

const PROPOSE_REQUEST: ProposeUgcRequest = {
  userId: "user-1",
  business: {
    businessName: "Bistro",
    businessType: "restaurant",
    brandTone: "friendly",
    targetCustomers: "local foodies",
  },
  product: { name: "Truffle Pasta" },
  productImageUrl: "https://cdn.test/product.jpg",
};

test("propose writes a script, pre-selects a presenter, and builds full steps", async () => {
  const service = new UgcPipelineService({
    presenters: PRESENTERS,
    script: async () => ({ script: SCRIPT, cost: 0.001 }),
  });
  const proposal = await service.propose(PROPOSE_REQUEST);
  assert.equal(proposal.script.spokenText, SCRIPT.spokenText);
  assert.equal(proposal.scriptCost, 0.001);
  assert.equal(proposal.presenterId, "foodie-fran"); // foodies/families overlap
  assert.equal(proposal.productImageUrl, "https://cdn.test/product.jpg");
  assert.deepEqual(proposal.steps.map((s) => s.key), FULL_STEP_KEYS);
});

test("propose without a product image yields a talking-head-only step list", async () => {
  const service = new UgcPipelineService({
    presenters: PRESENTERS,
    script: async () => ({ script: SCRIPT, cost: 0.001 }),
  });
  const proposal = await service.propose({
    ...PROPOSE_REQUEST,
    productImageUrl: null,
  });
  assert.equal(proposal.productImageUrl, null);
  assert.deepEqual(proposal.steps.map((s) => s.key), TALKING_HEAD_STEP_KEYS);
});

// ---- run: happy paths ------------------------------------------------------

test("run executes the full pipeline in order, threading outputs and cost", async () => {
  const { config, calls, patches } = recordingConfig();
  const service = new UgcPipelineService(config);
  const result = await service.run(makeJob());

  assert.equal(result.status, "completed");
  assert.equal(result.assetKitId, "kit-1");
  // 0.001 seed + 0.003 + 0.28 + 0.225 + 0.05 + 0.15 + 0 = 0.709
  assert.ok(Math.abs(result.totalCost - 0.709) < 1e-9);

  assert.deepEqual(calls, [
    "voiceover:You",
    "talkingHead:/presenters/fran.svg:true",
    "broll:https://cdn.test/product.jpg",
    "assembly:https://cdn.test/head.mp4,https://cdn.test/broll.mp4",
    "reframe:https://cdn.test/master.mp4",
    "finalize:3:You have to try this.",
  ]);

  const last = patches.at(-1)!;
  assert.equal(last.status, "completed");
  assert.equal(last.assetKitId, "kit-1");
  assert.equal(last.totalCost !== undefined, true);
  // Completed job carries the durable R2 media (not the Muapi variant URLs).
  assert.deepEqual(
    last.outputs!.variants!.map((v) => v.url),
    ["https://r2.test/9:16.mp4", "https://r2.test/1:1.mp4", "https://r2.test/16:9.mp4"],
  );
});

test("run (talking-head-only) reframes the talking head directly, no assembly", async () => {
  const { config, calls } = recordingConfig();
  const service = new UgcPipelineService(config);
  const job = makeJob({
    productImageUrl: null,
    steps: buildStepList(false),
  });
  const result = await service.run(job);

  assert.equal(result.status, "completed");
  assert.ok(!calls.some((c) => c.startsWith("broll")));
  assert.ok(!calls.some((c) => c.startsWith("assembly")));
  // reframe runs on the talking-head url (master === talking head)
  assert.ok(calls.includes("reframe:https://cdn.test/head.mp4"));
});

// ---- run: resume + failure -------------------------------------------------

test("run resumes from the failed step and skips completed ones", async () => {
  const { config, calls } = recordingConfig();
  const service = new UgcPipelineService(config);

  // voiceover already completed last time (audio persisted); resume at talking_head.
  const steps: UgcStepRecord[] = buildStepList(true);
  steps[0].status = "completed";
  const outputs: UgcJobOutputs = { audioUrl: "https://cdn.test/audio.mp3" };
  const result = await service.run(makeJob({ steps, outputs }));

  assert.equal(result.status, "completed");
  // voiceover NOT called again; the rest run.
  assert.ok(!calls.some((c) => c.startsWith("voiceover")));
  assert.ok(calls[0].startsWith("talkingHead"));
});

test("run stops at the first failing step and reports it", async () => {
  const { config, calls, patches } = recordingConfig();
  const failing: UgcPipelineConfig = {
    ...config,
    broll: async () => {
      throw new Error("kling exploded");
    },
  };
  const service = new UgcPipelineService(failing);
  const result = await service.run(makeJob());

  assert.equal(result.status, "failed");
  assert.equal(result.failedStep, "broll");
  // assembly/reframe/finalize never ran
  assert.ok(!calls.some((c) => c.startsWith("assembly")));
  assert.ok(!calls.some((c) => c.startsWith("finalize")));

  const last = patches.at(-1)!;
  assert.equal(last.status, "failed");
  const brollStep = last.steps!.find((s) => s.key === "broll")!;
  assert.equal(brollStep.status, "failed");
  assert.match(brollStep.error!, /kling exploded/);
});

test("run fails loudly when reframe produced no variants", async () => {
  const { config } = recordingConfig();
  const service = new UgcPipelineService({
    ...config,
    reframe: async () => ({ variants: [], cost: 0 }),
  });
  const result = await service.run(makeJob());
  assert.equal(result.status, "failed");
  assert.equal(result.failedStep, "finalize");
});

test("run marks a step generating before running it (live progress)", async () => {
  const { config, patches } = recordingConfig();
  const service = new UgcPipelineService(config);
  await service.run(makeJob());
  // At least one persisted patch shows a step mid-flight as "generating".
  const sawGenerating = patches.some(
    (p) =>
      p.status === "generating" &&
      (p.steps ?? []).some((s) => s.status === "generating"),
  );
  assert.ok(sawGenerating);
});
