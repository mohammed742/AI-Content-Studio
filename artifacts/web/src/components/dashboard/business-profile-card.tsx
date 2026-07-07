/**
 * DEV-14: Dashboard business-profile summary card.
 *
 * Renders the saved Business Profile (CONTEXT.md) at a glance — logo, name,
 * type, industry preset, brand tone, brand colors, products, target
 * customers, and connected platforms. Display-only (no interactivity), so
 * it renders as a Server Component.
 */
import { Building2, Palette, Sparkle, Tag, Users } from "lucide-react";
import type { BusinessProfile } from "@/db/schema";
import {
  BRAND_TONE_OPTIONS,
  BUSINESS_TYPE_OPTIONS,
  PLATFORM_OPTIONS,
} from "@/components/onboarding/onboarding-data";
import { Card, CardContent } from "@/components/ui/card";

const TYPE_BY_VALUE = new Map(BUSINESS_TYPE_OPTIONS.map((o) => [o.value, o]));
const TONE_BY_VALUE = new Map(BRAND_TONE_OPTIONS.map((o) => [o.value, o]));
const PLATFORM_BY_VALUE = new Map(PLATFORM_OPTIONS.map((o) => [o.value, o]));

function humanize(value: string): string {
  return value
    .replace(/[-_]/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function Section({
  icon: Icon,
  label,
  children,
}: {
  icon: typeof Building2;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 text-xs uppercase tracking-wide text-zinc-500">
        <Icon strokeWidth={1.5} className="h-3.5 w-3.5" />
        {label}
      </div>
      {children}
    </div>
  );
}

export function BusinessProfileCard({ profile }: { profile: BusinessProfile }) {
  const type = TYPE_BY_VALUE.get(profile.businessType);
  const TypeIcon = type?.icon ?? Building2;
  const typeLabel = type?.label ?? humanize(profile.businessType);
  const tone = TONE_BY_VALUE.get(profile.brandTone);
  const toneLabel = tone?.label ?? humanize(profile.brandTone);
  const presetLabel = profile.industryPreset
    ? (TYPE_BY_VALUE.get(profile.industryPreset)?.label ??
      humanize(profile.industryPreset))
    : null;
  const products = profile.products ?? [];
  const platforms = profile.socialPlatforms ?? [];
  const colors = profile.brandColors ?? [];

  return (
    <Card className="overflow-hidden rounded-xl border-zinc-800 bg-zinc-950/50">
      <CardContent className="p-6">
        {/* Header: logo + name + type + preset provenance */}
        <div className="flex items-start gap-4">
          {profile.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={profile.logoUrl}
              alt={`${profile.businessName} logo`}
              className="h-16 w-16 shrink-0 rounded-xl border border-zinc-800 bg-zinc-900/50 object-contain p-2"
            />
          ) : (
            <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-xl border border-zinc-800 bg-zinc-900/50">
              <TypeIcon strokeWidth={1.5} className="h-7 w-7 text-zinc-500" />
            </div>
          )}
          <div className="min-w-0 space-y-1">
            <h3 className="truncate text-xl font-semibold tracking-tight">
              {profile.businessName}
            </h3>
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-zinc-700 bg-zinc-900/60 px-2.5 py-0.5 text-xs text-zinc-300">
                <TypeIcon strokeWidth={1.5} className="h-3.5 w-3.5" />
                {typeLabel}
              </span>
              {presetLabel && (
                <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-0.5 text-xs text-emerald-300">
                  <Sparkle strokeWidth={1.5} className="h-3.5 w-3.5" />
                  Started from {presetLabel} preset
                </span>
              )}
            </div>
          </div>
        </div>

        <div className="mt-6 grid grid-cols-1 gap-6 sm:grid-cols-2">
          <Section icon={Sparkle} label="Brand tone">
            <p className="text-sm text-zinc-300">{toneLabel}</p>
          </Section>

          <Section icon={Palette} label="Brand colors">
            {colors.length > 0 ? (
              <div className="flex flex-wrap gap-1.5">
                {colors.map((color) => (
                  <span
                    key={color}
                    className="h-6 w-6 rounded-md border border-zinc-700"
                    style={{ backgroundColor: color }}
                    title={color}
                    aria-label={color}
                  />
                ))}
              </div>
            ) : (
              <p className="text-sm text-zinc-600">None set</p>
            )}
          </Section>

          <Section icon={Tag} label={`Products & services (${products.length})`}>
            {products.length > 0 ? (
              <ul className="space-y-0.5 text-sm text-zinc-300">
                {products.map((p, i) => (
                  <li key={`${p.name}-${i}`} className="truncate">
                    {p.name}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-zinc-600">None added</p>
            )}
          </Section>

          <Section
            icon={Building2}
            label={`Platforms (${platforms.length})`}
          >
            {platforms.length > 0 ? (
              <div className="flex flex-wrap gap-2">
                {platforms.map((value) => {
                  const platform = PLATFORM_BY_VALUE.get(value);
                  const Icon = platform?.icon;
                  return (
                    <span
                      key={value}
                      className="inline-flex items-center gap-1.5 rounded-full border border-zinc-700 bg-zinc-900/60 px-2.5 py-0.5 text-xs text-zinc-300"
                    >
                      {Icon && (
                        <Icon strokeWidth={1.5} className="h-3.5 w-3.5" />
                      )}
                      {platform?.label ?? humanize(value)}
                    </span>
                  );
                })}
              </div>
            ) : (
              <p className="text-sm text-zinc-600">None connected</p>
            )}
          </Section>

          {profile.targetCustomers && (
            <div className="sm:col-span-2">
              <Section icon={Users} label="Target customers">
                <p className="max-w-[70ch] text-sm leading-relaxed text-zinc-300">
                  {profile.targetCustomers}
                </p>
              </Section>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
