// The chapter mood card (01.4, spec 01 A16, A21) on the web build, hermetic: a book is imported from three local WAV
// files (one chapter each) and its scores are seeded on the device the way a finished scoring run stores them
// (src/lib/scoring-store.ts, `scores:<book id>`), so no proxy is involved. A chapter not yet reached shows no
// emotions and does not expand; the playing chapter shows its emotions, named piece and alternates; a picked
// alternate is saved across a reload, and Auto returns to auto.
import { expect, test, type Page } from "@playwright/test";

import { guard } from "./guard";

function wav(seconds: number, rate = 8000): Buffer {
  const samples = Math.round(seconds * rate);
  const data = Buffer.alloc(samples * 2);
  for (let i = 0; i < samples; i++) data.writeInt16LE(Math.round(Math.sin((2 * Math.PI * 220 * i) / rate) * 800), i * 2);
  const h = Buffer.alloc(44);
  h.write("RIFF", 0);
  h.writeUInt32LE(36 + data.length, 4);
  h.write("WAVE", 8);
  h.write("fmt ", 12);
  h.writeUInt32LE(16, 16);
  h.writeUInt16LE(1, 20);
  h.writeUInt16LE(1, 22);
  h.writeUInt32LE(rate, 24);
  h.writeUInt32LE(rate * 2, 28);
  h.writeUInt16LE(2, 32);
  h.writeUInt16LE(16, 34);
  h.write("data", 36);
  h.writeUInt32LE(data.length, 40);
  return Buffer.concat([h, data]);
}

const SOURCE = "https://summaries.example/mood-book";
const piece = (n: number) => ({ id: `composer-${n}--theme-${n}`, title: `Theme ${n}`, artist: `Composer ${n}`, kind: "score", vocals: "none", moodTags: ["tension"] });
const EMOTIONS = [
  [
    { emotion: "tension", intensity: 0.8 },
    { emotion: "wonder", intensity: 0.7 },
    { emotion: "dread", intensity: 0.3 },
  ],
  [
    { emotion: "sorrow", intensity: 0.9 },
    { emotion: "calm", intensity: 0.4 },
  ],
  [
    { emotion: "triumph", intensity: 0.95 },
    { emotion: "joy", intensity: 0.6 },
    { emotion: "romance", intensity: 0.2 },
  ],
];

/** Imports the three-chapter book, seeds every chapter's score on the device, reloads; returns the book id. */
async function scoredBook(page: Page): Promise<string> {
  await page.goto("/");
  await page.getByTestId("import-book").click();
  const chooser = page.waitForEvent("filechooser");
  await page.getByTestId("import-files").click();
  await (await chooser).setFiles([
    { name: "Mood Book - 01.wav", mimeType: "audio/wav", buffer: wav(4) },
    { name: "Mood Book - 02.wav", mimeType: "audio/wav", buffer: wav(4) },
    { name: "Mood Book - 03.wav", mimeType: "audio/wav", buffer: wav(4) },
  ]);
  await expect(page).toHaveURL(/\/book\/[a-z0-9]+$/);
  const id = new URL(page.url()).pathname.split("/").pop()!;
  await page.evaluate(
    ({ id, emotions, pieces, source }) => {
      const books = JSON.parse(localStorage.getItem("books")!) as { id: string; chapters: { index: number; title: string }[] }[];
      const book = books.find((b) => b.id === id)!;
      const chapters = book.chapters.map((c) => ({
        mood: {
          chapterIndex: c.index,
          chapterTitle: c.title,
          emotions: emotions[c.index],
          sources: [{ url: source, title: "Mood Book summary" }],
          coverage: "scored",
          model: "gpt-5-mini",
          version: "01.2.1",
          scoredAt: 1,
        },
        pieces,
        playlist: { chapterIndex: c.index, piece: pieces[0].id, alternates: [pieces[1].id, pieces[2].id], pick: "auto" },
      }));
      localStorage.setItem(`scores:${id}`, JSON.stringify({ jobId: "d".repeat(64), model: "gpt-5-mini", version: "01.2.1", scoredAt: 1, costUsd: 0.04, chapters }));
    },
    { id, emotions: EMOTIONS, pieces: [piece(1), piece(2), piece(3)], source: SOURCE },
  );
  await page.reload();
  await expect(page.getByTestId("mini-play-pause")).toHaveAttribute("aria-label", /Play|Pause/);
  return id;
}

const storedPick = (page: Page, id: string, index: number) =>
  page.evaluate(({ id, index }) => JSON.parse(localStorage.getItem(`scores:${id}`)!).chapters[index].playlist.pick as string, { id, index });

