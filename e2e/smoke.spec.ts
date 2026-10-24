// The smoke walk: every route in the contract (plan/bearings.md) loads from the web build, renders its screen's
// title, and logs no console error, throws no page error, fails no request and reaches no origin but localhost.
import { expect, test } from "@playwright/test";

import { guard } from "./guard";

// An empty library (a fresh browser holds no books), and a book id this device does not have: a clear
// not-found state with a way back, not a crash.
const ROUTES = [
  { path: "/", title: "Library", also: "Import a book" },
  { path: "/import", title: "Import", also: "Choose files" },
  { path: "/book/sample-1", title: "Book not found", also: "Back to Library" },
  { path: "/privacy", title: "Privacy policy", also: "What the scoring proxy gets" },
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

// The privacy policy (A6) says what the scoring proxy receives, and the Import screen links to it until Settings
// (06.3) does.
test("/privacy says what the proxy receives, and Import links to it", async ({ page }) => {
  const problems = await guard(page);
  await page.goto("/import");
  await page.getByTestId("privacy-link").click();
  await expect(page).toHaveURL(/\/privacy$/);
  await expect(page.getByText(/receive a book's title, author and chapter titles, nothing more/)).toBeVisible();
  await expect(page.getByText("Mood Read keeps no listener data.", { exact: false })).toBeVisible();
  await page.waitForLoadState("networkidle");
  expect(problems).toEqual([]);
});
