// The library backup (spec 05, 05.17, A19) on the web build, hermetic: Settings' "Export library" downloads one .json
// file with the book's place, bookmark, moods, pick and mix and no audio (no file, ref or cover in it); with that data
// cleared from the device, "Import library" reads the file back through a file input and restores it onto the
// matching book, which shows its bookmark again without a reload. A file that is not a Mood Read library is refused
// and changes nothing.
import fs from "node:fs/promises";

import { expect, test, type Page } from "@playwright/test";

import { guard } from "./guard";
import { scoredBook } from "./scored-book";

const KINDS = ["pos", "bookmarks", "mix", "scores"];

/** The listener's own data for the book, as the app stores it. */
const bookData = (page: Page, id: string) =>
  page.evaluate(
    ({ id, kinds }) => Object.fromEntries(kinds.map((k) => [k, localStorage.getItem(`${k}:${id}`)])),
    { id, kinds: KINDS },
  );

async function openSettings(page: Page) {
  await page.goto("/");
  await page.getByRole("button", { name: "More" }).click();
  await page.getByRole("menuitem", { name: "Settings" }).click();
  await expect(page).toHaveURL(/\/settings$/);
}

async function importFile(page: Page, name: string, buffer: Buffer) {
  const chooser = page.waitForEvent("filechooser");
  await page.getByTestId("setting-import-library").click();
  await (await chooser).setFiles({ name, mimeType: "application/json", buffer });
}

test.describe("library backup", () => {
  let problems: string[] = [];
  test.beforeEach(async ({ page }) => {
    problems = await guard(page);
  });
  test.afterEach(() => {
    expect(problems).toEqual([]);
  });

  test("A19: Export library writes one file with no audio, and Import library restores the book's place, bookmark, moods, pick and mix", async ({ page }) => {
    const id = await scoredBook(page);
    await page.goto("/");
    await page.evaluate((id) => {
      localStorage.setItem(`pos:${id}`, "5.5");
      localStorage.setItem(`bookmarks:${id}`, JSON.stringify([{ id: "m1", bookId: id, position: 5.5, name: "The storm", createdAt: 1 }]));
      localStorage.setItem(`mix:${id}`, JSON.stringify({ balance: 0.3, master: 0.8, duck: true }));
      const scores = JSON.parse(localStorage.getItem(`scores:${id}`)!);
      scores.chapters[0].playlist.pick = scores.chapters[0].playlist.alternates[0];
      localStorage.setItem(`scores:${id}`, JSON.stringify(scores));
    }, id);
    const kept = await bookData(page, id);

    await openSettings(page);
    await expect(page.getByTestId("setting-export-library")).toContainText("Never the audio.");
    const download = page.waitForEvent("download");
    await page.getByTestId("setting-export-library").click();
    const file = await download;
    expect(file.suggestedFilename()).toMatch(/^mood-read-library-\d{4}-\d{2}-\d{2}\.json$/);
    await expect(page.getByTestId("setting-export-library")).toContainText("Exported 1 book. No audio in it.");
    const text = await fs.readFile((await file.path())!, "utf8");
    const backup = JSON.parse(text);
    expect(backup).toMatchObject({ app: "mood-read", kind: "library", version: 1 });
    expect(backup.books).toHaveLength(1);
    expect(backup.books[0]).toMatchObject({ position: 5.5, mix: { balance: 0.3, duck: true }, bookmarks: [{ name: "The storm", position: 5.5 }] });
    expect(backup.books[0].scores.chapters[0].playlist.pick).toBe(backup.books[0].scores.chapters[0].playlist.alternates[0]);
    // No audio, and nothing that points at the listener's files or this device's book.
    for (const banned of ["idb:", ".wav", "blob:", '"cover"', '"ref"', id]) expect(text).not.toContain(banned);

    // The device forgets what the listener made of the book; the book and its audio stay.
    await page.evaluate(({ id, kinds }) => kinds.forEach((k) => localStorage.removeItem(`${k}:${id}`)), { id, kinds: KINDS });
    await page.reload();
    expect(Object.values(await bookData(page, id))).toEqual([null, null, null, null]);

    await importFile(page, file.suggestedFilename(), Buffer.from(text));
    await expect(page.getByTestId("setting-import-library")).toContainText("Restored 1 book.");
    expect(await bookData(page, id)).toEqual(Object.fromEntries(KINDS.map((k) => [k, expect.any(String)])));
    const restored = await bookData(page, id);
    expect(JSON.parse(restored.pos!)).toBe(5.5);
    expect(JSON.parse(restored.mix!)).toEqual(JSON.parse(kept.mix!));
    expect(JSON.parse(restored.scores!)).toEqual(JSON.parse(kept.scores!));
    expect(JSON.parse(restored.bookmarks!)).toEqual([{ id: "m1", bookId: id, position: 5.5, name: "The storm", createdAt: 1 }]);

    // The book shows its bookmark again, with no reload: the stores read the restored data.
    await page.getByRole("button", { name: "Back to your shelf" }).click();
    await page.getByTestId(`book-${id}`).click();
    await page.getByTestId("open-bookmarks").click();
    await expect(page.getByText("The storm")).toBeVisible();
  });

  test("A19: a file that is not a Mood Read library is refused and nothing changes", async ({ page }) => {
    await openSettings(page);
    const before = await page.evaluate(() => JSON.stringify({ ...localStorage }));
    await importFile(page, "notes.json", Buffer.from('{"hello": "world"}'));
    await expect(page.getByTestId("setting-import-library")).toContainText("That isn't a Mood Read library file. Nothing changed.");
    await importFile(page, "newer.json", Buffer.from(JSON.stringify({ app: "mood-read", kind: "library", version: 99, books: [] })));
    await expect(page.getByTestId("setting-import-library")).toContainText("That file is from a newer Mood Read.");
    expect(await page.evaluate(() => JSON.stringify({ ...localStorage }))).toBe(before);
  });
});
