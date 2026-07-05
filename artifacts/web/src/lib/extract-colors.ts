/**
 * DEV-11: Client-side dominant color extraction for the logo upload.
 *
 * Draws the image onto a small offscreen canvas, reads raw pixels with
 * getImageData, quantizes each opaque pixel into a coarse RGB bucket,
 * then returns the most frequent buckets as hex colors (deduped by
 * perceptual distance). No external package — plain canvas pixel math.
 * Runs only in the browser.
 */

const SAMPLE_SIZE = 100; // downscale target — 10k pixels is plenty
const BUCKET_STEP = 32; // quantization step per RGB channel
const MIN_ALPHA = 128; // ignore mostly-transparent pixels
const MIN_DISTANCE = 60; // min RGB distance between returned colors

interface Bucket {
  count: number;
  r: number;
  g: number;
  b: number;
}

function toHex(r: number, g: number, b: number): string {
  const part = (n: number) =>
    Math.max(0, Math.min(255, Math.round(n)))
      .toString(16)
      .padStart(2, "0");
  return `#${part(r)}${part(g)}${part(b)}`;
}

function distance(a: Bucket, b: Bucket): number {
  return Math.sqrt((a.r - b.r) ** 2 + (a.g - b.g) ** 2 + (a.b - b.b) ** 2);
}

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Could not load the image"));
    };
    img.src = url;
  });
}

/**
 * Extract up to `maxColors` dominant colors from an image file.
 * Throws if the image can't be loaded or drawn (e.g. malformed SVG).
 */
export async function extractDominantColors(
  file: File,
  maxColors: number,
): Promise<string[]> {
  const img = await loadImage(file);

  // SVGs without intrinsic dimensions report 0 — fall back to a fixed box.
  const naturalWidth = img.naturalWidth || SAMPLE_SIZE;
  const naturalHeight = img.naturalHeight || SAMPLE_SIZE;
  const scale = Math.min(
    1,
    SAMPLE_SIZE / Math.max(naturalWidth, naturalHeight),
  );
  const width = Math.max(1, Math.round(naturalWidth * scale));
  const height = Math.max(1, Math.round(naturalHeight * scale));

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("Canvas is not available");

  ctx.drawImage(img, 0, 0, width, height);
  const { data } = ctx.getImageData(0, 0, width, height);

  const buckets = new Map<string, Bucket>();
  for (let i = 0; i < data.length; i += 4) {
    const alpha = data[i + 3];
    if (alpha < MIN_ALPHA) continue;

    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];

    const qr = Math.min(255, Math.floor(r / BUCKET_STEP) * BUCKET_STEP + BUCKET_STEP / 2);
    const qg = Math.min(255, Math.floor(g / BUCKET_STEP) * BUCKET_STEP + BUCKET_STEP / 2);
    const qb = Math.min(255, Math.floor(b / BUCKET_STEP) * BUCKET_STEP + BUCKET_STEP / 2);

    const key = `${qr},${qg},${qb}`;
    const bucket = buckets.get(key);
    if (bucket) {
      bucket.count += 1;
      // Running average keeps the swatch closer to the real pixels
      // than the bucket center alone.
      bucket.r += (r - bucket.r) / bucket.count;
      bucket.g += (g - bucket.g) / bucket.count;
      bucket.b += (b - bucket.b) / bucket.count;
    } else {
      buckets.set(key, { count: 1, r, g, b });
    }
  }

  const sorted = [...buckets.values()].sort((a, b) => b.count - a.count);

  const picked: Bucket[] = [];
  for (const bucket of sorted) {
    if (picked.length >= maxColors) break;
    if (picked.some((p) => distance(p, bucket) < MIN_DISTANCE)) continue;
    picked.push(bucket);
  }

  return picked.map((p) => toHex(p.r, p.g, p.b));
}
