import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Allow Replit preview proxy origins in development
  allowedDevOrigins: ["*.replit.dev", "*.janeway.replit.dev", "*.repl.co"],
};

export default nextConfig;
