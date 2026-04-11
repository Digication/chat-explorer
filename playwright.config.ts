import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  timeout: 30_000,
  retries: 0,
  use: {
    // Inside Docker: use the Vite dev server directly.
    // From host: use https://chat-explorer.localhost (Caddy proxy).
    baseURL: process.env.E2E_BASE_URL || "http://localhost:5173",
    ignoreHTTPSErrors: true,
    headless: true,
  },
  projects: [
    {
      name: "chromium",
      use: { browserName: "chromium" },
    },
  ],
});
