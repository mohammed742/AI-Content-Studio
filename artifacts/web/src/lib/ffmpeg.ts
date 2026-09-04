/**
 * DEV-32 (STU-27, re-run 2026-08-09): server-side FFmpeg video concatenation —
 * the **primary** path of the UGC Assembly step (`ugc-assembly.ts`).
 *
 * `plan-phase-3.md` originally made Muapi's `video-combiner` primary to dodge
 * the FFmpeg-on-Replit risk. The human reverted that 2026-08-09: FFmpeg is
 * primary, `video-combiner` is the fallback (which is also what DEV-32's Linear
 * title said all along). This module is the FFmpeg half — it did not exist
 * before; the plan explicitly deferred it ("FFmpeg fallback intentionally NOT
 * built this slice").
 *
 * Deliberately **generic**: it concatenates any ordered list of remote clips at
 * a target size. It knows nothing about talking heads, B-roll, or aspect-ratio
 * enums — `ugc-assembly.ts` owns that vocabulary and passes concrete pixels
 * down. Keeping the UGC semantics out is what stops this and `ugc-assembly.ts`
 * importing each other in a cycle.
 *
 * ## Why re-encode instead of the concat demuxer
 *
 * The clips arrive from *different* models — `infinitetalk-image-to-video` for
 * the talking head, `kling-v2.1-standard-i2v` for the B-roll — so codec,
 * resolution, frame rate and SAR are not guaranteed to match. FFmpeg's cheap
 * `-f concat` demuxer requires bit-identical stream parameters and produces
 * silent corruption when they differ. We therefore normalise every clip through
 * the `concat` **filter** (scale → pad → setsar → fps) and re-encode. Slower,
 * but it cannot produce a subtly broken master.
 *
 * ## Why clips are probed first
 *
 * `concat=a=1` fails outright if any input lacks an audio stream — and B-roll
 * from an image-to-video model normally *is* silent while the talking head is
 * not. So each clip is probed with `ffprobe`, and every silent clip gets a
 * matching `anullsrc` silent track appended as an extra input. This is not
 * hypothetical: it is the exact shape of the real UGC pipeline.
 *
 * ## Testability
 *
 * Every impure edge — binary resolution, download, probe, process spawn, file
 * I/O, temp-dir creation, cleanup — is an injectable seam. All the real logic
 * lives in the pure builders (`buildConcatFilter`, `buildConcatArgs`,
 * `parseProbeOutput`), which unit-test without spawning a process or writing a
 * byte. The defaults lazily resolve `ffmpeg-static` / `ffprobe-static` so the
 * module still loads under the bare Node test runner.
 */
import { randomUUID } from "node:crypto";

/** Frame rate every clip is normalised to before concatenation. */
export const DEFAULT_FPS = 30;

/** Audio format every leg is normalised to (concat requires a uniform format). */
const AUDIO_SAMPLE_RATE = 44100;
const AUDIO_CHANNEL_LAYOUT = "stereo";

/**
 * Silence length used when `ffprobe` reports no duration at all. Only reached
 * on a malformed clip; a longer-than-needed silent leg is harmless (the concat
 * filter takes the longest leg per segment) whereas a zero-length one is not.
 */
const FALLBACK_DURATION_SECONDS = 5;

/** Fewer than two clips is nothing to stitch. */
export const MIN_CONCAT_CLIPS = 2;

/**
 * Wall-clock cap on one ffmpeg invocation. The encode runs inside a request on
 * Replit autoscale, so a hung process must fail fast enough for the caller to
 * still reach the `video-combiner` fallback rather than the request timing out
 * with nothing to show.
 */
export const DEFAULT_TIMEOUT_MS = 240_000;

/** What one clip contributes to the filter graph. */
export interface ClipProbe {
  /** Whether the clip carries an audio stream (silent clips get `anullsrc`). */
  hasAudio: boolean;
  /** Clip length in seconds — sizes the synthesised silence. */
  durationSeconds: number;
}

/** Concrete output geometry. `ugc-assembly.ts` maps its aspect enum to this. */
export interface ConcatTarget {
  width: number;
  height: number;
  fps: number;
}

export interface ConcatResult {
  /** The encoded master video. The caller uploads it and owns the URL. */
  buffer: Buffer;
  contentType: string;
  clipCount: number;
}

