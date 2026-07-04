"use client";

import { useState } from "react";
import { Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { tracerBusinessProfile } from "@/lib/tracer-data";

/**
 * DEV-7/DEV-8/DEV-13: Agent Loop tracer page.
 *
 * "Run Tracer" calls `/api/tracer/generate-image` (Execute + Assemble:
 * Muapi + R2 upload), then chains a call to `/api/tracer/generate-caption`
 * (Assemble: GPT-4.1-mini caption + hashtags) against the hardcoded
 * Business Profile below. Results — image, caption, hashtags, and a full
 * Muapi + OpenAI cost breakdown — render in the Results card.
 */

interface ImageResult {
  r2Url: string;
  cost: number;
  duration: number;
}

interface CaptionResult {
  caption: string;
  hashtags: string[];
  cost: number;
  duration: number;
}

interface TracerResult {
  image: ImageResult;
  caption: CaptionResult;
}

interface ImageApiResponse {
  data: ImageResult | null;
  error: string | null;
}

interface CaptionApiResponse {
  data: CaptionResult | null;
  error: string | null;
}

export default function TracerPage() {
  const [isRunning, setIsRunning] = useState(false);
  const [statusMessage, setStatusMessage] = useState(
    "Generating product photo, uploading to R2...",
  );
  const [result, setResult] = useState<TracerResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleRunTracer = async () => {
    setIsRunning(true);
    setError(null);
    setResult(null);
    setStatusMessage("Generating product photo, uploading to R2...");

    try {
      const imageResponse = await fetch("/api/tracer/generate-image", {
        method: "POST",
      });
      const imageBody = (await imageResponse.json()) as ImageApiResponse;

      if (!imageResponse.ok || imageBody.error || !imageBody.data) {
        throw new Error(
          imageBody.error ?? `Request failed (${imageResponse.status})`,
        );
      }

      setStatusMessage("Generating caption with GPT-4.1-mini...");

      const [product] = tracerBusinessProfile.products;
      const imageDescription =
        `A professional product photo of ${product?.name ?? "a product"} — ` +
        `${product?.description ?? ""} for ${tracerBusinessProfile.businessName}, ` +
        `a ${tracerBusinessProfile.businessType}.`;

      const captionResponse = await fetch("/api/tracer/generate-caption", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageDescription }),
      });
      const captionBody =
        (await captionResponse.json()) as CaptionApiResponse;

      if (!captionResponse.ok || captionBody.error || !captionBody.data) {
        throw new Error(
          captionBody.error ?? `Request failed (${captionResponse.status})`,
        );
      }

      setResult({ image: imageBody.data, caption: captionBody.data });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setIsRunning(false);
    }
  };

  return (
    <div className="flex flex-col gap-6 p-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          Agent Loop Tracer
        </h1>
        <p className="text-sm text-muted-foreground">
          Runs the generation pipeline against a hardcoded Business Profile
          so we can verify each step in isolation.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{tracerBusinessProfile.businessName}</CardTitle>
          <CardDescription>{tracerBusinessProfile.description}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <dl className="grid grid-cols-2 gap-4 text-sm sm:grid-cols-3">
            <div>
              <dt className="text-muted-foreground">Business Type</dt>
              <dd className="font-medium capitalize">
                {tracerBusinessProfile.businessType}
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Brand Tone</dt>
              <dd className="font-medium capitalize">
                {tracerBusinessProfile.brandKit.tone}
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Brand Colors</dt>
              <dd className="mt-1 flex gap-1.5">
                {tracerBusinessProfile.brandKit.colors.map((color) => (
                  <span
                    key={color}
                    className="h-5 w-5 rounded-full border"
                    style={{ backgroundColor: color }}
                    title={color}
                  />
                ))}
              </dd>
            </div>
          </dl>

          <div>
            <p className="mb-2 text-sm text-muted-foreground">
              Sample Products
            </p>
            <ul className="flex flex-col gap-2">
              {tracerBusinessProfile.products.map((product) => (
                <li
                  key={product.name}
                  className="flex items-center justify-between rounded-md border p-3 text-sm"
                >
                  <div>
                    <p className="font-medium">{product.name}</p>
                    <p className="text-muted-foreground">
                      {product.description}
                    </p>
                  </div>
                  <span className="font-medium">{product.price}</span>
                </li>
              ))}
            </ul>
          </div>
        </CardContent>
      </Card>

      <div>
        <Button onClick={handleRunTracer} disabled={isRunning}>
          <Sparkles />
          {isRunning ? "Running..." : "Run Tracer"}
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Results</CardTitle>
          <CardDescription>
            Agent Loop output will appear here once the pipeline is wired up.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isRunning && (
            <div className="flex min-h-32 items-center justify-center rounded-md border border-dashed text-sm text-muted-foreground">
              {statusMessage}
            </div>
          )}

          {!isRunning && error && (
            <div className="flex min-h-32 flex-col items-center justify-center gap-2 rounded-md border border-destructive/50 bg-destructive/5 p-4 text-center text-sm text-destructive">
              <p className="font-medium">Tracer run failed</p>
              <p className="text-destructive/80">{error}</p>
            </div>
          )}

          {!isRunning && !error && result && (
            <div className="flex flex-col gap-6">
              <div className="flex flex-col gap-4 sm:flex-row">
                {/* eslint-disable-next-line @next/next/no-img-element -- R2 domain is env-driven, not known at build time */}
                <img
                  src={result.image.r2Url}
                  alt="Generated product photo"
                  className="h-48 w-48 rounded-md border object-cover"
                />
                <div className="flex flex-1 flex-col gap-3">
                  <div>
                    <p className="text-sm text-muted-foreground">Caption</p>
                    <p className="font-medium">{result.caption.caption}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Hashtags</p>
                    <div className="mt-1 flex flex-wrap gap-1.5">
                      {result.caption.hashtags.map((tag) => (
                        <span
                          key={tag}
                          className="rounded-full border bg-muted px-2 py-0.5 text-xs font-medium"
                        >
                          #{tag}
                        </span>
                      ))}
                    </div>
                  </div>
                  <div>
                    <p className="break-all text-sm text-muted-foreground">
                      R2 URL:{" "}
                      <a
                        href={result.image.r2Url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="underline"
                      >
                        {result.image.r2Url}
                      </a>
                    </p>
                  </div>
                </div>
              </div>

              <div>
                <p className="mb-2 text-sm text-muted-foreground">
                  Cost Breakdown
                </p>
                <dl className="grid grid-cols-2 gap-4 text-sm sm:grid-cols-4">
                  <div>
                    <dt className="text-muted-foreground">Muapi (image)</dt>
                    <dd className="font-medium">
                      ${result.image.cost.toFixed(4)}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">OpenAI (caption)</dt>
                    <dd className="font-medium">
                      ${result.caption.cost.toFixed(4)}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Total Cost</dt>
                    <dd className="font-medium">
                      $
                      {(result.image.cost + result.caption.cost).toFixed(4)}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Total Duration</dt>
                    <dd className="font-medium">
                      {(
                        (result.image.duration + result.caption.duration) /
                        1000
                      ).toFixed(1)}
                      s
                    </dd>
                  </div>
                </dl>
              </div>
            </div>
          )}

          {!isRunning && !error && !result && (
            <div className="flex min-h-32 items-center justify-center rounded-md border border-dashed text-sm text-muted-foreground">
              No results yet — run the tracer to see output.
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
