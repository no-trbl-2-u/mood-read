// The hermetic e2e: Chromium only, over the web build (dist/, from `pnpm build`) served on localhost:4173 by
// e2e/serve.mjs. No network beyond localhost: the specs abort and fail any other origin.
import { defineConfig, devices } from "@playwright/test";

const PORT = 4173;
const BASE_URL = `http://127.0.0.1:${PORT}`;

export default defineConfig({
  testDir: "e2e",
  testMatch: "**/*.spec.ts",
  forbidOnly: !!process.env.CI,
  retries: 0,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: BASE_URL,
    trace: "retain-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: `node e2e/serve.mjs ${PORT}`,
    url: BASE_URL,
    reuseExistingServer: false,
    timeout: 30_000,
  },
});
