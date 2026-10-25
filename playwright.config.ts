// The hermetic e2e: Chromium only, over the web build (dist/, from `pnpm build`) served on localhost by
// e2e/serve.mjs. No network beyond localhost: the specs abort and fail any other origin. `E2E_PORT` pins an
// exact port; left unset, the port is picked automatically (scripts/e2e-port.mjs) so two worktrees' gates
// never collide on the same port (plan/AUDIT.md, [5.4]).
import { defineConfig, devices } from "@playwright/test";
import { pickPort, seedPort } from "./scripts/e2e-port.mjs";

// This config is evaluated more than once per run (the root process, then again per worker). Only the first
// evaluation should probe for a free port; every later one must land on the exact same port the first one
// chose and the webServer is actually bound to, not re-probe and find it busy. Pinning the choice into
// `process.env.E2E_PORT`, inherited by worker processes, makes every evaluation after the first take this
// branch instead of calling pickPort again.
const PORT = Number(process.env.E2E_PORT) || (await pickPort(seedPort(process.cwd())));
process.env.E2E_PORT = String(PORT);
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