/**
 * Thrown when no ffmpeg binary can be resolved. Distinct from an encode failure
 * so callers can tell "this environment cannot do FFmpeg" (fall back for every
 * future render too) from "this particular encode failed".
 */
export class FfmpegUnavailableError extends Error {
  constructor(message = "FFmpeg binary is unavailable") {
    super(message);
    this.name = "FfmpegUnavailableError";
  }
}

/** Build the ffprobe argv for one local file. Pure. */
export function buildProbeArgs(input: string): string[] {
  return [
    "-v",
    "error",
    "-print_format",
    "json",
    "-show_streams",
    "-show_format",
    input,
  ];
}

/** Parse `ffprobe -print_format json` output into a {@link ClipProbe}. Pure. */
export function parseProbeOutput(stdout: string): ClipProbe {
  let parsed: {
    streams?: Array<{ codec_type?: string; duration?: string }>;
    format?: { duration?: string };
  };
  try {
    parsed = JSON.parse(stdout);
  } catch {
    throw new Error(`Could not parse ffprobe output: ${stdout.slice(0, 200)}`);
  }

  const streams = parsed.streams ?? [];
  const hasAudio = streams.some((stream) => stream.codec_type === "audio");

  // Container duration is the reliable one; fall back to the first stream that
  // declares its own, then to a safe non-zero constant.
  const candidates = [
    parsed.format?.duration,
    ...streams.map((stream) => stream.duration),
  ];
  const durationSeconds =
    candidates
      .map((value) => Number(value))
      .find((value) => Number.isFinite(value) && value > 0) ??
    FALLBACK_DURATION_SECONDS;

  return { hasAudio, durationSeconds };
}

/**
 * Resolve, per clip, which input index supplies its audio: its own when it has
 * an audio stream, otherwise a synthesised silent input appended after all the
 * real ones (in the order the silent clips appear). Pure.
 */
function audioInputIndexes(probes: ClipProbe[]): number[] {
  let nextSilent = probes.length;
  return probes.map((probe, index) => (probe.hasAudio ? index : nextSilent++));
}

/**
 * Build the `-filter_complex` graph: normalise each clip to the target geometry
 * and a uniform audio format, then concatenate the legs in order. Pure.
 */
export function buildConcatFilter(probes: ClipProbe[], target: ConcatTarget): string {
  const { width, height, fps } = target;
  const audioIndexes = audioInputIndexes(probes);

  const legs = probes.flatMap((_probe, index) => [
    // `force_original_aspect_ratio=decrease` + `pad` letterboxes rather than
    // distorting; `setsar=1` is what stops a mismatched pixel aspect ratio
    // making concat refuse the input.
    `[${index}:v]scale=${width}:${height}:force_original_aspect_ratio=decrease,` +
      `pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2,setsar=1,fps=${fps}[v${index}]`,
    `[${audioIndexes[index]}:a]aformat=sample_fmts=fltp:` +
      `sample_rates=${AUDIO_SAMPLE_RATE}:channel_layouts=${AUDIO_CHANNEL_LAYOUT}[a${index}]`,
  ]);

  const concatLegs = probes.map((_probe, index) => `[v${index}][a${index}]`).join("");
  const concat = `${concatLegs}concat=n=${probes.length}:v=1:a=1[outv][outa]`;

  return [...legs, concat].join(";");
}

/**
 * Build the full ffmpeg argv: real inputs, one `anullsrc` input per silent clip,
 * the filter graph, and a web-playable H.264/AAC MP4 encode. Pure.
 */
export function buildConcatArgs(options: {
  inputs: string[];
  probes: ClipProbe[];
  target: ConcatTarget;
  output: string;
}): string[] {
  const { inputs, probes, target, output } = options;

  if (inputs.length !== probes.length) {
    throw new Error(
      `FFmpeg concat needs one probe per input (got ${probes.length} probes for ${inputs.length} inputs)`,
    );
  }

  const realInputs = inputs.flatMap((input) => ["-i", input]);

  // One synthesised silent track per silent clip, ordered to match the indexes
  // `audioInputIndexes` handed out inside the filter graph.
  const silentInputs = probes
    .filter((probe) => !probe.hasAudio)
    .flatMap((probe) => [
      "-f",
      "lavfi",
      "-t",
      String(probe.durationSeconds),
      "-i",
      `anullsrc=channel_layout=${AUDIO_CHANNEL_LAYOUT}:sample_rate=${AUDIO_SAMPLE_RATE}`,
    ]);

  return [
    "-y",
    ...realInputs,
    ...silentInputs,
    "-filter_complex",
    buildConcatFilter(probes, target),
    "-map",
    "[outv]",
    "-map",
    "[outa]",
    "-c:v",
    "libx264",
    "-preset",
    "veryfast",
    "-crf",
    "23",
    "-pix_fmt",
    "yuv420p", // browsers refuse to play 4:4:4 H.264
    "-c:a",
    "aac",
    "-b:a",
    "128k",
    "-ar",
    String(AUDIO_SAMPLE_RATE),
    "-ac",
    "2",
    "-movflags",
    "+faststart", // the master is streamed from R2, so move the moov atom up
    output,
  ];
}

