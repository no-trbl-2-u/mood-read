// The hermetic e2e: Chromium only, over the web build (dist/, from `pnpm build`) served on localhost:4173 by
// e2e/serve.mjs. No network beyond localhost: the specs abort and fail any other origin. `E2E_PORT` moves the
// server off 4173, so two worktrees' gates can run at once (plan/AUDIT.md, two gates collide on 4173).
import { defineConfig, devices } from "@playwright/test";

const PORT = Number(process.env.E2E_PORT) || 4173;
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
