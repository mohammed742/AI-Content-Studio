/**
 * DEV-32 (STU-27, re-run): Unit tests for the server-side FFmpeg concat service.
 *
 * Node built-in runner + native TS type-stripping (see PROGRESS.md → DEV-15).
 * Every seam (binary resolution, download, probe, process spawn, file I/O) is
 * injected, so the filter-graph and argv construction — where all the real
 * logic lives — verify without spawning a process or touching the disk.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  FfmpegService,
  FfmpegUnavailableError,
  buildConcatArgs,
  buildConcatFilter,
  buildProbeArgs,
  parseProbeOutput,
  DEFAULT_FPS,
  type ClipProbe,
  type ConcatTarget,
  type FfmpegConfig,
} from "./ffmpeg.ts";

const TARGET: ConcatTarget = { width: 1280, height: 720, fps: DEFAULT_FPS };

const WITH_AUDIO: ClipProbe = { hasAudio: true, durationSeconds: 8 };
const NO_AUDIO: ClipProbe = { hasAudio: false, durationSeconds: 4 };

const CLIP_A = "https://cdn/talking-head.mp4";
const CLIP_B = "https://cdn/broll.mp4";

/** Build a service whose every seam is a fake; overrides win. */
function fakeService(overrides: FfmpegConfig = {}) {
  const runs: Array<{ binary: string; args: string[] }> = [];
  const downloaded: string[] = [];
  const written: string[] = [];
  const cleaned: string[][] = [];

  const config: FfmpegConfig = {
    binary: "/bin/ffmpeg",
    probeBinary: "/bin/ffprobe",
    download: async (url) => {
      downloaded.push(url);
      return Buffer.from(`bytes:${url}`);
    },
    probe: async () => WITH_AUDIO,
    run: async (binary, args) => {
      runs.push({ binary, args });
      return { stdout: "", stderr: "" };
    },
    makeWorkDir: async () => "/tmp/work",
    writeFile: async (path) => {
      written.push(path);
    },
    readFile: async () => Buffer.from("MASTER"),
    cleanup: async (paths) => {
      cleaned.push(paths);
    },
    ...overrides,
  };

  return { service: new FfmpegService(config), runs, downloaded, written, cleaned };
}

// ---------------------------------------------------------------- probe ----

test("buildProbeArgs asks ffprobe for JSON streams + format of one file", () => {
  const args = buildProbeArgs("/tmp/clip.mp4");
  assert.ok(args.includes("-print_format"));
  assert.ok(args.includes("json"));
  assert.ok(args.includes("-show_streams"));
  assert.ok(args.includes("-show_format"));
  assert.equal(args.at(-1), "/tmp/clip.mp4", "the input path must come last");
});

test("parseProbeOutput detects an audio stream and reads the duration", () => {
  const probe = parseProbeOutput(
    JSON.stringify({
      streams: [{ codec_type: "video" }, { codec_type: "audio" }],
      format: { duration: "8.32" },
    }),
  );
  assert.equal(probe.hasAudio, true);
  assert.equal(probe.durationSeconds, 8.32);
});

test("parseProbeOutput reports a silent clip as hasAudio false", () => {
  const probe = parseProbeOutput(
    JSON.stringify({ streams: [{ codec_type: "video" }], format: { duration: "5" } }),
  );
  assert.equal(probe.hasAudio, false);
  assert.equal(probe.durationSeconds, 5);
});

test("parseProbeOutput falls back to a positive duration when ffprobe omits it", () => {
  const probe = parseProbeOutput(JSON.stringify({ streams: [], format: {} }));
  assert.equal(probe.hasAudio, false);
  assert.ok(probe.durationSeconds > 0, "a zero-length silent track would break concat");
});

test("parseProbeOutput fails loud on unparseable ffprobe output", () => {
  assert.throws(() => parseProbeOutput("not json"), /ffprobe/i);
});

// --------------------------------------------------------------- filter ----

