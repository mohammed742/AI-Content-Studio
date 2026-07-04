import { Metadata } from "next";

export const metadata: Metadata = {
  title: "Terms of Service",
  description: "The terms and conditions for using AI Content Studio.",
};

export default function TermsPage() {
  return (
    <main className="min-h-[100dvh] bg-zinc-950 text-zinc-50">
      <div className="max-w-3xl mx-auto px-6 py-16 md:py-24">
        <h1 className="text-3xl font-semibold tracking-tight text-zinc-50 mb-2">
          Terms of Service
        </h1>
        <p className="text-sm text-zinc-500 mb-12">
          Last updated: June 21, 2026
        </p>

        <div className="space-y-12 text-sm text-zinc-400 leading-relaxed">
          <section className="space-y-4">
            <h2 className="text-base font-medium text-zinc-50">1. Acceptance of Terms</h2>
            <p>
              By accessing or using AI Content Studio, you agree to be bound by these Terms of Service. If you do not agree, please do not use our service.
            </p>
          </section>

          <section className="space-y-4">
            <h2 className="text-base font-medium text-zinc-50">2. Description of Service</h2>
            <p>
              AI Content Studio provides AI-powered tools to generate social media content, including images, videos, captions, and content calendars, for small businesses.
            </p>
          </section>

          <section className="space-y-4">
            <h2 className="text-base font-medium text-zinc-50">3. User Accounts</h2>
            <p>
              You are responsible for maintaining the confidentiality of your account credentials. You agree to notify us immediately of any unauthorized use of your account.
            </p>
          </section>

          <section className="space-y-4">
            <h2 className="text-base font-medium text-zinc-50">4. Acceptable Use</h2>
            <p>
              You may not use our service to generate illegal, harmful, defamatory, or infringing content. We reserve the right to suspend accounts violating these rules.
            </p>
          </section>

          <section className="space-y-4">
            <h2 className="text-base font-medium text-zinc-50">5. Payment and Subscriptions</h2>
            <p>
              Subscription fees are billed in advance. You may cancel at any time, but no refunds will be provided for partial billing periods.
            </p>
          </section>

          <section className="space-y-4">
            <h2 className="text-base font-medium text-zinc-50">6. Limitation of Liability</h2>
            <p>
              AI Content Studio is provided &ldquo;as is&rdquo; without warranties of any kind. We are not liable for any damages arising from your use of the service.
            </p>
          </section>
        </div>
      </div>
    </main>
  );
}
