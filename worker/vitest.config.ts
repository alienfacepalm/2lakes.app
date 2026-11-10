import { defineConfig } from "vitest/config";

/** Keep vitest inside `worker/` so it does not pick up the repo-root Vite app config. */
export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"],
  },
});
