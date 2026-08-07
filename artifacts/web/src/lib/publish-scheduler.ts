/**
 * DEV-42: the Publish Scheduler (CONTEXT.md → "Publish Scheduler").
 *
 * Scheduled publishing: a Calendar Entry the user has scheduled goes out on its
 * own date + time, to the connected Social Account for its platform, with
 * nobody at the keyboard. An external scheduler drives this through
 * `POST /api/cron/publish`; this module is all of the actual behaviour.
 *
 * One run does two passes:
 *
 *   1. **Advance** — every entry already in flight (`scheduled` + a
 *      `publishJobId`) has its Publish Job polled once: completed → the entry
 *      is `published`, failed → `failed`, still processing → left alone.
 *      Publishing is async at Muapi (1-5 min), so an entry cannot go out and
 *      land inside a single run; the *next* run finishes the job.
 *   2. **Submit** — every entry that is now due is claimed and submitted.
 *
 * Publishing itself is entirely `social-publishing.ts` (DEV-36/37/38) — this
 * module decides *which* entries and *when*, never how to talk to Muapi.
 *
 * Two rules shape the whole design, because the failure modes here cost real
 * money and post publicly:
 *
 * - **Claim before submitting.** Two overlapping runs seeing the same due entry
 *   would each submit it: two posts, two charges. The claim is a conditional
 *   UPDATE on `publishAttemptedAt`; the loser gets no row back and skips.
 * - **Skips are non-destructive.** An entry that isn't due, has no connected
 *   account, or sits on a platform we can't publish to is left exactly as it
 *   was, so a later run (or a later connect) still picks it up. Only a genuine
 *   publish failure writes `failed`.
 *
 * Everything is unit-tested through injectable seams — no DB, no network.
 */
import {
  MAX_INSTAGRAM_CAPTION_LENGTH,
  MAX_PUBLISH_DESCRIPTION_LENGTH,
  MAX_PUBLISH_TITLE_LENGTH,
  MAX_TIKTOK_CAPTION_LENGTH,
  type PublishAssetKitRequest,
} from "./social-publishing.ts";
import type {
  CalendarEntry,
  PublishJob,
  SocialAccount,
  SocialPlatform,
} from "@/db/schema";

/**
 * Runtime platform list, typed against the schema enum so it can't drift.
 * Local for the same reason as `social-publishing.ts`'s copy: lib modules only
 * `import type` from `@/db/schema` — a runtime value import doesn't resolve
 * under the bare Node test runner (see PROGRESS.md → DEV-15).
 */
const PUBLISHABLE_PLATFORMS: readonly SocialPlatform[] = [
  "youtube",
  "tiktok",
  "instagram",
];

/** Most entries one run will touch, in each pass. Bounds cost and runtime. */
export const MAX_ENTRIES_PER_RUN = 25;

/** The Asset Kit fields a publish needs. */
export interface PublishableKit {
  id: string;
  mediaUrl: string;
  caption: string;
  hashtags: string[];
}

/** A `"HH:MM"` time-of-day, split. Throws on anything else. */
export function parseEntryTime(time: string): {
  hours: number;
  minutes: number;
} {
  const match = /^(\d{1,2}):(\d{2})$/.exec((time ?? "").trim());
  if (!match) {
    throw new Error(`Invalid entry time: ${JSON.stringify(time)}`);
  }
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) {
    throw new Error(`Invalid entry time: ${JSON.stringify(time)}`);
  }
  return { hours, minutes };
}

/**
 * The exact moment an entry is meant to publish: its UTC-midnight `date` plus
 * its time-of-day. All-UTC, like the rest of the calendar (DEV-40/41).
 */
export function entryDueAt(entry: { date: Date; time: string }): Date {
  const { hours, minutes } = parseEntryTime(entry.time);
  return new Date(
    Date.UTC(
      entry.date.getUTCFullYear(),
      entry.date.getUTCMonth(),
      entry.date.getUTCDate(),
      hours,
      minutes,
    ),
  );
}

/** Has this entry's moment arrived? */
export function isEntryDue(
  entry: { date: Date; time: string },
  now: Date,
): boolean {
  return entryDueAt(entry).getTime() <= now.getTime();
}

/**
 * Narrow a Calendar Entry's free-text `platform` to a platform we can actually
 * publish to, or `null`. Plan items carry broader strings than the three-value
 * enum (CONTEXT.md → "Calendar Entry"), e.g. `linkedin` — those are simply not
 * publishable yet, which is a skip, not an error.
 */
export function resolvePublishPlatform(value: string): SocialPlatform | null {
  const slug = (value ?? "").trim().toLowerCase();
  return (PUBLISHABLE_PLATFORMS as readonly string[]).includes(slug)
    ? (slug as SocialPlatform)
    : null;
}

