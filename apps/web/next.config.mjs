/** @type {import('next').NextConfig} */
const apiOrigin = process.env.NEXT_PUBLIC_API_URL ?? "https://api.nexsteps.dev";
const cspReportOnly = [
  "default-src 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "frame-ancestors 'self'",
  "script-src 'self' 'unsafe-inline' https://www.googletagmanager.com https://www.google-analytics.com",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https:",
  "font-src 'self' data:",
  `connect-src 'self' ${apiOrigin} https://www.google-analytics.com https://*.google-analytics.com https://www.googletagmanager.com`,
  "form-action 'self'",
  "upgrade-insecure-requests",
].join("; ");

const nextConfig = {
  reactStrictMode: true,
  output: process.env.NEXT_STANDALONE === "true" ? "standalone" : undefined,
  eslint: {
    ignoreDuringBuilds: true,
  },
  experimental: {
    outputFileTracingIncludes: {
      "/api/team-tracker/download": [
        "./content/resources/Nexsteps_One_Page_Team_Tracker.xlsx",
      ],
    },
  },
  async headers() {
    const previewIndexingHeaders =
      process.env.VERCEL_ENV && process.env.VERCEL_ENV !== "production"
        ? [{ key: "X-Robots-Tag", value: "noindex, nofollow" }]
        : [];

    return [
      {
        source: "/(.*)",
        headers: [
          {
            key: "Strict-Transport-Security",
            value: "max-age=31536000; includeSubDomains; preload",
          },
          {
            key: "X-Frame-Options",
            value: "SAMEORIGIN",
          },
          {
            key: "X-Content-Type-Options",
            value: "nosniff",
          },
          {
            key: "Referrer-Policy",
            value: "strict-origin-when-cross-origin",
          },
          {
            key: "Cross-Origin-Opener-Policy",
            value: "same-origin",
          },
          {
            key: "Content-Security-Policy-Report-Only",
            value: cspReportOnly,
          },
          ...previewIndexingHeaders,
        ],
      },
    ];
  },
  async redirects() {
    return [
      {
        source: "/:path*",
        has: [{ type: "host", value: "nexsteps.dev" }],
        destination: "https://www.nexsteps.dev/:path*",
        permanent: true,
      },
      { source: "/resources", destination: "/blog", permanent: true },
      {
        source: "/resources/:slug",
        destination: "/blog/:slug",
        permanent: true,
      },
      // permanent: false (307), unlike the /resources redirects above: this
      // is a new redirect under a monitored bake-in period, so avoid
      // aggressive browser/CDN caching until it's confirmed stable, then
      // flip to permanent: true.
      { source: "/pricing", destination: "/configure", permanent: false },
      { source: "/buy", destination: "/configure", permanent: false },
    ];
  },
};

export default nextConfig;
