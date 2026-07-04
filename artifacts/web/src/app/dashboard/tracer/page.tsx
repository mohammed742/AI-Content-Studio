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
 * DEV-7: Agent Loop tracer page shell.
 *
 * This is a placeholder shell — "Run Tracer" doesn't invoke the Agent
 * Loop yet. It exists so the next slice can wire the button into the
 * real Plan → Retrieve → Route → Execute → Assemble → Publish pipeline
 * against the hardcoded Business Profile below.
 */
export default function TracerPage() {
  const [isRunning, setIsRunning] = useState(false);

  const handleRunTracer = () => {
    setIsRunning(true);
    // TODO(DEV-8+): invoke the Agent Loop and stream results here.
    setTimeout(() => setIsRunning(false), 600);
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
          <div className="flex min-h-32 items-center justify-center rounded-md border border-dashed text-sm text-muted-foreground">
            No results yet — run the tracer to see output.
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
