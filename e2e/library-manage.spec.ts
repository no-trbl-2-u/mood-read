// Library management (spec 05, 05.7, A7, A8) on the web build, hermetic: a book's row on the shelf offers "Remove
// download" and "Delete book". Removing a download deletes the book's audio from the browser and keeps the book, its
// position, bookmarks, moods, picks and mix, across a reload, marked "Not on device"; an imported book takes its file
// back only when it matches (title, author, length), and a LibriVox book downloads again in one tap (archive.org is a
// route stub, e2e/librivox-fixtures.ts). Deleting a book, after an in-app confirm, removes it and all it kept, and
// its playlist's pieces with it.
// A piece shared by two built books cannot be shown here: the web build keeps one book's playlist at a time (05.4,
// "The web build streams; phones keep"), so A8's shared-piece rule is proven in src/lib/book-removal.test.ts.
import { expect, test, type Page } from "@playwright/test";

import { guard, serveCatalog, servePieces } from "./guard";
import { IDENTIFIER, stubArchiveOrg } from "./librivox-fixtures";
import { scoredBook, wav } from "./scored-book";

/** Every key the browser keeps in the app's IndexedDB store. */
const stored = (page: Page) =>
  page.evaluate(
    () =>
      new Promise<string[]>((resolve, reject) => {
        const req = indexedDB.open("mood-read", 1);
        req.onsuccess = () => {
          const keys = req.result.transaction("files", "readonly").objectStore("files").getAllKeys();
          keys.onsuccess = () => resolve((keys.result as IDBValidKey[]).map(String));
          keys.onerror = () => reject(keys.error);
        };
        req.onerror = () => reject(req.error);
      }),
  );

/** Every localStorage entry kept for the book (`<kind>:<id>`). */
const bookKeys = (page: Page, id: string) =>
  page.evaluate((id) => {
    const out: Record<string, string> = {};
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i)!;
      if (k.endsWith(`:${id}`)) out[k] = localStorage.getItem(k)!;
    }
    return out;
  }, id);

const shelfBook = (page: Page, id: string) =>
  page.evaluate((id) => (JSON.parse(localStorage.getItem("books") ?? "[]") as { id: string; onDevice: boolean; chapters: unknown[] }[]).find((b) => b.id === id) ?? null, id);

/** A place, a bookmark and a mix of the listener's own, stored as the app stores them. */
async function listenTo(page: Page, id: string) {
  await page.evaluate((id) => {
    localStorage.setItem(`pos:${id}`, "5.5");
    localStorage.setItem(`bookmarks:${id}`, JSON.stringify([{ id: "m1", bookId: id, position: 5.5, name: "The storm", createdAt: 1 }]));
    localStorage.setItem(`mix:${id}`, JSON.stringify({ balance: 0.3, master: 0.8, duck: true }));
  }, id);
}

async function rowMenu(page: Page, id: string, item: string) {
  await page.getByTestId(`book-more-${id}`).click();
  await page.getByTestId(`menu-${item}`).click();
}

const files = (seconds: number) =>
  [1, 2, 3].map((n) => ({ name: `Mood Book - 0${n}.wav`, mimeType: "audio/wav", buffer: wav(seconds) }));