/**
 * The post body for a kit: its caption plus its hashtags, capped at the
 * platform's limit. The publish param builders throw above their caps, and a
 * throw here would mark the entry failed — so the cap is applied before they
 * ever see it.
 */
export function composeCaption(kit: PublishableKit, limit: number): string {
  const parts = [kit.caption?.trim(), ...(kit.hashtags ?? [])].filter(Boolean);
  return parts.join(" ").slice(0, limit).trim();
}

/** The user's first connected account for a platform, or null. */
function accountForPlatform(
  accounts: SocialAccount[],
  platform: SocialPlatform,
): SocialAccount | null {
  return accounts.find((account) => account.platform === platform) ?? null;
}

/**
 * Build the publish request for one entry. YouTube needs a real title, so it
 * gets the entry's (the plan item's) title with the kit's caption as the
 * description; TikTok and Instagram are caption-only.
 */
function buildRequest(
  platform: SocialPlatform,
  entry: CalendarEntry,
  kit: PublishableKit,
  account: SocialAccount,
): PublishAssetKitRequest {
  const base = {
    userId: entry.userId,
    socialAccountId: account.id,
    assetKitId: kit.id,
    mediaUrl: kit.mediaUrl,
  };
  if (platform === "youtube") {
    return {
      ...base,
      title: entry.title.trim().slice(0, MAX_PUBLISH_TITLE_LENGTH),
      description: composeCaption(kit, MAX_PUBLISH_DESCRIPTION_LENGTH),
    };
  }
  const limit =
    platform === "tiktok"
      ? MAX_TIKTOK_CAPTION_LENGTH
      : MAX_INSTAGRAM_CAPTION_LENGTH;
  return { ...base, title: composeCaption(kit, limit) };
}

// --- injectable seams -----------------------------------------------------

/** Candidate due entries: `scheduled`, unclaimed, dated on or before `now`. */
export type DueEntryLister = (args: {
  now: Date;
  limit: number;
}) => Promise<CalendarEntry[]>;

/** Entries already submitted and awaiting a terminal Publish Job. */
export type InFlightEntryLister = (limit: number) => Promise<CalendarEntry[]>;

/**
 * Claim an entry for this run — a conditional UPDATE that matches only an
 * unclaimed, still-`scheduled` row. `null` means another run got there first.
 */
export type EntryClaimer = (entryId: string) => Promise<CalendarEntry | null>;

/** Fields the scheduler ever writes back to an entry. */
export type CalendarEntryPatch = Partial<
  Pick<CalendarEntry, "status" | "publishJobId" | "publishAttemptedAt">
>;

/** Write scheduler state back to an entry. */
export type EntryPatcher = (
  entryId: string,
  patch: CalendarEntryPatch,
) => Promise<CalendarEntry | null>;

/** Resolve the owned Asset Kit an entry publishes, or null. */
export type PublishableKitGetter = (
  userId: string,
  kitId: string,
) => Promise<PublishableKit | null>;

/** A user's connected accounts. */
export type SchedulerAccountLister = (
  userId: string,
) => Promise<SocialAccount[]>;

/** Submit a publish (delegates to the DEV-36/37/38 service). */
export type KitPublisher = (
  request: PublishAssetKitRequest,
) => Promise<PublishJob>;

/** Poll one owned Publish Job once, persisting any terminal transition. */
export type JobRefresher = (userId: string, jobId: string) => Promise<PublishJob>;

export interface PublishSchedulerConfig {
  listDueEntries?: DueEntryLister;
  listInFlightEntries?: InFlightEntryLister;
  claimEntry?: EntryClaimer;
  patchEntry?: EntryPatcher;
  getPublishableKit?: PublishableKitGetter;
  listAccounts?: SchedulerAccountLister;
  publishKit?: KitPublisher;
  refreshJob?: JobRefresher;
}

/** What one run did. Returned by the cron route for observability. */
export interface SchedulerRunSummary {
  /** Publishes submitted to Muapi this run. */
  submitted: number;
  /** In-flight entries that reached `published`. */
  published: number;
  /** Entries that reached `failed` (submit threw, or the job failed). */
  failed: number;
  /** Due-pass entries deliberately left untouched. */
  skipped: number;
}

export class PublishSchedulerService {
  private readonly listDue: DueEntryLister;
  private readonly listInFlight: InFlightEntryLister;
  private readonly claim: EntryClaimer;
  private readonly patch: EntryPatcher;
  private readonly getKit: PublishableKitGetter;
  private readonly listAccountsFor: SchedulerAccountLister;
  private readonly publish: KitPublisher;
  private readonly refresh: JobRefresher;

