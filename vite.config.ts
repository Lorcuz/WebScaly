import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { resolve } from "node:path";
import { readFileSync } from "node:fs";

const version = JSON.parse(readFileSync("package.json", "utf8")).version;

export default defineConfig({
  plugins: [
    {
      name: "wgsl-source",
      enforce: "pre",
      transform(code, id) {
        if (id.endsWith(".wgsl"))
          return { code: `export default ${JSON.stringify(code)}`, map: null };
      },
    },
    react(),
  ],
  base: "./",
  define: { __APP_VERSION__: JSON.stringify(version) },
  // Include dynamically loaded fixture libraries before the first player page.
  // Cold dependency discovery must not reload a page after its video starts.
  optimizeDeps: {
    include: ["video.js", "plyr", "hls.js", "dashjs", "@tabler/icons-react"],
  },
  build: {
    target: "chrome121",
    rollupOptions: {
      input: {
        popup: resolve("popup.html"),
        options: resolve("options.html"),
        controls: resolve("ui-frame.html"),
        lab: resolve("lab.html"),
        benchmark: resolve("benchmark.html"),
        viewer: resolve("viewer.html"),
      },
    },
  },
  test: { include: ["tests/unit/**/*.test.{ts,mjs}"], environment: "node" },
});
