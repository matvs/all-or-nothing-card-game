import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: [
      "src/**/__tests__/**/*.test.ts",
      "server/**/__tests__/**/*.test.ts",
      "shared/**/__tests__/**/*.test.ts",
    ],
    passWithNoTests: false,
    testTimeout: 15000,
    hookTimeout: 15000,
  },
});