  constructor(config: PublishSchedulerConfig = {}) {
    this.listDue = config.listDueEntries ?? defaultListDueEntries;
    this.listInFlight = config.listInFlightEntries ?? defaultListInFlightEntries;
    this.claim = config.claimEntry ?? defaultClaimEntry;
    this.patch = config.patchEntry ?? defaultPatchEntry;
    this.getKit = config.getPublishableKit ?? defaultGetPublishableKit;
    this.listAccountsFor = config.listAccounts ?? defaultListAccounts;
    this.publish = config.publishKit ?? defaultPublishKit;
    this.refresh = config.refreshJob ?? defaultRefreshJob;
  }

  /**
   * One scheduler pass: advance what's in flight, then submit what's due.
   * Every entry is handled in isolation — one broken row (or one Muapi hiccup)
   * must never cost the rest of the batch its run.
   */
  async runDuePublishes(
    args: { now?: Date; limit?: number } = {},
  ): Promise<SchedulerRunSummary> {
    const now = args.now ?? new Date();
    const limit = args.limit ?? MAX_ENTRIES_PER_RUN;
    const summary: SchedulerRunSummary = {
      submitted: 0,
      published: 0,
      failed: 0,
      skipped: 0,
    };

    await this.advanceInFlight(limit, summary);
    await this.submitDue(now, limit, summary);
    return summary;
  }

  /** Pass 1 — poll each in-flight entry's Publish Job to a terminal state. */
  private async advanceInFlight(limit: number, summary: SchedulerRunSummary) {
    let entries: CalendarEntry[];
    try {
      entries = await this.listInFlight(limit);
    } catch (error) {
      logFailure("listing in-flight entries", error);
      return;
    }

    for (const entry of entries) {
      if (!entry.publishJobId) {
        continue;
      }
      try {
        const job = await this.refresh(entry.userId, entry.publishJobId);
        if (job.status === "completed") {
          await this.patch(entry.id, { status: "published" });
          summary.published += 1;
        } else if (job.status === "failed") {
          await this.patch(entry.id, { status: "failed" });
          summary.failed += 1;
        }
        // Still processing: leave it in flight for the next run.
      } catch (error) {
        // A poll error is transient by assumption — the entry stays in flight
        // rather than being failed on the strength of one bad HTTP call.
        logFailure(`advancing calendar entry ${entry.id}`, error);
      }
    }
  }

  /** Pass 2 — claim and submit every entry whose moment has arrived. */
  private async submitDue(
    now: Date,
    limit: number,
    summary: SchedulerRunSummary,
  ) {
    let entries: CalendarEntry[];
    try {
      entries = await this.listDue({ now, limit });
    } catch (error) {
      logFailure("listing due entries", error);
      return;
    }

    // The due query is day-granular, so one user usually has several entries in
    // a batch; their accounts are worth fetching once.
    const accountsByUser = new Map<string, SocialAccount[]>();

    for (const entry of entries) {
      try {
        const submitted = await this.submitEntry(entry, now, accountsByUser);
        if (submitted === "submitted") {
          summary.submitted += 1;
        } else if (submitted === "failed") {
          summary.failed += 1;
        } else {
          summary.skipped += 1;
        }
      } catch (error) {
        logFailure(`publishing calendar entry ${entry.id}`, error);
        summary.skipped += 1;
      }
    }
  }

  /**
   * One entry, in the cheapest-check-first order. Everything before the claim
   * is a read: an entry that fails any of those checks is left completely
   * untouched, so it stays eligible for a later run.
   */
  private async submitEntry(
    entry: CalendarEntry,
    now: Date,
    accountsByUser: Map<string, SocialAccount[]>,
  ): Promise<"submitted" | "failed" | "skipped"> {
    if (!isEntryDue(entry, now)) {
      return "skipped";
    }
    const platform = resolvePublishPlatform(entry.platform);
    if (!platform) {
      return "skipped";
    }
    if (!entry.assetKitId) {
      return "skipped";
    }

    let accounts = accountsByUser.get(entry.userId);
    if (!accounts) {
      accounts = await this.listAccountsFor(entry.userId);
      accountsByUser.set(entry.userId, accounts);
    }
    const account = accountForPlatform(accounts, platform);
    if (!account) {
      // Nothing is wrong with the entry — the user just hasn't connected that
      // platform yet. Connecting it later makes this entry go out.
      return "skipped";
    }

    const kit = await this.getKit(entry.userId, entry.assetKitId);
    if (!kit?.mediaUrl) {
      return "skipped";
    }

    const claimed = await this.claim(entry.id);
    if (!claimed) {
      // Another run owns this entry.
      return "skipped";
    }

    try {
      const job = await this.publish(buildRequest(platform, entry, kit, account));
      // Status stays `scheduled` — the entry is in flight, not published. The
      // job id is what pass 1 polls on the next run.
      await this.patch(entry.id, { publishJobId: job.id });
      return "submitted";
    } catch (error) {
      logFailure(`submitting calendar entry ${entry.id}`, error);
      await this.patch(entry.id, { status: "failed" });
      return "failed";
    }
  }
}

