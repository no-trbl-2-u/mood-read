// Settings (06.3, spec 06 A3) on the web build: reached from the library's overflow menu; Wi-Fi only (on by
// default), companion mode (off by default) and the default soundscape are saved on the device and survive a
// reload; Storage links to Downloads (05.6); Spotify and Credits read "Not available yet"; the privacy policy
// opens from it.
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
    // Only entries whose route exists: Credits joins when 05.5 ships it.
    await expect(page.getByRole("menuitem")).toHaveText(["Browse free books", "Downloads", "Settings"]);
    await page.getByRole("menuitem", { name: "Settings" }).click();
    await expect(page).toHaveURL(/\/settings$/);

    const wifi = page.getByRole("switch", { name: "Downloads on Wi-Fi only" });
    const companion = page.getByRole("switch", { name: "Companion mode" });
    await expect(wifi).toHaveAttribute("aria-checked", "true");
    await expect(companion).toHaveAttribute("aria-checked", "false");
    await expect(page.getByText(/no narration, beside another app such as Audible/)).toBeVisible();
    await expect(page.getByText(/later update/)).toHaveCount(0);
    for (const id of ["setting-spotify", "setting-credits"]) {
      await expect(page.getByTestId(id)).toContainText("Not available yet");
    }
    await expect(page.getByRole("link", { name: "Storage" })).toBeVisible();

    await wifi.click();
    await expect(wifi).toHaveAttribute("aria-checked", "false");
    await companion.click();
    await page.getByRole("button", { name: "Default soundscape Night Wind" }).click();
    await page.getByRole("button", { name: "Default soundscape: Off" }).click();

    await page.reload();
    await expect(page.getByRole("switch", { name: "Downloads on Wi-Fi only" })).toHaveAttribute("aria-checked", "false");
    await expect(page.getByRole("switch", { name: "Companion mode" })).toHaveAttribute("aria-checked", "true");
    await expect(page.getByRole("button", { name: "Default soundscape Off" })).toBeVisible();
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

  // 06.1's rights check: the Lucide (ISC, Feather MIT), react-native-svg (MIT) and Bricolage Grotesque (OFL)
  // notices, word for word, on a screen reached from Settings (src/lib/licenses.test.ts holds the words).
  test("06.4: Settings opens the open-source licenses, each notice in full", async ({ page }) => {
    const problems = await guard(page);
    await page.goto("/settings");
    await page.getByRole("link", { name: "Open-source licenses" }).click();
    await expect(page).toHaveURL(/\/licenses$/);
    await expect(page.getByRole("heading", { name: "Open-source licenses" })).toBeVisible();
    await expect(page.getByTestId("license-lucide")).toContainText("Copyright (c) 2026 Lucide Icons and Contributors");
    await expect(page.getByTestId("license-lucide")).toContainText("Copyright (c) 2013-present Cole Bemis");
    await expect(page.getByTestId("license-react-native-svg")).toContainText("[Horcrux]");
    await expect(page.getByTestId("license-bricolage-grotesque")).toContainText("SIL OPEN FONT LICENSE Version 1.1");
    await page.getByRole("button", { name: "Back to Settings" }).click();
    await expect(page).toHaveURL(/\/settings$/);
    await page.waitForLoadState("networkidle");
    expect(problems).toEqual([]);
  });
});