test("buildConcatFilter normalises every clip to the target and concatenates in order", () => {
  const filter = buildConcatFilter([WITH_AUDIO, WITH_AUDIO], TARGET);

  assert.ok(filter.includes("scale=1280:720:force_original_aspect_ratio=decrease"));
  assert.ok(filter.includes("pad=1280:720"), "letterbox rather than distort");
  assert.ok(filter.includes("setsar=1"), "mismatched SAR would break concat");
  assert.ok(filter.includes(`fps=${DEFAULT_FPS}`));
  assert.ok(
    filter.includes("[v0][a0][v1][a1]concat=n=2:v=1:a=1[outv][outa]"),
    `clip order must survive into the concat leg list: ${filter}`,
  );
});

test("buildConcatFilter maps a silent clip to a synthesised silent input", () => {
  // Clip 0 has audio, clip 1 does not → one anullsrc input appended at index 2.
  const filter = buildConcatFilter([WITH_AUDIO, NO_AUDIO], TARGET);

  assert.ok(filter.includes("[0:a]"), "clip 0 keeps its real audio");
  assert.ok(!filter.includes("[1:a]"), "clip 1 has no audio stream to reference");
  assert.ok(filter.includes("[2:a]"), "clip 1 must borrow the appended silent input");
  assert.ok(filter.includes("[v0][a0][v1][a1]concat=n=2:v=1:a=1[outv][outa]"));
});

test("buildConcatFilter indexes multiple silent clips independently", () => {
  const filter = buildConcatFilter([NO_AUDIO, WITH_AUDIO, NO_AUDIO], TARGET);

  // Real inputs 0,1,2 → silent inputs appended at 3 (for clip 0) and 4 (for clip 2).
  assert.ok(filter.includes("[3:a]"));
  assert.ok(filter.includes("[1:a]"), "the middle clip keeps its own audio");
  assert.ok(filter.includes("[4:a]"));
  assert.ok(filter.includes("concat=n=3:v=1:a=1[outv][outa]"));
});

test("buildConcatFilter honours a non-default target size and fps", () => {
  const filter = buildConcatFilter([WITH_AUDIO, WITH_AUDIO], {
    width: 720,
    height: 1280,
    fps: 24,
  });
  assert.ok(filter.includes("scale=720:1280"));
  assert.ok(filter.includes("pad=720:1280"));
  assert.ok(filter.includes("fps=24"));
});

// ----------------------------------------------------------------- argv ----

test("buildConcatArgs lists every real input, then one lavfi input per silent clip", () => {
  const args = buildConcatArgs({
    inputs: ["/tmp/0.mp4", "/tmp/1.mp4"],
    probes: [WITH_AUDIO, NO_AUDIO],
    target: TARGET,
    output: "/tmp/out.mp4",
  });

  const joined = args.join(" ");
  assert.ok(joined.includes("-i /tmp/0.mp4"));
  assert.ok(joined.includes("-i /tmp/1.mp4"));
  assert.ok(joined.includes("-f lavfi"), "silent clip needs a synthesised track");
  assert.ok(joined.includes("anullsrc"));
  assert.ok(joined.includes(`-t ${NO_AUDIO.durationSeconds}`), "silence matches clip length");
  assert.equal(args.at(-1), "/tmp/out.mp4", "output path comes last");
});

test("buildConcatArgs adds no lavfi input when every clip has audio", () => {
  const args = buildConcatArgs({
    inputs: ["/tmp/0.mp4", "/tmp/1.mp4"],
    probes: [WITH_AUDIO, WITH_AUDIO],
    target: TARGET,
    output: "/tmp/out.mp4",
  });
  assert.ok(!args.includes("-f"), "no lavfi input expected");
  assert.ok(!args.join(" ").includes("anullsrc"));
});

