import type { Metadata } from "next";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import { Toaster } from "sonner";
import { ClerkProvider } from "@clerk/nextjs";
import { env } from "@/env";
import "./globals.css";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  metadataBase: new URL("https://aicontentstudio.app"),
  title: {
    default: "AI Content Studio — AI-Powered Social Content for Small Businesses",
    template: "%s | AI Content Studio",
  },
  description:
    "Generate product photos, video ads, captions, and a full content calendar — all tailored to your business. Start free.",
  openGraph: {
    title: "AI Content Studio — AI-Powered Social Content for Small Businesses",
    description:
      "Generate product photos, video ads, captions, and a full content calendar — all tailored to your business. Start free.",
    type: "website",
    images: [{ url: "/opengraph-image", width: 1200, height: 630 }],
  },
  twitter: {
    card: "summary_large_image",
    title: "AI Content Studio — AI-Powered Social Content for Small Businesses",
    description:
      "Generate product photos, video ads, captions, and a full content calendar — all tailored to your business. Start free.",
    images: [{ url: "/opengraph-image", width: 1200, height: 630 }],
  },
  robots: { index: true, follow: true },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <ClerkProvider
      publishableKey={env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY}
      signInUrl="/sign-in"
      signUpUrl="/sign-up"
      signInFallbackRedirectUrl="/dashboard"
      signUpFallbackRedirectUrl="/dashboard"
    >
      <html
        lang="en"
        className={`dark ${GeistSans.variable} ${GeistMono.variable}`}
      >
        <body className="font-sans antialiased bg-background text-foreground">
          {children}
          <Toaster richColors position="top-right" />
        </body>
      </html>
    </ClerkProvider>
  );
}
