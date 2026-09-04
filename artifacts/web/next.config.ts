import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Allow Replit preview proxy origins in development
  allowedDevOrigins: ["*.replit.dev", "*.janeway.replit.dev", "*.repl.co"],

  // DEV-32: these two ship platform-specific *binaries*, not JS. Bundling them
  // rewrites the __dirname the packages use to locate their executable, so the
  // path they hand back points at nothing and UGC Assembly silently downgrades
  // to the video-combiner fallback on every render. Keep them external so they
  // are required from node_modules at runtime.
  serverExternalPackages: ["ffmpeg-static", "ffprobe-static"],
};

export default nextConfig;
