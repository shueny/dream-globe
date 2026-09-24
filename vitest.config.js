import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["src/**/*.test.{js,jsx}"],
    environment: "node",
    coverage: {
      provider: "v8",
      // Pure logic modules; the WebGL scene and React shell are covered by E2E.
      include: ["src/geo/**/*.js", "src/ui/searchIndex.js", "src/globe/latlng.js", "src/globe/geoLayers.js"],
      thresholds: { lines: 85, functions: 85, branches: 75, statements: 85 },
    },
  },
});
