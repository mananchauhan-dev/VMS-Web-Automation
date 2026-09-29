import { defineConfig } from "@playwright/test";

// API-only project — no browsers involved, just Playwright's APIRequestContext.
export default defineConfig({
  testDir: "./tests",
  timeout: 30_000,
  fullyParallel: true,
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 4 : undefined,
  reporter: [
    ["list"],
    ["html", { outputFolder: "reports/html-report", open: "never" }],
    ["allure-playwright", { resultsDir: "reports/allure-results" }],
  ],
  use: {
    extraHTTPHeaders: { Accept: "application/json" },
  },
});
