import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

/**
 * Library tests run in Node. Page tests opt into a browser-like DOM with a
 * `// @vitest-environment jsdom` comment at the top of the file.
 */
export default defineConfig({
  resolve: {
    // The same "@/…" import alias as tsconfig.json, so pages resolve in tests.
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  test: {
    environment: "node",
  },
});
