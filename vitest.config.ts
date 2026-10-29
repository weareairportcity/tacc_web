import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";
import { TEST_ADMIN_SECRET, TEST_CAMP_SECRET, TEST_WORKER_URL } from "./tests/setup/constants";

// Unit tests plus database tests that run through the real path
// (src/lib/cf.ts → local Worker → local D1). tests/setup/worker.ts starts the
// Worker on a throwaway database before the run and stops it after.
export default defineConfig({
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  test: {
    include: ["tests/**/*.test.ts"],
    // The stress simulations have their own config (tests/sim/vitest.sim.config.ts).
    exclude: ["tests/sim/**", "node_modules/**"],
    globalSetup: ["tests/setup/worker.ts"],
    testTimeout: 30_000,
    hookTimeout: 120_000,
    env: {
      SW_API_SERVER_URL: TEST_WORKER_URL,
      SW_API_ADMIN_SECRET: TEST_ADMIN_SECRET,
      CAMP_SECRET: TEST_CAMP_SECRET,
      MNOTIFY_API_KEY: "",
      COMMUNE_SHARED_CACHE: "off",
    },
  },
});
