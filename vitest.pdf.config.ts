import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/browser/**/*.test.ts"],
    // This suite renders hundreds of PDFs; it is deliberately separate from fast unit tests.
    testTimeout: 180_000,
    hookTimeout: 30_000,
    fileParallelism: false,
  },
  resolve: { alias: { "@": fileURLToPath(new URL(".", import.meta.url)) } },
});
