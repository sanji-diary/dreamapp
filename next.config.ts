import type { NextConfig } from "next";

// Every page depends on who is signed in, so the app renders on request (no cache components).
const nextConfig: NextConfig = {
  serverExternalPackages: ["@electric-sql/pglite", "pg"],
  // SQL files are read at runtime, so they must be bundled with the server.
  outputFileTracingIncludes: { "/**": ["./migrations/**"] },
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
