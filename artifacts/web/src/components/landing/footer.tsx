import Link from "next/link";

export function Footer() {
  return (
    <footer className="border-t border-zinc-800 bg-zinc-950">
      <div className="max-w-7xl mx-auto px-6 py-12">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          <div className="space-y-4">
            <div className="font-semibold text-zinc-50 tracking-tight">
              AI Content Studio
            </div>
            <p className="text-sm text-zinc-400 leading-relaxed">
              AI-powered social media content for small businesses. Generate
              photos, captions, and video ads in seconds.
            </p>
          </div>

          <div className="space-y-4">
            <div className="text-sm font-medium text-zinc-50">Product</div>
            <div className="space-y-2">
              <Link
                href="/"
                className="block text-sm text-zinc-400 hover:text-zinc-200 transition-colors"
              >
                Home
              </Link>
              <Link
                href="/sign-in"
                className="block text-sm text-zinc-400 hover:text-zinc-200 transition-colors"
              >
                Sign In
              </Link>
              <Link
                href="/sign-up"
                className="block text-sm text-zinc-400 hover:text-zinc-200 transition-colors"
              >
                Sign Up
              </Link>
            </div>
          </div>

          <div className="space-y-4">
            <div className="text-sm font-medium text-zinc-50">Legal</div>
            <div className="space-y-2">
              <Link
                href="/privacy"
                className="block text-sm text-zinc-400 hover:text-zinc-200 transition-colors"
              >
                Privacy Policy
              </Link>
              <Link
                href="/terms"
                className="block text-sm text-zinc-400 hover:text-zinc-200 transition-colors"
              >
                Terms of Service
              </Link>
            </div>
          </div>
        </div>

        <div className="mt-12 pt-8 border-t border-zinc-800 text-sm text-zinc-500 text-center">
          &copy; {new Date().getFullYear()} AI Content Studio. All rights
          reserved.
        </div>
      </div>
    </footer>
  );
}
