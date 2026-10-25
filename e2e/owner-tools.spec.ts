// Owner tools (05.21, spec 05 A23) on the web build. The gate's build (`pnpm build`, the deployed one) has them off:
// Settings has no "Owner tools" section and no "Copy books for pre-scoring". `pnpm e2e:owner` (scripts/e2e-owner.mjs)
// builds again with them on, as the preview APK has them, and runs the other test: the row copies, per library book,
// exactly what the proxy's parseBookRequest accepts.
import { expect, test } from "@playwright/test";

import { parseBookRequest } from "../proxy/src/validate";
import { guard } from "./guard";
import { scoredBook } from "./scored-book";

const OWNER_BUILD = process.env.E2E_OWNER_TOOLS === "1";

test.describe("owner tools", () => {
  test("A23: a production build has no owner tools in Settings", async ({ page }) => {
    test.skip(OWNER_BUILD, "the owner-tools build shows them");
    const problems = await guard(page);
    await page.goto("/settings");
    await expect(page.getByRole("heading", { name: "About" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Owner tools" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Copy books for pre-scoring" })).toHaveCount(0);
    await page.waitForLoadState("networkidle");
    expect(problems).toEqual([]);
  });

  test.describe("with owner tools on", () => {
    test.use({ permissions: ["clipboard-read", "clipboard-write"] });

    test("A23: Copy books for pre-scoring copies each library book's scoring request, nothing more", async ({ page }) => {
      test.skip(!OWNER_BUILD, "only the owner-tools build (pnpm e2e:owner) shows them");
      const problems = await guard(page);
      await scoredBook(page);
      await page.goto("/settings");
      await expect(page.getByRole("heading", { name: "Owner tools" })).toBeVisible();
      await page.getByRole("button", { name: "Copy books for pre-scoring" }).click();
      await expect(page.getByTestId("setting-prescore-copy")).toContainText("Copied 1 book.");

      const copied = JSON.parse(await page.evaluate(() => navigator.clipboard.readText())) as Record<string, unknown>[];
      expect(copied).toHaveLength(1);
      for (const entry of copied) expect(parseBookRequest(entry)).toEqual({ ok: true, book: entry });
      expect(Object.keys(copied[0]).sort()).toEqual(["author", "chapters", "title"]);
      expect(copied[0].chapters).toHaveLength(3);
      await page.waitForLoadState("networkidle");
      expect(problems).toEqual([]);
    });
  });
});
