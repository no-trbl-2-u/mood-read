// Your own books on the web build (01.6, spec 01 A5-A7): the Import screen pushed from the library; a tagged MP3
// made here imports as a book with its title, author and cover; a WAV with cue points gets those chapters, which
// the listener renames, merges and splits; a single file without markers breaks at its long silences; and an
// AAX/AAXC file (by its content, even renamed) shows the import note instead of failing, never suggesting a
// conversion.
import { expect, test, type Page } from "@playwright/test";

import {
  aaxFile,
  cat,
  id3Apic,
  id3Tag,
  id3Text,
  mp3Frames,
  toneAndSilence,
  wavFile,
} from "../src/lib/meta/test-fixtures";

import { guard } from "./guard";

/** A real 1x1 PNG, so the cover renders. */
const PNG_1PX = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
  "base64",
);

function taggedMp3(): Buffer {
  const tag = id3Tag([
    id3Text("TIT2", "The Quiet Harbor"),
    id3Text("TALB", "The Quiet Harbor"),
    id3Text("TPE1", "Ada Lindqvist"),
    id3Apic(new Uint8Array(PNG_1PX), 3, "image/png"),
  ]);
  return Buffer.from(cat(tag, mp3Frames(120)));
}

async function openImport(page: Page) {
  await page.goto("/");
  await page.getByTestId("import-book").click();
  await expect(page).toHaveURL(/\/import$/);
  await expect(page.getByRole("heading", { name: "Import" })).toBeVisible();
}

async function pick(page: Page, files: { name: string; mimeType: string; buffer: Buffer }[]) {
  const chooser = page.waitForEvent("filechooser");
  await page.getByTestId("import-files").click();
  await (await chooser).setFiles(files);
}

test.describe("your own books", () => {
  let problems: string[] = [];
  test.beforeEach(async ({ page }) => {
    problems = await guard(page);
  });
  test.afterEach(() => {
    expect(problems).toEqual([]);
  });

  test("A5: a tagged MP3 imports as a book with the title, author and cover from its tags", async ({ page }) => {
    await openImport(page);
    await pick(page, [{ name: "track01.mp3", mimeType: "audio/mpeg", buffer: taggedMp3() }]);
    await expect(page).toHaveURL(/\/book\/[a-z0-9]+$/);
    await expect(page.getByRole("heading", { name: "The Quiet Harbor" })).toBeVisible();

    await page.getByTestId("top-back").click();
    await expect(page.getByRole("heading", { name: "Library" })).toBeVisible();
    const row = page.getByRole("link", { name: "The Quiet Harbor" });
    await expect(row).toBeVisible();
    await expect(row.getByTestId("book-author")).toHaveText("Ada Lindqvist");
    await expect(row.getByTestId("cover-image")).toBeVisible();
  });

  test("A6: chapter markers become the river, and the listener renames, merges and splits them", async ({ page }) => {
    const audio = toneAndSilence([[70, true]]);
    const wav = Buffer.from(
      wavFile(audio, 8000, { INAM: "Marked Book", IART: "C. Writer" }, [
        [0, "Arrival"],
        [40, "The Storm"],
      ]),
    );
    await openImport(page);
    await pick(page, [{ name: "marked.wav", mimeType: "audio/wav", buffer: wav }]);
    await expect(page.getByRole("heading", { name: "Marked Book" })).toBeVisible();
    await expect(page.getByText("Ch.1 — Arrival")).toBeVisible();
    await expect(page.getByText("Ch.2 — The Storm")).toBeVisible();
    await expect(page.getByTestId("chapter-row-0").getByTestId("chapter-expanded")).toBeVisible();

    // Rename the playing chapter.
    await page.getByTestId("chapter-rename").click();
    await page.getByTestId("chapter-title-input").fill("The Landing");
    await page.getByTestId("chapter-rename-save").click();
    await expect(page.getByText("Ch.1 — The Landing")).toBeVisible();

    // Merge it with the next: one chapter, the whole book.
    await page.getByTestId("chapter-merge").click();
    await expect(page.getByText("Ch.2 — The Storm")).toHaveCount(0);
    await expect(page.getByTestId("chapter-row-0")).toContainText("1:10");
    await expect(page.getByTestId("chapter-merge")).toBeDisabled();

    // Split at the current position (30 s in).
    await expect(page.getByTestId("chapter-split")).toBeDisabled();
    await page.getByTestId("mini-fwd-30").click();
    await expect(page.getByTestId("chapter-split")).toHaveText("Split at 0:30");
    await page.getByTestId("chapter-split").click();
    await expect(page.getByText("Ch.2 — The Landing, part 2")).toBeVisible();
    await expect(page.getByTestId("chapter-row-0")).toContainText("0:30");

    // The edits are kept: after a reload the river is the same.
    await page.reload();
    await expect(page.getByText("Ch.1 — The Landing")).toBeVisible();
    await expect(page.getByText("Ch.2 — The Landing, part 2")).toBeVisible();
  });

  test("A6: a single file with no markers is split at its long silences", async ({ page }) => {
    const wav = Buffer.from(
      wavFile(
        toneAndSilence([
          [65, true],
          [3, false],
          [65, true],
        ]),
        8000,
        { INAM: "Quiet Breaks" },
      ),
    );
    await openImport(page);
    await pick(page, [{ name: "breaks.wav", mimeType: "audio/wav", buffer: wav }]);
    await expect(page.getByRole("heading", { name: "Quiet Breaks" })).toBeVisible();
    await expect(page.getByText("Ch.1 — Chapter 1")).toBeVisible();
    await expect(page.getByText("Ch.2 — Chapter 2")).toBeVisible();
    await expect(page.getByTestId("chapter-row-0")).toContainText("1:06");
  });

  test("A7: an AAX file shows the import note, pointing to DRM-free stores and companion mode", async ({ page }) => {
    await openImport(page);
    await pick(page, [{ name: "My Audible Book.aax", mimeType: "application/octet-stream", buffer: Buffer.from(aaxFile()) }]);
    const note = page.getByTestId("import-note");
    await expect(note).toBeVisible();
    await expect(note.getByRole("heading", { name: "Can't open this file" })).toBeVisible();
    await expect(page.getByTestId("import-note-text")).toContainText('"My Audible Book.aax"');
    await expect(page.getByTestId("import-note-text")).toContainText("Audible-encrypted");
    await expect(page.getByTestId("import-note-text")).toContainText("never decrypts");
    await expect(page.getByTestId("import-note-text")).toContainText("never asks for your Audible password");
    await expect(note).toContainText("Libro.fm");
    await expect(note).toContainText("companion mode");
    await page.getByTestId("learn-more").click();
    await expect(page.getByTestId("import-note-more")).toBeVisible();
    await expect(note).not.toContainText(/convert/i);
    // Nothing was added to the library.
    await page.getByTestId("top-back").click();
    await expect(page.getByText("No books yet")).toBeVisible();
  });

  test("A7: an AAXC renamed to .m4b is still caught by its content, and Choose another file picks again", async ({
    page,
  }) => {
    await openImport(page);
    await pick(page, [{ name: "renamed.m4b", mimeType: "audio/mp4", buffer: Buffer.from(aaxFile("aaxc")) }]);
    await expect(page.getByTestId("import-note-text")).toContainText("(AAXC)");
    const chooser = page.waitForEvent("filechooser");
    await page.getByTestId("choose-another").click();
    await (await chooser).setFiles([{ name: "track01.mp3", mimeType: "audio/mpeg", buffer: taggedMp3() }]);
    await expect(page.getByRole("heading", { name: "The Quiet Harbor" })).toBeVisible();
  });
});