test.describe("the chapter mood card", () => {
  let problems: string[] = [];
  test.beforeEach(async ({ page }) => {
    problems = await guard(page);
  });
  test.afterEach(() => {
    expect(problems).toEqual([]);
  });

  test("A21: a chapter not reached shows no emotions and does not expand; reaching it shows them, and they stay", async ({ page }) => {
    await scoredBook(page);
    const row1 = page.getByTestId("chapter-row-1");
    const row2 = page.getByTestId("chapter-row-2");
    for (const [i, row] of [row1, row2].entries()) {
      await expect(row.getByTestId(`locked-${i + 1}`)).toBeVisible();
      await expect(row.locator("[data-testid^='emotion-']")).toHaveCount(0);
      await expect(row.getByTestId("chapter-expanded")).toHaveCount(0);
      await expect(row).not.toContainText("%");
    }
    await expect(page.getByTestId("chapter-1")).toHaveAttribute("aria-label", /not reached yet$/);
    // Nothing of the later chapters' moods is on the page at all, and no source is ever shown (no events either).
    for (const label of ["Sorrow 90%", "Calm 40%", "Triumph 95%", "Joy 60%", "Romance 20%"]) await expect(page.getByText(label)).toHaveCount(0);
    await expect(page.getByText("Mood Book summary")).toHaveCount(0);
    await expect(page.locator(`a[href^="${SOURCE}"]`)).toHaveCount(0);

    // Tapping a later chapter's title still jumps there (the listener chose to go), which reaches it.
    await page.getByTestId("chapter-2").click();
    await expect(row2.getByTestId("chapter-expanded")).toBeVisible();
    await expect(row2.getByTestId("locked-2")).toHaveCount(0);
    await expect(row2.getByTestId("mood-emotions")).toContainText("Triumph 95%");

    // Going back never un-reaches it: collapsed, it shows its two strongest emotions; and so after a reload.
    await page.getByTestId("chapter-0").click();
    await expect(page.getByTestId("chapter-row-0").getByTestId("chapter-expanded")).toBeVisible();
    const chips2 = row2.getByTestId("row-emotions-2");
    await expect(chips2).toContainText("Triumph 95%");
    await expect(chips2).toContainText("Joy 60%");
    await expect(chips2).not.toContainText("Romance");
    await page.reload();
    await expect(page.getByTestId("row-emotions-2")).toContainText("Triumph 95%");
    await expect(page.getByTestId("locked-1")).toHaveCount(0);
  });

  test("A16: the playing chapter shows its emotions, named piece and alternates; a pick is saved across a reload; Auto returns to auto", async ({ page }) => {
    const id = await scoredBook(page);
    const card = page.getByTestId("chapter-row-0").getByTestId("mood-card");
    await expect(card.getByTestId("mood-emotions")).toContainText("Tension 80%");
    await expect(card.getByTestId("mood-emotions")).toContainText("Wonder 70%");
    await expect(card.getByTestId("mood-emotions")).toContainText("Dread 30%");
    await expect(card.getByTestId("emotion-tension")).toHaveAttribute("aria-label", "Tension, 80 percent");
    await expect(card.getByTestId("mood-piece")).toContainText("Theme 1");
    await expect(card.getByTestId("mood-piece")).toContainText("Composer 1 · Score");
    await expect(card.getByTestId("mood-alternates")).toContainText("Theme 2 (Composer 2) · Theme 3 (Composer 3)");
    await expect(card.getByTestId("pick-auto")).toHaveAttribute("aria-pressed", "true");

    const pick3 = card.getByTestId("pick-composer-3--theme-3");
    await expect(pick3).toHaveAttribute("aria-label", "Pick Theme 3 by Composer 3 for this chapter");
    await pick3.click();
    await expect(pick3).toHaveAttribute("aria-pressed", "true");
    await expect(card.getByTestId("pick-auto")).toHaveAttribute("aria-pressed", "false");
    expect(await storedPick(page, id, 0)).toBe("composer-3--theme-3");

    await page.reload();
    const again = page.getByTestId("chapter-row-0").getByTestId("mood-card");
    await expect(again.getByTestId("pick-composer-3--theme-3")).toHaveAttribute("aria-pressed", "true");
    // The pick changes the playlist only: the chapter's emotions are as scored.
    await expect(again.getByTestId("mood-emotions")).toContainText("Tension 80%");
    const mood = await page.evaluate((id) => JSON.parse(localStorage.getItem(`scores:${id}`)!).chapters[0].mood, id);
    expect(mood.emotions).toEqual(EMOTIONS[0]);

    await again.getByTestId("pick-auto").click();
    await expect(again.getByTestId("pick-auto")).toHaveAttribute("aria-pressed", "true");
    await expect(again.getByTestId("pick-composer-3--theme-3")).toHaveAttribute("aria-pressed", "false");
    expect(await storedPick(page, id, 0)).toBe("auto");
  });
});
