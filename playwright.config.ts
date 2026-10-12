import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "tests/browser",
  timeout: 45000,
  workers: 1,
  fullyParallel: false,
  outputDir: "test-results/browser",
  globalSetup: "./tests/browser/global-setup.ts",
  reporter: [
    ["list"],
    ["json", { outputFile: "test-results/browser-tests.json" }],
  ],
  use: {
    baseURL: "http://127.0.0.1:5173",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    channel: "chromium",
  },
  webServer: [
    {
      command: "npm run dev",
      url: "http://127.0.0.1:5173/lab.html",
      reuseExistingServer: true,
      timeout: 30000,
    },
    {
      command: "node scripts/serve.mjs dist 5175",
      url: "http://127.0.0.1:5175/lab.html",
      reuseExistingServer: true,
      timeout: 30000,
    },
  ],
});
