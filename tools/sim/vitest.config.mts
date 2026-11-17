import path from "node:path";
import { defineConfig } from "vitest/config";

// The one-week walk-through (tools/sim/week.sim.ts). Run from the project root:
//   npx vitest run --config tools/sim/vitest.config.mts
const root = path.resolve(import.meta.dirname, "../..");

export default defineConfig({
  root,
  resolve: {
    alias: {
      "@": path.join(root, "src"),
      "server-only": path.join(root, "test/server-only-stub.ts"),
    },
  },
  test: { environment: "node", include: ["tools/sim/**/*.sim.ts"], testTimeout: 600000, hookTimeout: 600000, pool: "forks", maxWorkers: 1 },
});
