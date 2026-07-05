"use client";

/**
 * DEV-10: Multi-step onboarding wizard.
 *
 * Six steps collecting the Business Profile (see CONTEXT.md) that drives
 * all generation. Form state lives here in a single object, so navigating
 * Back/Next never loses data. On submit, POSTs to /api/business-profile
 * and redirects to /dashboard with a success toast.
 */
import { useState } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowLeft, ArrowRight, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  INITIAL_FORM_STATE,
  STEP_TITLES,
  TOTAL_STEPS,
  type OnboardingFormState,
} from "./onboarding-data";
import { StepBusinessType } from "./step-business-type";
import { StepProducts } from "./step-products";
import { StepCustomers } from "./step-customers";
import { StepBrand } from "./step-brand";
import { StepPlatforms } from "./step-platforms";
import { StepReview } from "./step-review";

/**
 * The API returns either a plain string error or a Zod fieldErrors object
 * ({ fieldName: ["message", ...] }). Flatten either shape into a readable
 * message so validation feedback isn't lost.
 */
function formatApiError(error: unknown): string {
  if (typeof error === "string") return error;
  if (error && typeof error === "object") {
    const parts = Object.entries(error as Record<string, unknown>)
      .map(([field, messages]) => {
        const text = Array.isArray(messages)
          ? messages.filter((m) => typeof m === "string").join(", ")
          : String(messages);
        return text ? `${field}: ${text}` : null;
      })
      .filter((p): p is string => p !== null);
    if (parts.length > 0) return parts.join(" · ");
  }
  return "Please check your inputs and try again";
}

export function OnboardingWizard() {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [direction, setDirection] = useState<1 | -1>(1);
  const [form, setForm] = useState<OnboardingFormState>(INITIAL_FORM_STATE);
  const [submitting, setSubmitting] = useState(false);

  const patchForm = (
    patch:
      | Partial<OnboardingFormState>
      | ((prev: OnboardingFormState) => Partial<OnboardingFormState>),
  ) => {
    setForm((prev) => ({
      ...prev,
      ...(typeof patch === "function" ? patch(prev) : patch),
    }));
  };

  const goTo = (next: number) => {
    setDirection(next > step ? 1 : -1);
    setStep(Math.min(Math.max(next, 1), TOTAL_STEPS));
  };

  const stepValid = (): { valid: boolean; message?: string } => {
    if (step === 1) {
      if (!form.businessName.trim()) {
        return { valid: false, message: "Enter your business name" };
      }
      if (!form.businessType) {
        return { valid: false, message: "Pick a business type" };
      }
    }
    if (step === 4 && !form.brandTone) {
      return { valid: false, message: "Pick a brand tone" };
    }
    return { valid: true };
  };

  const handleNext = () => {
    const { valid, message } = stepValid();
    if (!valid) {
      toast.error(message);
      return;
    }
    goTo(step + 1);
  };

  const handleSubmit = async () => {
    if (!form.businessType || !form.brandTone) {
      toast.error("Business type and brand tone are required");
      return;
    }
    setSubmitting(true);
    try {
      const payload = {
        businessName: form.businessName.trim(),
        businessType: form.businessType,
        products: form.products
          .filter((p) => p.name.trim().length > 0)
          .map((p) => ({
            name: p.name.trim(),
            ...(p.description.trim()
              ? { description: p.description.trim() }
              : {}),
          })),
        ...(form.targetCustomers.trim()
          ? { targetCustomers: form.targetCustomers.trim() }
          : {}),
        brandColors: form.brandColors,
        brandTone: form.brandTone,
        socialPlatforms: form.socialPlatforms,
        ...(form.logoUrl ? { logoUrl: form.logoUrl } : {}),
      };

      const res = await fetch("/api/business-profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const body = (await res.json()) as {
        data: unknown;
        error: unknown;
      };

      if (res.status === 409) {
        // Profile already exists — nothing to fix here, just move on.
        toast.info("You already have a business profile. Taking you to your dashboard.");
        router.push("/dashboard");
        return;
      }

      if (!res.ok) {
        throw new Error(formatApiError(body.error));
      }

      toast.success("Your business profile is ready! 🎉");
      router.push("/dashboard");
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Something went wrong";
      toast.error(`Couldn't save your profile: ${message}`);
      setSubmitting(false);
    }
  };

  const isLastStep = step === TOTAL_STEPS;

  return (
    <div className="mx-auto w-full max-w-3xl">
      <div className="mb-8 space-y-4">
        <div className="flex items-center justify-between">
          <h1 className="text-3xl font-semibold tracking-tight">
            Set up your business
          </h1>
          <span className="text-sm text-zinc-500">
            Step {step} of {TOTAL_STEPS}
          </span>
        </div>
        <div
          className="flex items-center gap-2"
          role="progressbar"
          aria-valuemin={1}
          aria-valuemax={TOTAL_STEPS}
          aria-valuenow={step}
          aria-label={`Step ${step} of ${TOTAL_STEPS}`}
        >
          {Array.from({ length: TOTAL_STEPS }, (_, i) => (
            <span
              key={i}
              className={cn(
                "h-1.5 flex-1 rounded-full transition-colors",
                i < step ? "bg-emerald-500" : "bg-zinc-800",
              )}
            />
          ))}
        </div>
      </div>

      <Card className="overflow-hidden rounded-xl border-zinc-800 bg-zinc-950/50">
        <CardHeader>
          <CardTitle className="text-xl font-medium">
            {STEP_TITLES[step - 1]}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <AnimatePresence mode="wait" custom={direction}>
            <motion.div
              key={step}
              custom={direction}
              initial={{ opacity: 0, x: direction * 32 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: direction * -32 }}
              transition={{ duration: 0.2, ease: "easeOut" }}
            >
              {step === 1 && (
                <StepBusinessType form={form} onChange={patchForm} />
              )}
              {step === 2 && <StepProducts form={form} onChange={patchForm} />}
              {step === 3 && <StepCustomers form={form} onChange={patchForm} />}
              {step === 4 && <StepBrand form={form} onChange={patchForm} />}
              {step === 5 && <StepPlatforms form={form} onChange={patchForm} />}
              {step === 6 && <StepReview form={form} onEditStep={goTo} />}
            </motion.div>
          </AnimatePresence>
        </CardContent>
      </Card>

      <div className="mt-6 flex items-center justify-between">
        <Button
          type="button"
          variant="outline"
          className="rounded-lg"
          onClick={() => goTo(step - 1)}
          disabled={step === 1 || submitting}
        >
          <ArrowLeft strokeWidth={1.5} className="h-4 w-4" />
          Back
        </Button>

        {isLastStep ? (
          <Button
            type="button"
            className="rounded-full px-6"
            onClick={handleSubmit}
            disabled={submitting}
          >
            {submitting ? (
              <>
                <Loader2
                  strokeWidth={1.5}
                  className="h-4 w-4 animate-spin"
                />
                Saving...
              </>
            ) : (
              "Finish setup"
            )}
          </Button>
        ) : (
          <Button
            type="button"
            className="rounded-full px-6"
            onClick={handleNext}
          >
            Next
            <ArrowRight strokeWidth={1.5} className="h-4 w-4" />
          </Button>
        )}
      </div>
    </div>
  );
}
