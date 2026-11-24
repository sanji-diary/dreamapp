import type { NextConfig } from "next";

// Every page depends on who is signed in, so the app renders on request (no cache components).
const nextConfig: NextConfig = {
  serverExternalPackages: ["@electric-sql/pglite", "pg"],
  // Photos are shrunk in the browser first; this leaves room for the upload.
  experimental: { serverActions: { bodySizeLimit: "2mb" } },
  // Read at runtime, so they must be bundled with the server: the SQL files, and the page of the
  // mission game this app serves itself (src/app/minigames/egg-hole-in-one).
  outputFileTracingIncludes: { "/**": ["./migrations/**", "./games/egg-hole-in-one/public/**"] },
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
