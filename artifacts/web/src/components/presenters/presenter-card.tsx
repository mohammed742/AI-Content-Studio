/**
 * STU-C7 (DEV-64): One presenter tile — portrait + name + gender·age·style meta
 * + audience-tag pills. Portrait is 4:5 to match the placeholder SVGs; real
 * portraits (Phase 3) drop in at the same `imageUrl`.
 */
import type { Presenter } from "@/lib/presenters";

const TAG_LABELS: Record<string, string> = {
  "young-professionals": "Young professionals",
  families: "Families",
  students: "Students",
  "fitness-enthusiasts": "Fitness",
  "beauty-wellness": "Beauty & wellness",
  "luxury-shoppers": "Luxury",
  "trend-followers": "Trends",
  homeowners: "Homeowners",
  entrepreneurs: "Entrepreneurs",
  foodies: "Foodies",
};

const GENDER_LABELS: Record<Presenter["gender"], string> = {
  female: "Female",
  male: "Male",
  nonbinary: "Non-binary",
};

export function PresenterCard({ presenter }: { presenter: Presenter }) {
  return (
    <div className="group overflow-hidden rounded-xl border border-border bg-card transition-colors hover:border-primary/40">
      <div className="relative aspect-[4/5] overflow-hidden bg-muted/40">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={presenter.imageUrl}
          alt={`${presenter.name}, presenter`}
          className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
        />
      </div>

      <div className="space-y-2 p-4">
        <div>
          <h3 className="text-sm font-semibold tracking-tight">{presenter.name}</h3>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {GENDER_LABELS[presenter.gender]} · {presenter.ageRange} · {presenter.style}
          </p>
        </div>

        <div className="flex flex-wrap gap-1.5">
          {presenter.targetAudienceTags.map((tag) => (
            <span
              key={tag}
              className="rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary"
            >
              {TAG_LABELS[tag] ?? tag}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
