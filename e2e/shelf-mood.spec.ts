// Fingerprints on the shelf and the Mood filter (07.7, spec 07 A8) on the web build, hermetic: the scored book of
// e2e/scored-book.ts, and a second book imported beside it whose scores are seeded the same way (`scores:<book id>`).
// A book's fingerprint is its three strongest emotions over the chapters reached so far, so an unreached chapter's
// mood never reaches the shelf (A21); a book whose only reached chapter has too little written about it shows none;
// the top bar's Mood filter lights one emotion and keeps only the books whose fingerprint holds it, strongest first.
import { expect, test, type Page } from "@playwright/test";

import { toneAndSilence, wavFile } from "../src/lib/meta/test-fixtures";

import { guard } from "./guard";
import { scoredBook } from "./scored-book";

async function pause(page: Page) {
  const play = page.getByTestId("mini-play-pause");
  await expect(play).toHaveAttribute("aria-label", /Play|Pause/);
  if ((await play.getAttribute("aria-label")) === "Pause") await play.click();
  await expect(play).toHaveAttribute("aria-label", "Play");
}

async function toShelf(page: Page) {
  await page.getByTestId("top-back").click();
  await expect(page).toHaveURL(/\/$/);
}

/** Opens a book from the shelf, taps a chapter (which reaches it), pauses and goes back to the shelf. */
async function reach(page: Page, id: string, chapter: number) {
  await page.getByTestId(`book-${id}`).click();
  await page.getByTestId(`chapter-${chapter}`).click();
  await expect(page.getByTestId(`chapter-row-${chapter}`).getByTestId("chapter-expanded")).toBeVisible();
  await pause(page);
  await toShelf(page);
}

/**
 * A second book, "Quiet Book", two chapters, imported from the shelf: its first chapter has too little written about
 * it, its second is scored Sorrow 50%, Calm 40%. Lands back on the shelf; returns its id.
 */
async function quietBook(page: Page): Promise<string> {
  const tone = (title: string) => Buffer.from(wavFile(toneAndSilence([[4, true]]), 8000, { INAM: title, IART: "B. Reader" }));
  await page.getByTestId("import").click();
  const chooser = page.waitForEvent("filechooser");
  await page.getByTestId("import-files").click();
  await (await chooser).setFiles([
    { name: "Quiet Book - 01.wav", mimeType: "audio/wav", buffer: tone("Quiet Book") },
    { name: "Quiet Book - 02.wav", mimeType: "audio/wav", buffer: tone("Quiet Book") },
  ]);
  await expect(page).toHaveURL(/\/book\/[a-z0-9]+$/);
  const id = new URL(page.url()).pathname.split("/").pop()!;
  await page.evaluate((id) => {
    const books = JSON.parse(localStorage.getItem("books")!) as { id: string; chapters: { index: number; title: string }[] }[];
    const book = books.find((b) => b.id === id)!;
    const moods = [[], [{ emotion: "sorrow", intensity: 0.5 }, { emotion: "calm", intensity: 0.4 }]];
    const chapters = book.chapters.map((c) => ({
      mood: {
        chapterIndex: c.index,
        chapterTitle: c.title,
        emotions: moods[c.index],
        sources: [],
        coverage: c.index === 0 ? "too-little" : "scored",
        model: "gpt-5-mini",
        version: "01.2.1",
        scoredAt: 1,
      },
      pieces: [],
      playlist: null,
    }));
    localStorage.setItem(`scores:${id}`, JSON.stringify({ jobId: "e".repeat(64), model: "gpt-5-mini", version: "01.2.1", scoredAt: 1, costUsd: 0.02, chapters }));
  }, id);
  await page.reload();
  await pause(page);
  await page.getByTestId("top-back").click();
  await expect(page).toHaveURL(/\/$/);
  return id;
}

const stickers = (page: Page, id: string) => page.getByTestId(`fingerprint-${id}`).locator("[data-testid^='fingerprint-']");
const rows = (page: Page) => page.locator("[role=link][data-testid^='book-']");

test.describe("fingerprints on the shelf and the Mood filter", () => {
  let problems: string[] = [];
  test.beforeEach(async ({ page }) => {
    problems = await guard(page);
  });
  test.afterEach(() => {
    expect(problems).toEqual([]);
  });

  test("A8: a reached book shows its fingerprint, unreached chapters never count, and the Mood filter keeps and drops books", async ({ page }) => {
    const moodId = await scoredBook(page);
    await pause(page);
    await toShelf(page);

    // Only chapter 1 is reached: its three emotions, and nothing of chapters 2 and 3 (A21).
    await expect(stickers(page, moodId)).toHaveText(["Tension", "Wonder", "Dread"]);
    await expect(page.getByTestId(`fingerprint-${moodId}`)).toHaveAttribute("aria-label", "Mood so far: Tension, Wonder, Dread");
    for (const name of ["Sorrow", "Calm", "Triumph", "Joy", "Romance"]) await expect(page.getByText(name, { exact: true })).toHaveCount(0);
    await expect(page.getByTestId(`book-${moodId}`)).not.toContainText("%");

    // A book whose one reached chapter had too little written about it shows none; its unreached scored one never counts.
    const quietId = await quietBook(page);
    await expect(page.getByTestId(`book-${quietId}`)).toBeVisible();
    await expect(page.getByTestId(`fingerprint-${quietId}`)).toHaveCount(0);

    // The filter offers what the shelf's fingerprints hold, and nothing they do not.
    const filter = page.getByTestId("mood-filter");
    await expect(filter.locator("[role=button]")).toHaveText(["Tension", "Wonder", "Dread"]);
    const tension = page.getByTestId("mood-filter-tension");
    await expect(tension).toHaveAttribute("aria-label", "Mood: Tension");
    await expect(tension).toHaveAttribute("aria-pressed", "false");
    await tension.click();
    await expect(tension).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByTestId(`book-${moodId}`)).toBeVisible();
    await expect(page.getByTestId(`book-${quietId}`)).toHaveCount(0);
    // A tap on the lit one clears it: the whole shelf again.
    await tension.click();
    await expect(tension).toHaveAttribute("aria-pressed", "false");
    await expect(rows(page)).toHaveCount(2);

    // Reaching chapter 2 of each book brings their sorrow in: strongest match first, whatever the shelf's order.
    await reach(page, moodId, 1);
    await expect(stickers(page, moodId)).toHaveText(["Sorrow", "Tension", "Wonder"]);
    await reach(page, quietId, 1);
    await expect(stickers(page, quietId)).toHaveText(["Sorrow", "Calm"]);
    await expect(rows(page).first()).toHaveAttribute("data-testid", `book-${quietId}`);
    await page.getByTestId("mood-filter-sorrow").click();
    await expect(rows(page)).toHaveCount(2);
    await expect(rows(page).first()).toHaveAttribute("data-testid", `book-${moodId}`);
    await expect(rows(page).nth(1)).toHaveAttribute("data-testid", `book-${quietId}`);
    // One emotion lit at a time: lighting Calm unlights Sorrow, and keeps only the book that holds it.
    await page.getByTestId("mood-filter-calm").click();
    await expect(page.getByTestId("mood-filter-sorrow")).toHaveAttribute("aria-pressed", "false");
    await expect(rows(page)).toHaveCount(1);
    await expect(rows(page).first()).toHaveAttribute("data-testid", `book-${quietId}`);
  });
});
