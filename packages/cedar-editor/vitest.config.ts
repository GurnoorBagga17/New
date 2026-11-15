import { fileURLToPath } from "node:url";
import path from "node:path";
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

const root = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(root, "../..");

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: [
      {
        find: "@axiom/cedar-editor/studio",
        replacement: path.resolve(root, "src/studio.ts"),
      },
      {
        find: "@axiom/cedar-editor/styles.css",
        replacement: path.resolve(root, "src/styles.css"),
      },
      {
        find: "@axiom/cedar-editor",
        replacement: path.resolve(root, "src/index.ts"),
      },
    ],
  },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: [path.resolve(root, "src/test/setup.ts")],
    include: [
      "src/**/*.test.{ts,tsx}",
      path.resolve(
        repoRoot,
        "apps/gateway-ui/src/modules/policy-studio/**/*.test.{ts,tsx}",
      ),
    ],
    css: false,
    restoreMocks: true,
  },
});