export interface FfmpegConfig {
  /** ffmpeg path. `undefined` = resolve lazily; `null` = known unavailable. */
  binary?: string | null;
  /** ffprobe path. Same convention as {@link FfmpegConfig.binary}. */
  probeBinary?: string | null;
  download?: (url: string) => Promise<Buffer>;
  probe?: (path: string) => Promise<ClipProbe>;
  run?: (binary: string, args: string[]) => Promise<{ stdout: string; stderr: string }>;
  makeWorkDir?: () => Promise<string>;
  writeFile?: (path: string, buffer: Buffer) => Promise<void>;
  readFile?: (path: string) => Promise<Buffer>;
  cleanup?: (paths: string[]) => Promise<void>;
  timeoutMs?: number;
}

export class FfmpegService {
  private readonly config: FfmpegConfig;

  constructor(config: FfmpegConfig = {}) {
    this.config = config;
  }

  /** ffmpeg path, or throw {@link FfmpegUnavailableError}. */
  private async resolveBinary(): Promise<string> {
    const configured = this.config.binary;
    if (configured === null) {
      throw new FfmpegUnavailableError();
    }
    if (typeof configured === "string" && configured.trim()) {
      return configured;
    }
    const resolved = await resolveStaticBinary("ffmpeg-static");
    if (!resolved) {
      throw new FfmpegUnavailableError(
        "ffmpeg-static resolved no binary — check its install script ran (pnpm onlyBuiltDependencies)",
      );
    }
    return resolved;
  }

  private async resolveProbeBinary(): Promise<string> {
    const configured = this.config.probeBinary;
    if (configured === null) {
      throw new FfmpegUnavailableError("ffprobe binary is unavailable");
    }
    if (typeof configured === "string" && configured.trim()) {
      return configured;
    }
    const resolved = await resolveStaticBinary("ffprobe-static");
    if (!resolved) {
      throw new FfmpegUnavailableError("ffprobe-static resolved no binary");
    }
    return resolved;
  }

  /**
   * Download the ordered clips, normalise + concatenate them into one MP4, and
   * return the encoded bytes. Throws {@link FfmpegUnavailableError} when the
   * environment has no binary, or the underlying error on an encode failure —
   * `ugc-assembly.ts` treats *either* as a cue to fall back to `video-combiner`.
   *
   * Temp files are always cleaned up, success or failure.
   */
  async concatVideos(request: {
    clipUrls: string[];
    target: ConcatTarget;
  }): Promise<ConcatResult> {
    const { clipUrls, target } = request;

    if (clipUrls.length < MIN_CONCAT_CLIPS) {
      throw new Error(
        `FFmpeg concat needs at least ${MIN_CONCAT_CLIPS} clips (got ${clipUrls.length})`,
      );
    }

    // Resolve both binaries before any I/O: an unavailable environment should
    // cost nothing and reach the fallback immediately.
    const binary = await this.resolveBinary();
    const probeBinary = await this.resolveProbeBinary();

    const download = this.config.download ?? defaultDownload;
    const run = this.config.run ?? defaultRun(this.config.timeoutMs ?? DEFAULT_TIMEOUT_MS);
    const writeFile = this.config.writeFile ?? defaultWriteFile;
    const readFile = this.config.readFile ?? defaultReadFile;
    const cleanup = this.config.cleanup ?? defaultCleanup;
    const makeWorkDir = this.config.makeWorkDir ?? defaultMakeWorkDir;
    const probe =
      this.config.probe ??
      (async (path: string) => {
        const { stdout } = await run(probeBinary, buildProbeArgs(path));
        return parseProbeOutput(stdout);
      });

    const workDir = await makeWorkDir();

    try {
      const inputs: string[] = [];
      for (let index = 0; index < clipUrls.length; index += 1) {
        const localPath = `${workDir}/clip-${index}.mp4`;
        await writeFile(localPath, await download(clipUrls[index]));
        inputs.push(localPath);
      }

      const probes: ClipProbe[] = [];
      for (const input of inputs) {
        probes.push(await probe(input));
      }

      const output = `${workDir}/master-${randomUUID()}.mp4`;
      await run(binary, buildConcatArgs({ inputs, probes, target, output }));

      return {
        buffer: await readFile(output),
        contentType: "video/mp4",
        clipCount: clipUrls.length,
      };
    } finally {
      // Never let cleanup mask the real failure — a leaked temp dir is a far
      // smaller problem than a swallowed encode error.
      await cleanup([workDir]).catch(() => {});
    }
  }
}

