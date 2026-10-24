// Settings (06.3, spec 06 A3) on the web build: reached from the library's overflow menu; Wi-Fi only (on by
// default), companion mode (off by default) and the default soundscape are saved on the device and survive a
// reload; Storage, Spotify and Credits read "Not available yet"; the privacy policy opens from it.
import { expect, test } from "@playwright/test";

import { guard } from "./guard";

test.describe("settings", () => {
  test("A3: the overflow menu opens Settings, and Wi-Fi only stays off after a reload", async ({ page }) => {
    const problems = await guard(page);
    await page.goto("/");
    const more = page.getByRole("button", { name: "More" });
    await expect(more).toHaveAttribute("aria-expanded", "false");
    await more.click();
    await expect(page.getByRole("menu")).toBeVisible();
    // Only entries whose route exists: Browse, Downloads and Credits join when spec 05 ships them.
    await expect(page.getByRole("menuitem")).toHaveText(["Settings"]);
    await page.getByRole("menuitem", { name: "Settings" }).click();
    await expect(page).toHaveURL(/\/settings$/);

    const wifi = page.getByRole("switch", { name: "Downloads on Wi-Fi only" });
    const companion = page.getByRole("switch", { name: "Companion mode" });
    await expect(wifi).toHaveAttribute("aria-checked", "true");
    await expect(companion).toHaveAttribute("aria-checked", "false");
    await expect(page.getByText(/It arrives in a later update; your choice is saved now\./)).toBeVisible();
    for (const id of ["setting-storage", "setting-spotify", "setting-credits"]) {
      await expect(page.getByTestId(id)).toContainText("Not available yet");
    }

    await wifi.click();
    await expect(wifi).toHaveAttribute("aria-checked", "false");
    await companion.click();
    await page.getByRole("button", { name: /^Default soundscape, Chapter by chapter/ }).click();
    await page.getByRole("button", { name: "Off", exact: true }).click();

    await page.reload();
    await expect(page.getByRole("switch", { name: "Downloads on Wi-Fi only" })).toHaveAttribute("aria-checked", "false");
    await expect(page.getByRole("switch", { name: "Companion mode" })).toHaveAttribute("aria-checked", "true");
    await expect(page.getByRole("button", { name: "Default soundscape, Off" })).toBeVisible();
    await page.waitForLoadState("networkidle");
    expect(problems).toEqual([]);
  });

  test("A3: Escape closes the menu, and Settings opens the privacy policy", async ({ page }) => {
    const problems = await guard(page);
    await page.goto("/");
    await page.getByRole("button", { name: "More" }).click();
    await expect(page.getByRole("menu")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("menu")).toHaveCount(0);

    await page.getByRole("button", { name: "More" }).click();
    await page.getByRole("menuitem", { name: "Settings" }).click();
    await page.getByRole("link", { name: "Privacy policy" }).click();
    await expect(page).toHaveURL(/\/privacy$/);
    await expect(page.getByText("Mood Read keeps no listener data.", { exact: false })).toBeVisible();
    await page.waitForLoadState("networkidle");
    expect(problems).toEqual([]);
  });
});
