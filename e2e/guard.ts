// The hermetic guard every e2e page runs under: no console error, no page error, no failed request, and no origin
// but localhost (blob: and data: URLs are the page's own). A spec asserts the collected list is empty.
import type { Page } from "@playwright/test";

const isLocal = (url: string) => {
  const { protocol, hostname } = new URL(url);
  if (protocol === "data:" || protocol === "blob:") return true;
  return hostname === "127.0.0.1" || hostname === "localhost";
};

// Collects every problem on the page; the walk asserts the list is empty.
export async function guard(page: Page): Promise<string[]> {
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
    const error = req.failure()?.errorText;
    // A media element cancels its own load of an on-device blob once it has what it asked for (the duration
    // probe stops after metadata, a replaced file stops loading): not a failure.
    const mediaStop = req.resourceType() === "media" && req.url().startsWith("blob:") && error === "net::ERR_ABORTED";
    if (isLocal(req.url()) && !mediaStop) problems.push(`failed request: ${req.url()} (${error})`);
  });
  page.on("response", (res) => {
    if (res.status() >= 400) problems.push(`HTTP ${res.status()}: ${res.url()}`);
  });
  return problems;
}