/**
 * Resolve a static-binary package's path without a static import, so this
 * module loads even where the package is absent.
 *
 * Uses dynamic `import()` rather than `require()` deliberately: `require` is
 * undefined in a real ESM context (the bare Node test runner, the probe
 * scripts), where it would throw, get swallowed, and make FFmpeg look
 * permanently "unavailable" — silently downgrading every render to the
 * `video-combiner` fallback with no error anywhere. `import()` works in both
 * ESM and the transpiled CJS server bundle.
 *
 * `ffmpeg-static` default-exports the path string; `ffprobe-static` exports an
 * object with `.path`. Interop can nest either behind `.default`, so unwrap.
 */
async function resolveStaticBinary(packageName: string): Promise<string | null> {
  try {
    const loaded: unknown = await import(/* webpackIgnore: true */ packageName);
    return unwrapBinaryPath(loaded);
  } catch {
    return null;
  }
}

/** Dig a path string out of a module namespace, `.default`, or `{ path }`. */
function unwrapBinaryPath(value: unknown, depth = 0): string | null {
  if (typeof value === "string") {
    return value.trim() ? value : null;
  }
  if (!value || typeof value !== "object" || depth > 2) {
    return null;
  }
  const record = value as { path?: unknown; default?: unknown };
  return unwrapBinaryPath(record.path, depth + 1)
    ?? unwrapBinaryPath(record.default, depth + 1);
}

const defaultDownload = async (url: string): Promise<Buffer> => {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(
      `Failed to download assembly clip (${response.status} ${response.statusText}): ${url}`,
    );
  }
  return Buffer.from(await response.arrayBuffer());
};

/**
 * Spawn a binary and collect its output. `execFile` (not `exec`) so the argv is
 * passed as an array and never goes through a shell — clip paths and filter
 * graphs contain characters a shell would mangle.
 */
const defaultRun =
  (timeoutMs: number) =>
  async (binary: string, args: string[]): Promise<{ stdout: string; stderr: string }> => {
    const { execFile } = await import("node:child_process");
    return new Promise((resolve, reject) => {
      execFile(
        binary,
        args,
        { timeout: timeoutMs, maxBuffer: 32 * 1024 * 1024 },
        (error, stdout, stderr) => {
          if (error) {
            // ffmpeg puts the actual diagnosis on stderr; the Error alone is
            // just "Command failed", which is useless in a pipeline log.
            reject(new Error(`${error.message}\n${stderr}`.trim()));
            return;
          }
          resolve({ stdout, stderr });
        },
      );
    });
  };

const defaultMakeWorkDir = async (): Promise<string> => {
  const [{ mkdtemp }, os, path] = await Promise.all([
    import("node:fs/promises"),
    import("node:os"),
    import("node:path"),
  ]);
  return mkdtemp(path.join(os.tmpdir(), "ugc-assembly-"));
};

const defaultWriteFile = async (path: string, buffer: Buffer): Promise<void> => {
  const { writeFile } = await import("node:fs/promises");
  await writeFile(path, buffer);
};

const defaultReadFile = async (path: string): Promise<Buffer> => {
  const { readFile } = await import("node:fs/promises");
  return readFile(path);
};

const defaultCleanup = async (paths: string[]): Promise<void> => {
  const { rm } = await import("node:fs/promises");
  await Promise.all(paths.map((path) => rm(path, { recursive: true, force: true })));
};

export const ffmpegService = new FfmpegService();
