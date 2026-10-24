// Your soundtrack (07.8, spec 07 A9) on the web build, hermetic: the scored book of e2e/scored-book.ts. Opened from the
// shelf's overflow menu, it lists every piece that has played for a reached chapter, grouped under its book with its
// title and artist: the playing chapter's named piece, then the alternate the listener picked for it; never a piece of
// a chapter not reached, nor an alternate that never played. It plays nothing, the device keeps only a book id and a
// piece id per line (no time, no position), and one row clears it, across a reload.
import { expect, test, type Page } from "@playwright/test";

import { guard } from "./guard";
import { scoredBook } from "./scored-book";

async function pause(page: Page) {
  const play = page.getByTestId("mini-play-pause");
  await expect(play).toHaveAttribute("aria-label", /Play|Pause/);
  if ((await play.getAttribute("aria-label")) === "Pause") await play.click();
  await expect(play).toHaveAttribute("aria-label", "Play");
}

async function openFromMenu(page: Page) {
  await page.getByRole("button", { name: "More" }).click();
  await page.getByRole("menuitem", { name: "Your soundtrack" }).click();
  await expect(page).toHaveURL(/\/soundtrack$/);
  await expect(page.getByText("Your soundtrack", { exact: true }).first()).toBeVisible();
}

const stored = (page: Page) => page.evaluate(() => JSON.parse(localStorage.getItem("soundtrack") ?? "null") as unknown);

test.describe("your soundtrack", () => {
  let problems: string[] = [];
  test.beforeEach(async ({ page }) => {
    problems = await guard(page);
  });
  test.afterEach(() => {
    expect(problems).toEqual([]);
  });

  test("A9: empty, it says so in one sentence and offers no Clear row", async ({ page }) => {
    await page.goto("/");
    await openFromMenu(page);
    await expect(page.getByTestId("soundtrack-empty")).toHaveText(
      "Nothing has played yet: each piece shows here, under its book, the first time its chapter plays.",
    );
    await expect(page.getByTestId("soundtrack-clear")).toHaveCount(0);
  });

  test("A9: the pieces that played for reached chapters show under their book with title and artist, play nothing, and clear in one row", async ({ page }) => {
    const id = await scoredBook(page);
    const title = await page.evaluate((id) => (JSON.parse(localStorage.getItem("books")!) as { id: string; title: string }[]).find((b) => b.id === id)!.title, id);
    // Chapter 1 plays Theme 1; the listener picks Theme 3 for it, which plays from then on. Theme 2 never plays, and
    // chapters 2 and 3 are never reached.
    const card = page.getByTestId("chapter-row-0").getByTestId("mood-card");
    await card.getByTestId("pick-composer-3--theme-3").click();
    await expect(card.getByTestId("pick-composer-3--theme-3")).toHaveAttribute("aria-pressed", "true");
    await pause(page);
    await page.getByTestId("top-back").click();
    await expect(page).toHaveURL(/\/$/);

    await openFromMenu(page);
    const group = page.getByTestId(`soundtrack-book-${id}`);
    await expect(group.getByRole("heading")).toHaveText(title);
    const pieces = group.locator("[data-testid^='soundtrack-piece-']");
    await expect(pieces).toHaveCount(2);
    await expect(pieces.nth(0)).toHaveAttribute("data-testid", `soundtrack-piece-${id}-composer-1--theme-1`);
    await expect(pieces.nth(0)).toContainText("Theme 1");
    await expect(pieces.nth(0)).toContainText("Composer 1");
    await expect(pieces.nth(1)).toContainText("Theme 3");
    await expect(pieces.nth(1)).toContainText("Composer 3");
    await expect(page.getByText("Theme 2")).toHaveCount(0);
    // It plays nothing: no control on any piece, and no audio starts on this screen.
    await expect(group.locator("[role=button], [role=link]")).toHaveCount(0);
    expect(await page.evaluate(() => [...document.querySelectorAll("audio")].some((a) => !a.paused))).toBe(false);
    // The device keeps a book id and a piece id per line, nothing more.
    expect(await stored(page)).toEqual([
      { bookId: id, pieceId: "composer-1--theme-1" },
      { bookId: id, pieceId: "composer-3--theme-3" },
    ]);

    // A reload keeps it; one row clears it, and it stays cleared.
    await page.reload();
    await expect(pieces).toHaveCount(2);
    const clear = page.getByTestId("soundtrack-clear");
    await expect(clear).toHaveAttribute("role", "button");
    await expect(clear).toHaveAttribute("aria-label", "Clear your soundtrack");
    await clear.click();
    await expect(page.getByTestId("soundtrack-empty")).toBeVisible();
    await expect(page.getByTestId(`soundtrack-book-${id}`)).toHaveCount(0);
    expect(await stored(page)).toBeNull();
    await page.reload();
    await expect(page.getByTestId("soundtrack-empty")).toBeVisible();
  });
});
