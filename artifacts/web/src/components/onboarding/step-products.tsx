"use client";

import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { OnboardingFormState, ProductDraft } from "./onboarding-data";

interface StepProductsProps {
  form: OnboardingFormState;
  onChange: (patch: Partial<OnboardingFormState>) => void;
}

export function StepProducts({ form, onChange }: StepProductsProps) {
  const updateProduct = (index: number, patch: Partial<ProductDraft>) => {
    const products = form.products.map((p, i) =>
      i === index ? { ...p, ...patch } : p,
    );
    onChange({ products });
  };

  const addProduct = () => {
    onChange({ products: [...form.products, { name: "", description: "" }] });
  };

  const removeProduct = (index: number) => {
    onChange({ products: form.products.filter((_, i) => i !== index) });
  };

  return (
    <div className="space-y-6">
      <p className="max-w-[65ch] text-sm leading-relaxed text-zinc-400">
        List the products or services you want to promote. We&apos;ll use
        these to generate photos, captions, and videos.
      </p>

      <div className="space-y-4">
        {form.products.map((product, index) => (
          <div
            key={index}
            className="space-y-3 rounded-xl border border-zinc-800 bg-zinc-900/50 p-4"
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium uppercase tracking-wide text-zinc-500">
                Product {index + 1}
              </span>
              {form.products.length > 1 && (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-zinc-500 hover:text-red-400"
                  onClick={() => removeProduct(index)}
                  aria-label={`Remove product ${index + 1}`}
                >
                  <Trash2 strokeWidth={1.5} className="h-4 w-4" />
                </Button>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor={`product-name-${index}`}>Name</Label>
              <Input
                id={`product-name-${index}`}
                placeholder="e.g. Classic Sourdough Loaf"
                value={product.name}
                onChange={(e) => updateProduct(index, { name: e.target.value })}
                maxLength={120}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor={`product-description-${index}`}>
                Description{" "}
                <span className="font-normal text-zinc-500">(optional)</span>
              </Label>
              <Textarea
                id={`product-description-${index}`}
                placeholder="What makes it special?"
                value={product.description}
                onChange={(e) =>
                  updateProduct(index, { description: e.target.value })
                }
                rows={2}
                maxLength={500}
              />
            </div>
          </div>
        ))}
      </div>

      <Button
        type="button"
        variant="outline"
        onClick={addProduct}
        className="rounded-lg"
      >
        <Plus strokeWidth={1.5} className="h-4 w-4" />
        Add another
      </Button>
    </div>
  );
}
