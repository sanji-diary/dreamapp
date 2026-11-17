import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "src"),
      "server-only": path.resolve(import.meta.dirname, "test/server-only-stub.ts"),
    },
  },
  // Each test file starts its own in-memory database (about 1.5 GB), so only a few run at once;
  // the hook timeout leaves room for that start on a busy machine.
  test: { environment: "node", include: ["test/**/*.test.ts"], testTimeout: 30000, hookTimeout: 30000, pool: "forks", maxWorkers: 3 },
});
