import type { NextConfig } from "next"

const nextConfig: NextConfig = {
  /* config options here */
  transpilePackages: ["@trustmebro/shared"],
  cacheComponents: true,
  partialPrefetching: true,
  experimental: {
    // Dashboards render from live chain polling, so they can't be instant.
    instantInsights: { validationLevel: "manual-warning" },
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
}

export default nextConfig
