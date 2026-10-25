// Credits (spec 05, 05.5, A12) on the web build: reached from the library's overflow menu (last, under a rule) and
// from Settings' About. The catalog answers empty (e2e/guard.ts stubs its address), so Music says so; the
// six soundscapes open inline with their license; a LibriVox book from Browse (archive.org stubbed by
// e2e/librivox-fixtures.ts) is thanked with its reader, public domain; and the notices link to /licenses.
import { expect, test } from "@playwright/test";

import { guard } from "./guard";
import { IDENTIFIER, stubArchiveOrg } from "./librivox-fixtures";

const SOUNDSCAPES = ["Rain", "Hearth Fire", "Night Wind", "Tide", "Static Hush", "Low Café"];

test.describe("credits", () => {
  let problems: string[] = [];
  test.beforeEach(async ({ page }) => {
    problems = await guard(page);
  });
  test.afterEach(() => {
    expect(problems).toEqual([]);
  });

  test("A12: the overflow menu opens Credits: the empty catalog, the six soundscapes, no LibriVox books yet", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "More" }).click();
    await expect(page.getByRole("menuitem").last()).toHaveText("Credits");
    await page.getByRole("menuitem", { name: "Credits" }).click();
    await expect(page).toHaveURL(/\/credits$/);
    await expect(page.getByRole("heading", { name: "Credits" })).toBeVisible();

    await expect(page.getByTestId("credits-music-empty")).toContainText("No music yet");
    await expect(page.getByTestId("credits-readers-empty")).toContainText("No LibriVox books yet");

    const row = page.getByTestId("credits-soundscapes");
    await expect(row).toContainText(SOUNDSCAPES.join(", "));
    await expect(row).toHaveAttribute("aria-expanded", "false");
    await row.click();
    await expect(row).toHaveAttribute("aria-expanded", "true");
    for (const id of ["rain", "hearth-fire", "night-wind", "tide", "static-hush", "low-cafe"]) {
      await expect(page.getByTestId(`credit-soundscape-${id}`)).toContainText("Made for Mood Read");
    }

    await page.getByTestId("credit-notice-lucide").click();
    await expect(page.getByText(/Copyright \(c\) 2026 Lucide Icons and Contributors/).first()).toBeVisible();
    await page.getByRole("link", { name: "All notices" }).click();
    await expect(page).toHaveURL(/\/licenses$/);
    await page.waitForLoadState("networkidle");
  });

  test("A12: Settings' Credits row opens Credits, and back returns", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "More" }).click();
    await page.getByRole("menuitem", { name: "Settings" }).click();
    await page.getByRole("link", { name: "Credits" }).click();
    await expect(page).toHaveURL(/\/credits$/);
    await expect(page.getByText("Every piece, sound and voice in Mood Read", { exact: false })).toBeVisible();
    await page.getByRole("button", { name: "Back to your shelf" }).click();
    await expect(page).toHaveURL(/\/settings$/);
    await page.waitForLoadState("networkidle");
  });

  test("A12: a LibriVox book on the device is thanked with its reader, public domain", async ({ page }) => {
    await stubArchiveOrg(page);
    await page.goto(`/browse/${IDENTIFIER}`);
    await page.getByTestId("browse-book-download").click();
    await expect(page.getByTestId("browse-book-open")).toBeVisible({ timeout: 15_000 });

    await page.goto("/credits");
    await expect(page.getByTestId("credits-readers-empty")).toHaveCount(0);
    await expect(page.getByText("The Wind in the Willows", { exact: true })).toBeVisible();
    await expect(page.getByText("Read by Pat Reader for LibriVox · public domain", { exact: true })).toBeVisible();
    await page.waitForLoadState("networkidle");
  });
});