test("buildConcatArgs re-encodes to a web-playable MP4 and maps the filter outputs", () => {
  const args = buildConcatArgs({
    inputs: ["/tmp/0.mp4", "/tmp/1.mp4"],
    probes: [WITH_AUDIO, WITH_AUDIO],
    target: TARGET,
    output: "/tmp/out.mp4",
  });
  const joined = args.join(" ");

  assert.ok(args.includes("-y"), "must overwrite without prompting");
  assert.ok(joined.includes("-map [outv]"));
  assert.ok(joined.includes("-map [outa]"));
  assert.ok(joined.includes("libx264"));
  assert.ok(joined.includes("yuv420p"), "required for browser playback");
  assert.ok(joined.includes("aac"));
  assert.ok(joined.includes("+faststart"), "the master is streamed from R2");
});

test("buildConcatArgs rejects a probe list that does not match the inputs", () => {
  assert.throws(
    () =>
      buildConcatArgs({
        inputs: ["/tmp/0.mp4", "/tmp/1.mp4"],
        probes: [WITH_AUDIO],
        target: TARGET,
        output: "/tmp/out.mp4",
      }),
    /probe/i,
  );
});

// -------------------------------------------------------------- service ----

test("concatVideos downloads, probes, runs ffmpeg, and returns the encoded buffer", async () => {
  const { service, runs, downloaded } = fakeService();

  const result = await service.concatVideos({
    clipUrls: [CLIP_A, CLIP_B],
    target: TARGET,
  });

  assert.deepEqual(downloaded, [CLIP_A, CLIP_B], "clips fetched in order");
  assert.equal(runs.length, 1, "one ffmpeg invocation");
  assert.equal(runs[0].binary, "/bin/ffmpeg");
  assert.equal(result.buffer.toString(), "MASTER");
  assert.equal(result.contentType, "video/mp4");
  assert.equal(result.clipCount, 2);
});

test("concatVideos throws FfmpegUnavailableError when no binary resolves", async () => {
  const { service, runs } = fakeService({ binary: null });

  await assert.rejects(
    () => service.concatVideos({ clipUrls: [CLIP_A, CLIP_B], target: TARGET }),
    (error: Error) => {
      assert.ok(error instanceof FfmpegUnavailableError);
      return true;
    },
  );
  assert.equal(runs.length, 0, "must not spawn anything without a binary");
});

test("concatVideos probes each clip and passes the results into the filter graph", async () => {
  const probes: ClipProbe[] = [WITH_AUDIO, NO_AUDIO];
  let index = 0;
  const { service, runs } = fakeService({ probe: async () => probes[index++] });

  await service.concatVideos({ clipUrls: [CLIP_A, CLIP_B], target: TARGET });

  const joined = runs[0].args.join(" ");
  assert.ok(joined.includes("anullsrc"), "the silent second clip must be detected");
});

test("concatVideos cleans up its temp files even when ffmpeg fails", async () => {
  const { service, cleaned } = fakeService({
    run: async () => {
      throw new Error("ffmpeg exited 1: Invalid data found");
    },
  });

  await assert.rejects(
    () => service.concatVideos({ clipUrls: [CLIP_A, CLIP_B], target: TARGET }),
    /Invalid data found/,
  );
  assert.equal(cleaned.length, 1, "cleanup must run on the failure path too");
});

test("concatVideos cleans up its temp files on success", async () => {
  const { service, cleaned } = fakeService();
  await service.concatVideos({ clipUrls: [CLIP_A, CLIP_B], target: TARGET });
  assert.equal(cleaned.length, 1);
});

test("concatVideos rejects fewer than two clips before touching the disk", async () => {
  const { service, downloaded, runs } = fakeService();

  await assert.rejects(
    () => service.concatVideos({ clipUrls: [CLIP_A], target: TARGET }),
    /at least 2 clips/,
  );
  assert.equal(downloaded.length, 0);
  assert.equal(runs.length, 0);
});

test("concatVideos propagates a download failure without spawning ffmpeg", async () => {
  const { service, runs } = fakeService({
    download: async () => {
      throw new Error("clip fetch 404");
    },
  });

  await assert.rejects(
    () => service.concatVideos({ clipUrls: [CLIP_A, CLIP_B], target: TARGET }),
    /clip fetch 404/,
  );
  assert.equal(runs.length, 0);
});
