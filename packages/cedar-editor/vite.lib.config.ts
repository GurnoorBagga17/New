import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

const root = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  build: {
    lib: {
      entry: {
        index: path.resolve(root, "src/index.ts"),
        studio: path.resolve(root, "src/studio.ts"),
      },
      formats: ["es"],
      fileName: (_format, entryName) => `${entryName}.js`,
      cssFileName: "cedar-editor",
    },
    rolldownOptions: {
      external: /^(react|react-dom|motion)(\/.*)?$/,
    },
    sourcemap: false,
  },
});
