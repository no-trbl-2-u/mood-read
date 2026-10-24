// A scored book for the e2e (01.4, shared by e2e/mood-card.spec.ts and e2e/a11y.spec.ts), hermetic: imported from
// three local WAV files (one chapter each), its scores seeded on the device the way a finished scoring run stores
// them (src/lib/scoring-store.ts, `scores:<book id>`), so no proxy is involved.
import { expect, type Page } from "@playwright/test";

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

export const SOURCE = "https://summaries.example/mood-book";
const piece = (n: number) => ({ id: `composer-${n}--theme-${n}`, title: `Theme ${n}`, artist: `Composer ${n}`, kind: "score", vocals: "none", moodTags: ["tension"] });
export const EMOTIONS = [
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
export async function scoredBook(page: Page): Promise<string> {
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

