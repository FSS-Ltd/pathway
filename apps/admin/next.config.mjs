import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,

  // ponytail: images.unoptimized closes the Next 14 image-optimizer RCE path (GHSA-2464-fhr4-w9xw,
  // GHSA-2xp9-vwfh-vxw4) until the Next 15 upgrade lands. Remove it in that PR.
  images: { unoptimized: true },

  // Docker/self-host builds opt in to standalone; Vercel should use its native output.
  output: process.env.NEXT_STANDALONE === "true" ? "standalone" : undefined,

  eslint: {
    ignoreDuringBuilds: true,
  },

  // Monorepo support: ensures Next traces server files from the repo root.
  experimental: {
    outputFileTracingRoot: path.join(__dirname, "../../"),
  },

  // Allow Caddy proxy hostname so static chunks and assets load when accessing via https://app.localhost:3000
  allowedDevOrigins: ["app.localhost", "app.localhost:3000"],
};

export default nextConfig;
