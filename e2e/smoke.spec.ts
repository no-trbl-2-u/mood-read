// The smoke walk: every route in the contract (plan/bearings.md) loads from the web build, renders its screen's
// title, and logs no console error, throws no page error, fails no request and reaches no origin but localhost.
import { expect, test, type Page } from "@playwright/test";

const ROUTES = [
  { path: "/", title: "Library" },
  { path: "/book/sample-1", title: "Player" },
];

const isLocal = (url: string) => {
  const { protocol, hostname } = new URL(url);
  if (protocol === "data:" || protocol === "blob:") return true;
  return hostname === "127.0.0.1" || hostname === "localhost";
};

// Collects every problem on the page; the walk asserts the list is empty.
async function guard(page: Page): Promise<string[]> {
  const problems: string[] = [];
  await page.context().route("**/*", (route) => {
    const url = route.request().url();
    if (isLocal(url)) return route.continue();
    problems.push(`blocked non-localhost request: ${url}`);
    return route.abort("blockedbyclient");
  });
  page.on("console", (msg) => {
    if (msg.type() === "error") problems.push(`console error: ${msg.text()}`);
  });
  page.on("pageerror", (err) => problems.push(`page error: ${err.message}`));
  page.on("requestfailed", (req) => {
    if (isLocal(req.url())) problems.push(`failed request: ${req.url()} (${req.failure()?.errorText})`);
  });
  page.on("response", (res) => {
    if (res.status() >= 400) problems.push(`HTTP ${res.status()}: ${res.url()}`);
  });
  return problems;
}

for (const route of ROUTES) {
  test(`${route.path} renders "${route.title}" with no error`, async ({ page }) => {
    const problems = await guard(page);
    await page.goto(route.path);
    await expect(page.getByText(route.title, { exact: true }).first()).toBeVisible();
    await page.waitForLoadState("networkidle");
    expect(problems).toEqual([]);
  });
}
