import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/unit/**/*.test.ts"],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
      // "server-only" is a Next.js guard that prevents client-side imports.
      // Alias it to an empty stub so Vitest can import server-side modules in unit tests.
      "server-only": path.resolve(__dirname, "src/lib/__mocks__/server-only.ts"),
    },
  },
});
