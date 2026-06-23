import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    coverage: {
      provider: "v8",
      include: ["src/**/*.{ts,tsx}"],
      // Exclude test files, type-only modules, and the process/IO entrypoints
      // and render-only components that aren't unit-tested here.
      exclude: [
        "src/**/*.test.{ts,tsx}",
        "src/types.ts",
        "src/cli.tsx",
        "src/data/watch.ts",
      ],
    },
  },
});
