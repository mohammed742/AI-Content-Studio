import { Metadata } from "next";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description: "How AI Content Studio collects, uses, and protects your data.",
};

export default function PrivacyPage() {
  return (
    <main className="min-h-[100dvh] bg-zinc-950 text-zinc-50">
      <div className="max-w-3xl mx-auto px-6 py-16 md:py-24">
        <h1 className="text-3xl font-semibold tracking-tight text-zinc-50 mb-2">
          Privacy Policy
        </h1>
        <p className="text-sm text-zinc-500 mb-12">
          Last updated: {new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}
        </p>

        <div className="space-y-12 text-sm text-zinc-400 leading-relaxed">
          <section className="space-y-4">
            <h2 className="text-base font-medium text-zinc-50">1. Information We Collect</h2>
            <p>
              We collect information you provide directly to us, such as your name, email address, business information, and content you create. We also collect usage data to improve our service.
            </p>
          </section>

          <section className="space-y-4">
            <h2 className="text-base font-medium text-zinc-50">2. How We Use Your Information</h2>
            <p>
              We use your information to provide and improve our services, generate content for your business, communicate with you, and ensure the security of our platform.
            </p>
          </section>

          <section className="space-y-4">
            <h2 className="text-base font-medium text-zinc-50">3. Data Sharing</h2>
            <p>
              We do not sell your personal information. We may share data with trusted third-party service providers (e.g., cloud hosting, AI model providers) solely to deliver our services.
            </p>
          </section>

          <section className="space-y-4">
            <h2 className="text-base font-medium text-zinc-50">4. Data Security</h2>
            <p>
              We implement industry-standard security measures to protect your data. However, no method of transmission over the internet is 100% secure.
            </p>
          </section>

          <section className="space-y-4">
            <h2 className="text-base font-medium text-zinc-50">5. Your Rights</h2>
            <p>
              You can request access, correction, or deletion of your personal data at any time by contacting us.
            </p>
          </section>
        </div>
      </div>
    </main>
  );
}
