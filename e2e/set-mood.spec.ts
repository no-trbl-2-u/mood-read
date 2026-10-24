// "Set the mood" (07.6, spec 07 A7) on the web build, hermetic: an unscored chapter's row and a never-scored book's
// river offer "Set the mood"; the listener lights emotions in the sheet and applies them to the chapter or the whole
// book; the card says "Your mood" and names the piece the device already knows that matches it (else says the
// soundscape plays); no request goes to the scoring proxy; and the seed survives a reload.
import { expect, test, type Page } from "@playwright/test";

import { guard } from "./guard";
import { unscoredBook } from "./scored-book";

const PROXY = "https://mood-read-proxy.invalid";

/** Every request the page makes to the scoring proxy. */
function proxyRequests(page: Page): string[] {
  const seen: string[] = [];
  page.on("request", (req) => {
    if (req.url().startsWith(PROXY)) seen.push(`${req.method()} ${req.url()}`);
  });
  return seen;
}

async function pause(page: Page) {
  const play = page.getByTestId("mini-play-pause");
  if ((await play.getAttribute("aria-label")) === "Pause") await play.click();
  await expect(play).toHaveAttribute("aria-label", "Play");
}

test.describe("Set the mood (A7)", () => {
  let problems: string[] = [];
  test.beforeEach(async ({ page }) => {
    problems = await guard(page);
  });
  test.afterEach(() => {
    expect(problems).toEqual([]);
  });

  test("an unscored chapter's row: seeded for this chapter, a known piece matched, nothing sent, kept after a reload", async ({ page }) => {
    const sent = proxyRequests(page);
    await unscoredBook(page, { tooLittle: true });
    await page.getByTestId("chapter-1").click();
    const row = page.getByTestId("chapter-row-1");
    await expect(row.getByTestId("unscored-1")).toBeVisible();
    await row.getByTestId("set-mood").click();

    const sheet = page.getByTestId("set-mood-sheet");
    await expect(sheet).toBeVisible();
    await expect(sheet.getByTestId("seed-apply-chapter")).toHaveAttribute("aria-disabled", "true");
    // Sorrow: once low, twice high. Calm low. A third tap on Joy then clears it.
    await sheet.getByTestId("seed-sorrow").click();
    await sheet.getByTestId("seed-sorrow").click();
    await expect(sheet.getByTestId("seed-sorrow")).toHaveAttribute("aria-label", "Sorrow, high intensity");
    await sheet.getByTestId("seed-calm").click();
    await expect(sheet.getByTestId("seed-calm")).toHaveAttribute("aria-pressed", "true");
    for (let i = 0; i < 3; i++) await sheet.getByTestId("seed-joy").click();
    await expect(sheet.getByTestId("seed-joy")).toHaveAttribute("aria-pressed", "false");
    await expect(sheet.getByTestId("seed-count")).toHaveText("2 of 3 lit");
    await sheet.getByTestId("seed-apply-chapter").click();
    await expect(sheet).toHaveCount(0);

    const check = async () => {
      const card = page.getByTestId("chapter-row-1").getByTestId("mood-card");
      await expect(card.getByTestId("mood-yours")).toHaveText("Your mood");
      await expect(card.getByTestId("emotion-sorrow")).toContainText("Sorrow 80%");
      await expect(card.getByTestId("emotion-calm")).toContainText("Calm 40%");
      await expect(card.getByTestId("mood-piece")).toContainText("Theme 2");
      // A seed's piece takes no verdict: its emotions never leave the device.
      await expect(card.getByTestId("mood-verdict")).toHaveCount(0);
      await expect(page.getByTestId("unscored-1")).toHaveCount(0);
      // The third chapter is not reached and was not seeded: still locked.
      await expect(page.getByTestId("locked-2")).toBeVisible();
    };
    await check();
    await pause(page);
    await page.reload();
    await page.getByTestId("chapter-1").click();
    await check();
    await pause(page);
    expect(sent).toEqual([]);
  });

  test("a never-scored book's river: seeded for the whole book, no known piece so the soundscape plays, kept after a reload", async ({ page }) => {
    const sent = proxyRequests(page);
    await unscoredBook(page);
    await expect(page.getByTestId("score-book")).toBeVisible();
    await page.getByTestId("band-set-mood").click();
    const sheet = page.getByTestId("set-mood-sheet");
    await sheet.getByTestId("seed-romance").click();
    await sheet.getByTestId("seed-dread").click();
    await sheet.getByTestId("seed-dread").click();
    await sheet.getByTestId("seed-apply-book").click();
    await expect(sheet).toHaveCount(0);

    const check = async () => {
      const card = page.getByTestId("chapter-row-0").getByTestId("mood-card");
      await expect(card.getByTestId("mood-yours")).toHaveText("Your mood");
      await expect(card.getByTestId("emotion-dread")).toContainText("Dread 80%");
      await expect(card.getByTestId("mood-soundscape")).toContainText("plays its soundscape");
      await expect(card.getByTestId("mood-piece")).toHaveCount(0);
      // The listener's own words show at once, on chapters not reached yet too.
      await expect(page.getByTestId("row-emotions-2")).toContainText("Romance 40%");
      await expect(page.getByTestId("locked-2")).toHaveCount(0);
      // A seed is not a scoring run: the band still offers to score the book.
      await expect(page.getByTestId("score-book")).toBeVisible();
    };
    await check();
    await pause(page);
    await page.reload();
    await check();
    await pause(page);
    // 01.22 (A35): a seed is the listener's own mood, not a spoiler, so a row not yet reached opens its card in place.
    const row2 = page.getByTestId("chapter-row-2");
    const chips2 = row2.getByTestId("row-chips-2");
    await expect(chips2).toHaveAttribute("aria-label", /^Your mood for this chapter: Dread 80%, Romance 40%\. Mood card for Ch\.3/);
    await chips2.click();
    await expect(row2.getByTestId("chapter-peek").getByTestId("mood-yours")).toHaveText("Your mood");
    await expect(row2).not.toHaveAttribute("aria-current", "true");
    await row2.getByTestId("row-chips-2").click();
    await expect(row2.getByTestId("chapter-peek")).toHaveCount(0);
    expect(sent).toEqual([]);
  });
});
