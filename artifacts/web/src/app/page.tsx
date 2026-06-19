export default function HomePage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-8">
      <div className="text-center space-y-4">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-primary/10 mb-4">
          <span className="text-2xl">✦</span>
        </div>
        <h1 className="text-4xl font-bold tracking-tight text-foreground">
          AI Content Studio
        </h1>
        <p className="text-lg text-muted-foreground max-w-md">
          AI-powered social media content for small businesses.
          Generate photos, captions, and video ads in seconds.
        </p>
        <p className="text-xs text-muted-foreground/60 pt-4">
          Phase 0 scaffold — landing page ships in DEV-5.
        </p>
      </div>
    </main>
  );
}
