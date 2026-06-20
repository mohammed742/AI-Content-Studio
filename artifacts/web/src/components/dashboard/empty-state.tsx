"use client";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Sparkle, ArrowRight } from "lucide-react";

export function EmptyState() {
  return (
    <div className="flex items-center justify-center min-h-[60vh] p-4">
      <Card className="w-full max-w-lg text-center">
        <CardHeader className="space-y-4">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10">
            <Sparkle className="h-8 w-8 text-primary" strokeWidth={1.5} />
          </div>
          <div className="space-y-2">
            <CardTitle className="text-2xl font-semibold tracking-tight">
              Welcome to AI Content Studio
            </CardTitle>
            <CardDescription className="text-base text-muted-foreground leading-relaxed max-w-[50ch] mx-auto">
              Let&apos;s set up your business profile so we can start generating
              personalized content for you.
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          <Button size="lg" className="gap-2 rounded-full" asChild>
            <a href="/onboarding">
              Set up your business profile
              <ArrowRight className="h-4 w-4" />
            </a>
          </Button>
          <p className="mt-4 text-sm text-muted-foreground">
            Takes about 2 minutes. You can skip any step and come back later.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
