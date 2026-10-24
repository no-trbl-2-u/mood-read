// Downloads (spec 05, 05.6, A6) on the web build: reached from the library's overflow menu and from Settings'
// Storage row. Nothing can download yet (05.1-05.4's music catalog and 05.8's LibriVox browse are later chunks),
// so the queue is empty and the only states to see here are the storage meter's web fallback (the web build has
// no reliable way to size IndexedDB, spec 05 "the web build streams"), the Wi-Fi-only caption, the empty-queue
// message and the web build's one-book note.
import { expect, test } from "@playwright/test";

import { guard } from "./guard";

test.describe("downloads", () => {
  test("A6: the overflow menu opens Downloads: the storage meter, Wi-Fi-only, and an empty, honest queue", async ({ page }) => {
    const problems = await guard(page);
    await page.goto("/");
    await page.getByRole("button", { name: "More" }).click();
    await page.getByRole("menuitem", { name: "Downloads" }).click();
    await expect(page).toHaveURL(/\/downloads$/);
    await expect(page.getByRole("heading", { name: "Downloads" })).toBeVisible();

    await expect(page.getByTestId("storage-meter")).toContainText("Storage");
    await expect(page.getByTestId("storage-meter")).toContainText("Mood Read can't measure your books in a browser");
    await expect(page.getByText("Downloads on Wi-Fi only. Change it in Settings.")).toBeVisible();

    await expect(page.getByTestId("downloads-empty")).toContainText("All caught up.");
    await expect(page.getByTestId("downloads-empty")).toContainText("Nothing is downloading right now.");
    await expect(page.getByTestId("downloads-web-note")).toContainText("On the web, Mood Read keeps one book and its music offline.");
    await expect(page.getByTestId(/^download-/)).toHaveCount(0);

    await page.getByTestId("top-back").click();
    await expect(page).toHaveURL(/\/$/);
    await page.waitForLoadState("networkidle");
    expect(problems).toEqual([]);
  });

  test("A6: Settings' Storage row opens the same Downloads screen, and Wi-Fi-only off hides its caption", async ({ page }) => {
    const problems = await guard(page);
    await page.goto("/settings");
    await page.getByRole("switch", { name: "Downloads on Wi-Fi only" }).click();
    await page.getByRole("link", { name: "Storage" }).click();
    await expect(page).toHaveURL(/\/downloads$/);
    await expect(page.getByText("Downloads on Wi-Fi only. Change it in Settings.")).toHaveCount(0);
    await page.waitForLoadState("networkidle");
    expect(problems).toEqual([]);
  });
});
