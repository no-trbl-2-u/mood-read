// The smoke walk: every route in the contract (plan/bearings.md) loads from the web build, renders its screen's
// title, and logs no console error, throws no page error, fails no request and reaches no origin but localhost.
import { expect, test } from "@playwright/test";

import { guard } from "./guard";

// An empty library (a fresh browser holds no books), and a book id this device does not have: a clear
// not-found state with a way back, not a crash.
const ROUTES = [
  { path: "/", title: "Your shelf", also: "Import a book" },
  { path: "/import", title: "Import", also: "Choose files" },
  { path: "/book/sample-1", title: "Book not found", also: "Back to your shelf" },
  { path: "/settings", title: "Settings", also: "Downloads on Wi-Fi only" },
  { path: "/downloads", title: "Downloads", also: "All caught up." },
  { path: "/privacy", title: "Privacy policy", also: "What the scoring proxy gets" },
  { path: "/licenses", title: "Open-source licenses", also: "Lucide icons" },
  { path: "/credits", title: "Credits", also: "No music yet" },
  { path: "/soundtrack", title: "Your soundtrack", also: "The music that has played for the chapters you reached, by book. Nothing plays from here." },
];

for (const route of ROUTES) {
  test(`${route.path} renders "${route.title}" with no error`, async ({ page }) => {
    const problems = await guard(page);
    await page.goto(route.path);
    await expect(page.getByText(route.title, { exact: true }).first()).toBeVisible();
    await expect(page.getByText(route.also, { exact: true }).first()).toBeVisible();
    await page.waitForLoadState("networkidle");
    expect(problems).toEqual([]);
  });
}

// The web build serves the open-source notices as a plain file beside the app (06.1's rights check, 06.4).
test("/licenses.txt is served with the web build and carries the notices", async ({ request }) => {
  const res = await request.get("/licenses.txt");
  expect(res.status()).toBe(200);
  expect(res.headers()["content-type"]).toMatch(/^text\/plain/);
  const body = await res.text();
  expect(body).toContain("Lucide");
  expect(body).toContain("Cole Bemis");
  expect(body).toContain("Horcrux");
  expect(body).toContain("SIL OPEN FONT LICENSE Version 1.1");
});

// The web build ships a real robots.txt beside the app, so a crawler reads actual directives instead of the
// SPA shell every unmatched path otherwise falls back to (plan/CRITIQUE.md, the robots.txt/sitemap.xml finding).
test("/robots.txt is served with the web build and carries real directives", async ({ request }) => {
  const res = await request.get("/robots.txt");
  expect(res.status()).toBe(200);
  expect(res.headers()["content-type"]).toMatch(/^text\/plain/);
  const body = await res.text();
  expect(body).toContain("User-agent: *");
  expect(body).toContain("Allow: /");
});

// The privacy policy (A6) says what the scoring proxy receives, and the Import screen links to it (as Settings
// does, e2e/settings.spec.ts).
test("/privacy says what the proxy receives, and Import links to it", async ({ page }) => {
  const problems = await guard(page);
  await page.goto("/import");
  await page.getByTestId("privacy-link").click();
  await expect(page).toHaveURL(/\/privacy$/);
  await expect(page.getByText(/receives that book's title, author and chapter titles, nothing more/)).toBeVisible();
  await expect(page.getByText(/LibriVox catalog number and Project Gutenberg ebook number/)).toBeVisible();
  await expect(page.getByText(/reads the book's own public-domain text from Project Gutenberg .* keeps no copy of it/)).toBeVisible();
  await expect(page.getByText("Mood Read keeps no listener data.", { exact: false })).toBeVisible();
  await page.waitForLoadState("networkidle");
  expect(problems).toEqual([]);
});
