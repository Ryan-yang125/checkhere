import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const root = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      "@checkhere/shared": path.join(root, "packages/shared/src/index.ts"),
      "@checkhere/scanner": path.join(root, "packages/scanner/src/index.ts"),
      "@checkhere/reporter": path.join(root, "packages/reporter/src/index.ts")
    }
  },
  test: {
    include: ["packages/**/*.test.ts", "apps/**/*.test.ts"],
    testTimeout: 45_000,
    hookTimeout: 45_000
  }
});
