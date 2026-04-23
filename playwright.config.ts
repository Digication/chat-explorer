import { defineConfig } from "@playwright/test";
import { join } from "node:path";

export default defineConfig({
  testDir: "./e2e",
  timeout: 60_000, // upload flow takes >30s when the CSV is large
  retries: 0,
  globalSetup: "./e2e/global-setup.ts",
  use: {
    // Inside Docker: use the Vite dev server directly.
    // From host: use https://chat-explorer.localhost (Caddy proxy).
    baseURL: process.env.E2E_BASE_URL || "https://chat-explorer.localhost",
    ignoreHTTPSErrors: true,
    headless: true,
    // NOTE: storageState is NOT set globally here — individual tests that
    // need an authenticated session opt in via test.use({ storageState }).
    // This preserves existing unauthenticated-redirect tests in other spec files.
  },
  projects: [
    {
      name: "chromium",
      use: { browserName: "chromium" },
    },
  ],
});