test.describe("library management", () => {
  let problems: string[] = [];
  test.beforeEach(async ({ page }) => {
    problems = await guard(page);
  });
  test.afterEach(() => {
    expect(problems).toEqual([]);
  });

  test("A7: Remove download deletes an imported book's audio, keeps the book and all it had, and takes the matching file back", async ({ page }) => {
    const id = await scoredBook(page);
    await page.goto("/");
    await listenTo(page, id);
    await page.reload();
    const kept = await bookKeys(page, id);
    for (const k of [`bookmarks:${id}`, `mix:${id}`, `pos:${id}`, `scores:${id}`]) expect(Object.keys(kept)).toContain(k);
    expect((await stored(page)).filter((k) => k.startsWith(`idb:${id}/`))).toHaveLength(3);

    await rowMenu(page, id, "remove-download");
    await expect(page.getByTestId(`not-on-device-${id}`)).toHaveText("Not on device");
    await expect.poll(async () => (await stored(page)).filter((k) => k.startsWith(`idb:${id}/`))).toEqual([]);

    // After a reload: still on the shelf, not on the device, with its place, bookmarks, moods, picks and mix.
    await page.reload();
    await expect(page.getByTestId(`not-on-device-${id}`)).toBeVisible();
    expect(await bookKeys(page, id)).toEqual(kept);
    expect((await shelfBook(page, id))?.onDevice).toBe(false);

    // Opening it offers the file back instead of the player; its chapters and moods still show.
    await page.getByTestId(`book-${id}`).click();
    await expect(page.getByTestId("off-device-band")).toBeVisible();
    await expect(page.getByTestId("mini-play-pause")).toHaveCount(0);
    await expect(page.getByTestId("chapter-row-0")).toBeVisible();

    // A copy of another length is refused, and nothing is kept.
    let chooser = page.waitForEvent("filechooser");
    await page.getByTestId("find-the-file").click();
    await (await chooser).setFiles(files(9));
    await expect(page.getByTestId("off-device-error")).toHaveText(/length doesn't match/);
    expect((await shelfBook(page, id))?.onDevice).toBe(false);
    expect((await stored(page)).filter((k) => k.startsWith(`idb:${id}/`))).toEqual([]);

    // The book's own file comes back: the player returns, and nothing the listener made of the book changed.
    chooser = page.waitForEvent("filechooser");
    await page.getByTestId("find-the-file").click();
    await (await chooser).setFiles(files(4));
    await expect(page.getByTestId("off-device-band")).toHaveCount(0);
    await expect(page.getByTestId("mini-play-pause")).toHaveAttribute("aria-label", /Play|Pause/);
    expect((await shelfBook(page, id))?.onDevice).toBe(true);
    expect(await page.evaluate((id) => JSON.parse(localStorage.getItem(`bookmarks:${id}`)!)[0].name, id)).toBe("The storm");
    expect(await page.evaluate((id) => localStorage.getItem(`scores:${id}`), id)).toBe(kept[`scores:${id}`]);
    await page.getByTestId("top-back").click();
    await expect(page.getByTestId(`not-on-device-${id}`)).toHaveCount(0);
  });

  test("A7: removing the download of the book in the player stops it where it was; with its file back, it plays again", async ({ page }) => {
    const id = await scoredBook(page);
    const play = page.getByTestId("mini-play-pause");
    await play.click();
    await expect(play).toHaveAttribute("aria-label", /Pause/);
    await page.waitForTimeout(1500);
    await play.click();
    await expect(play).toHaveAttribute("aria-label", /Play/);
    const place = Number(await page.evaluate((id) => localStorage.getItem(`pos:${id}`), id));
    expect(place).toBeGreaterThan(0.5);

    await page.getByTestId("top-back").click();
    await rowMenu(page, id, "remove-download");
    await expect(page.getByTestId(`not-on-device-${id}`)).toBeVisible();
    expect(Math.abs(Number(await page.evaluate((id) => localStorage.getItem(`pos:${id}`), id)) - place)).toBeLessThan(0.5);

    await page.getByTestId(`book-${id}`).click();
    const chooser = page.waitForEvent("filechooser");
    await page.getByTestId("find-the-file").click();
    await (await chooser).setFiles(files(4));
    await expect(play).toHaveAttribute("aria-label", /Play/);
    await expect(play.locator("[role=progressbar]")).toHaveCount(0);
    await play.click();
    await expect(play).toHaveAttribute("aria-label", /Pause/);
    await expect.poll(async () => Number(await page.evaluate((id) => localStorage.getItem(`pos:${id}`), id)), { timeout: 5_000 }).toBeGreaterThan(place);
    await play.click();
  });

  test("A7: a LibriVox book whose download was removed downloads again in one tap, onto the same book", async ({ page }) => {
    await stubArchiveOrg(page);
    await page.goto(`/browse/${IDENTIFIER}`);
    await page.getByTestId("browse-book-download").click();
    await expect(page.getByTestId("browse-book-open")).toBeVisible({ timeout: 15_000 });
    const id = await page.evaluate(() => JSON.parse(localStorage.getItem("books")!)[0].id as string);
    await page.goto("/");
    await listenTo(page, id);
    await page.reload();
    const before = await shelfBook(page, id);

    await rowMenu(page, id, "remove-download");
    await expect(page.getByTestId(`not-on-device-${id}`)).toBeVisible();
    await page.getByTestId(`book-${id}`).click();
    await expect(page.getByTestId("off-device-band")).toBeVisible();
    await page.getByTestId("download-again").click();
    await expect(page.getByTestId("off-device-band")).toHaveCount(0, { timeout: 15_000 });
    await expect(page.getByTestId("mini-play-pause")).toBeVisible();

    const after = await shelfBook(page, id);
    expect(after?.onDevice).toBe(true);
    expect(after?.chapters).toEqual(before?.chapters);
    expect(await page.evaluate((id) => localStorage.getItem(`pos:${id}`), id)).toBe("5.5");
    expect((await stored(page)).filter((k) => k.startsWith(`idb:${id}/`)).length).toBeGreaterThan(0);
    await page.waitForLoadState("networkidle");
  });

  test("A8: Delete book, once confirmed, removes the book, all it kept, and its playlist's pieces", async ({ page }) => {
    await serveCatalog(page);
    await servePieces(page, wav(6));
    const id = await scoredBook(page);
    await page.getByTestId("build-playlist").click();
    await expect(page.getByTestId("playlist-done")).toBeVisible({ timeout: 15_000 });
    expect((await stored(page)).some((k) => k.startsWith("piece:"))).toBe(true);
    await page.goto("/");

    // Cancel keeps it.
    await rowMenu(page, id, "delete-book");
    await expect(page.getByTestId(`delete-confirm-${id}`)).toBeVisible();
    await page.getByTestId("delete-confirm-cancel").click();
    await expect(page.getByTestId(`delete-confirm-${id}`)).toHaveCount(0);
    await expect(page.getByTestId(`book-${id}`)).toBeVisible();

    await rowMenu(page, id, "delete-book");
    await page.getByTestId("delete-confirm-yes").click();
    await expect(page.getByTestId(`book-${id}`)).toHaveCount(0);
    await expect(page.getByTestId("import-book")).toBeVisible();
    await expect.poll(() => stored(page)).toEqual([]);
    expect(await bookKeys(page, id)).toEqual({});
    expect(await page.evaluate(() => localStorage.getItem("playlists"))).toBeNull();
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem("downloads") ?? "[]").length)).toBe(0);

    await page.reload();
    await expect(page.getByTestId("import-book")).toBeVisible();
  });
});
