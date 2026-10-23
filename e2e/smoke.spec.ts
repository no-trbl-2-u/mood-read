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
