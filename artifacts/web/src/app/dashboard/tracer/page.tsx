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
 * DEV-7/DEV-8: Agent Loop tracer page.
 *
 * "Run Tracer" calls `/api/tracer/generate-image`, which exercises the
 * Execute (Muapi) and Assemble (R2 upload) steps of the Agent Loop against
 * the hardcoded Business Profile below. Results (image, cost, duration)
 * render in the Results card.
 */

interface TracerResult {
  r2Url: string;
  cost: number;
  duration: number;
}

interface TracerApiResponse {
  data: TracerResult | null;
  error: string | null;
}

export default function TracerPage() {
  const [isRunning, setIsRunning] = useState(false);
  const [result, setResult] = useState<TracerResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleRunTracer = async () => {
    setIsRunning(true);
    setError(null);
    setResult(null);

    try {
      const response = await fetch("/api/tracer/generate-image", {
        method: "POST",
      });
      const body = (await response.json()) as TracerApiResponse;

      if (!response.ok || body.error || !body.data) {
        throw new Error(body.error ?? `Request failed (${response.status})`);
      }

      setResult(body.data);
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
              Generating product photo, uploading to R2...
            </div>
          )}

          {!isRunning && error && (
            <div className="flex min-h-32 flex-col items-center justify-center gap-2 rounded-md border border-destructive/50 bg-destructive/5 p-4 text-center text-sm text-destructive">
              <p className="font-medium">Tracer run failed</p>
              <p className="text-destructive/80">{error}</p>
            </div>
          )}

          {!isRunning && !error && result && (
            <div className="flex flex-col gap-4 sm:flex-row">
              {/* eslint-disable-next-line @next/next/no-img-element -- R2 domain is env-driven, not known at build time */}
              <img
                src={result.r2Url}
                alt="Generated product photo"
                className="h-48 w-48 rounded-md border object-cover"
              />
              <dl className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <dt className="text-muted-foreground">Cost</dt>
                  <dd className="font-medium">${result.cost.toFixed(4)}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Duration</dt>
                  <dd className="font-medium">
                    {(result.duration / 1000).toFixed(1)}s
                  </dd>
                </div>
                <div className="col-span-2">
                  <dt className="text-muted-foreground">R2 URL</dt>
                  <dd className="break-all font-medium">
                    <a
                      href={result.r2Url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="underline"
                    >
                      {result.r2Url}
                    </a>
                  </dd>
                </div>
              </dl>
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
