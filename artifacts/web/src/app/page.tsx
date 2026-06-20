import { NavBar } from "@/components/landing/nav-bar";
import { HeroSection } from "@/components/landing/hero-section";
import { FeaturesSection } from "@/components/landing/features-section";
import { CtaSection } from "@/components/landing/cta-section";
import { Footer } from "@/components/landing/footer";

const jsonLd = {
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  name: "AI Content Studio",
  applicationCategory: "BusinessApplication",
  offers: {
    "@type": "Offer",
    price: "19",
    priceCurrency: "USD",
  },
  description:
    "AI-powered social media content for small businesses. Generate product photos, captions, hashtags, and video ads in seconds.",
};

export default function HomePage() {
  return (
    <div className="min-h-[100dvh] flex flex-col bg-zinc-950">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <NavBar />
      <main>
        <HeroSection />
        <FeaturesSection />
        <CtaSection />
      </main>
      <Footer />
    </div>
  );
}
