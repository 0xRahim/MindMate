import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  cacheComponents: true,
  partialPrefetching: true,
  // Bundle the public/ 3D assets into serverless function traces so the
  // fs-based /api/* and /models|/animations routes keep working on Vercel,
  // where neither ASSETS_DIR nor ../main exists.
  outputFileTracingIncludes: {
    "/*": ["./public/models/**/*", "./public/animations/**/*"],
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