function logFailure(what: string, error: unknown) {
  const message = error instanceof Error ? error.message : "unknown";
  console.error(`[publish-scheduler] ${what} failed:`, message);
}

// --- default (real) seams -------------------------------------------------

/**
 * Due candidates: `scheduled`, not yet submitted, not yet claimed, dated on or
 * before now. Day-granular — `isEntryDue` applies the time-of-day. Runs across
 * all users (the `(status, date)` index exists for exactly this query).
 */
const defaultListDueEntries: DueEntryLister = async ({ now, limit }) => {
  const [{ db }, { calendarEntries }, { and, asc, eq, isNull, lte }] =
    await Promise.all([
      import("@/db"),
      import("@/db/schema"),
      import("drizzle-orm"),
    ]);
  return db
    .select()
    .from(calendarEntries)
    .where(
      and(
        eq(calendarEntries.status, "scheduled"),
        isNull(calendarEntries.publishJobId),
        isNull(calendarEntries.publishAttemptedAt),
        lte(calendarEntries.date, now),
      ),
    )
    .orderBy(asc(calendarEntries.date))
    .limit(limit);
};

/** In-flight: `scheduled` with a Publish Job attached, oldest first. */
const defaultListInFlightEntries: InFlightEntryLister = async (limit) => {
  const [{ db }, { calendarEntries }, { and, asc, eq, isNotNull }] =
    await Promise.all([
      import("@/db"),
      import("@/db/schema"),
      import("drizzle-orm"),
    ]);
  return db
    .select()
    .from(calendarEntries)
    .where(
      and(
        eq(calendarEntries.status, "scheduled"),
        isNotNull(calendarEntries.publishJobId),
      ),
    )
    .orderBy(asc(calendarEntries.date))
    .limit(limit);
};

/**
 * The claim. The predicate is the concurrency guard: only one run can match a
 * row whose `publishAttemptedAt` is still null, so only one can publish it.
 */
const defaultClaimEntry: EntryClaimer = async (entryId) => {
  const [{ db }, { calendarEntries }, { and, eq, isNull }] = await Promise.all([
    import("@/db"),
    import("@/db/schema"),
    import("drizzle-orm"),
  ]);
  const [claimed] = await db
    .update(calendarEntries)
    .set({ publishAttemptedAt: new Date() })
    .where(
      and(
        eq(calendarEntries.id, entryId),
        eq(calendarEntries.status, "scheduled"),
        isNull(calendarEntries.publishJobId),
        isNull(calendarEntries.publishAttemptedAt),
      ),
    )
    .returning();
  return claimed ?? null;
};

/**
 * Scheduler-owned writes. Not user-scoped: the cron has no session, and the
 * entry id came from a query this module ran itself.
 */
const defaultPatchEntry: EntryPatcher = async (entryId, patch) => {
  const [{ db }, { calendarEntries }, { eq }] = await Promise.all([
    import("@/db"),
    import("@/db/schema"),
    import("drizzle-orm"),
  ]);
  const [updated] = await db
    .update(calendarEntries)
    .set(patch)
    .where(eq(calendarEntries.id, entryId))
    .returning();
  return updated ?? null;
};

/** The owned kit's publishable fields. Owner-scoped, belt-and-braces. */
const defaultGetPublishableKit: PublishableKitGetter = async (userId, kitId) => {
  const [{ db }, { assetKits }, { and, eq }] = await Promise.all([
    import("@/db"),
    import("@/db/schema"),
    import("drizzle-orm"),
  ]);
  const [kit] = await db
    .select({
      id: assetKits.id,
      mediaUrl: assetKits.mediaUrl,
      caption: assetKits.caption,
      hashtags: assetKits.hashtags,
    })
    .from(assetKits)
    .where(and(eq(assetKits.id, kitId), eq(assetKits.userId, userId)))
    .limit(1);
  return kit ?? null;
};

const defaultListAccounts: SchedulerAccountLister = async (userId) => {
  const { socialPublishingService } = await import("./social-publishing.ts");
  return socialPublishingService.listAccounts(userId);
};

const defaultPublishKit: KitPublisher = async (request) => {
  const { socialPublishingService } = await import("./social-publishing.ts");
  return socialPublishingService.publishAssetKit(request);
};

const defaultRefreshJob: JobRefresher = async (userId, jobId) => {
  const { socialPublishingService } = await import("./social-publishing.ts");
  return socialPublishingService.refreshPublishJob(userId, jobId);
};

export const publishSchedulerService = new PublishSchedulerService();
