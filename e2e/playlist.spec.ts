// One button, one playlist (05.4, spec 05 A4, A5) on the web build, hermetic: a scored book re-matched to catalog pieces
// (the committed snapshot answers the catalog's address, e2e/guard.ts serveCatalog) and every piece's audio answered
// at the catalog's address by a local WAV, held until the spec lets it through, so nothing reaches R2. "Build
// playlist" downloads each chapter's piece with progress (pieces and bytes), then says it is done; the bed then plays
// the piece from the browser's own copy, not the stream, and still does after a reload. Changing a chapter's pick
// downloads the new piece and releases the old one (its download row and its kept copy go).
import { expect, test, type Page, type Route } from "@playwright/test";

import { CATALOG_BASE, CATALOG_SNAPSHOT, guard, serveCatalog } from "./guard";
import { scoredBook, unscoredBook, wav } from "./scored-book";

const APP_CATALOG = CATALOG_SNAPSHOT.pieces as unknown as { id: string; file: { key: string } }[];
const keyOf = (id: string) => APP_CATALOG.find((p) => p.id === id)!.file.key;
const nameOf = (id: string) => keyOf(id).split("/").pop()!;

// Before the app loads: remember every Audio element made (expo-audio's web player makes one per deck and file).
async function instrument(page: Page) {
  await page.addInitScript(() => {
    const w = window as unknown as { __audios: HTMLAudioElement[]; Audio: unknown };
    const Original = window.Audio;
    w.__audios = [];
    const Patched = function (src?: string) {
      const a = new Original(src);
      w.__audios.push(a);
      return a;
    } as unknown as typeof Audio;
    Patched.prototype = Original.prototype;
    w.Audio = Patched;
  });
}

/** What the bed plays now: the one playing looping deck's source, or "" for none. */
function bedSrc(page: Page): Promise<string> {
  return page.evaluate(() => {
    const playing = (window as unknown as { __audios: HTMLAudioElement[] }).__audios.filter((a) => a.ontimeupdate && a.loop && !a.paused);
    return playing.length === 1 ? playing[0].src : "";
  });
}

/** Every piece request at the catalog's address, held until `release()`; each request's key is kept. */
async function holdPieces(page: Page) {
  const keys: string[] = [];
  const held: Route[] = [];
  let open = false;
  const body = wav(6);
  const answer = (route: Route) => route.fulfill({ status: 200, body, headers: { "content-type": "audio/wav", "content-length": String(body.length) } });
  await page.route(`${CATALOG_BASE}/pieces/**`, (route) => {
    keys.push(new URL(route.request().url()).pathname.slice(1));
    if (open) return answer(route);
    held.push(route);
  });
  return {
    keys,
    release: async () => {
      open = true;
      await Promise.all(held.splice(0).map(answer));
    },
  };
}

type Stored = { playlist: { piece: string; alternates: string[]; pick: string } }[];

const storedChapters = (page: Page, id: string) => page.evaluate((id) => JSON.parse(localStorage.getItem(`scores:${id}`)!).chapters as Stored, id);
const pieceRows = (page: Page) =>
  page.evaluate(() => (JSON.parse(localStorage.getItem("downloads") ?? "[]") as { target: { kind: string; pieceId?: string }; state: string }[]).filter((d) => d.target.kind === "piece"));
const record = (page: Page, id: string) =>
  page.evaluate((id) => (JSON.parse(localStorage.getItem("playlists") ?? "[]") as { bookId: string; pieces: { id: string }[] }[]).find((r) => r.bookId === id) ?? null, id);
const kept = (page: Page) =>
  page.evaluate(
    () =>
      new Promise<string[]>((resolve, reject) => {
        const req = indexedDB.open("mood-read", 1);
        req.onsuccess = () => {
          const keys = req.result.transaction("files", "readonly").objectStore("files").getAllKeys();
          keys.onsuccess = () => resolve((keys.result as string[]).filter((k) => String(k).startsWith("piece:")).map(String));
          keys.onerror = () => reject(keys.error);
        };
        req.onerror = () => reject(req.error);
      }),
  );

test.describe("one button, one playlist", () => {
  let problems: string[] = [];
  test.beforeEach(async ({ page }) => {
    problems = await guard(page);
    await instrument(page);
  });
  test.afterEach(() => {
    expect(problems).toEqual([]);
  });

  test("A4: Build playlist downloads every chapter's piece with progress, then the book plays from the browser's copy", async ({ page }) => {
    await serveCatalog(page);
    const pieces = await holdPieces(page);
    const id = await scoredBook(page);
    const band = page.getByTestId("playlist-band");
    await expect(page.getByTestId("build-playlist")).toBeVisible();
    await page.getByTestId("mix-quiet-off").click();

    const needed = [...new Set((await storedChapters(page, id)).map((c) => c.playlist.piece))];
    await page.getByTestId("build-playlist").click();
    // Held at the address: the band counts pieces and bytes, none of them on the device yet.
    await expect(page.getByTestId("playlist-progress")).toHaveText(new RegExp(`^Downloading music: 0 of ${needed.length} pieces? · `));
    await expect(band.getByRole("progressbar")).toBeVisible();
    // Building turns the book's layer to Music: the playlist is what plays.
    await expect(page.getByTestId("chapter-row-0").getByTestId("layer-chip-music")).toHaveAttribute("aria-pressed", "true");

    await pieces.release();
    await expect(page.getByTestId("playlist-done")).toHaveText(new RegExp(`^Playlist on this device: ${needed.length} pieces? · `));
    // Every piece the book plays was asked for (the playing chapter's may also have streamed meanwhile), and kept.
    expect([...new Set(pieces.keys)].sort()).toEqual(needed.map(keyOf).sort());
    expect((await kept(page)).sort()).toEqual(needed.map((p) => `piece:${nameOf(p)}`).sort());

    // Offline from here: the bed loops the chapter's piece from the browser's own copy, and asks the address for nothing.
    const asked = pieces.keys.length;
    await page.getByTestId("mini-play-pause").click();
    await expect.poll(() => bedSrc(page), { timeout: 10_000 }).toMatch(/^blob:/);
    await page.getByTestId("mini-play-pause").click();
    expect(pieces.keys.length).toBe(asked);

    // A reload still plays the kept copy, and the band still says done.
    await page.reload();
    await expect(page.getByTestId("playlist-done")).toBeVisible();
    await page.getByTestId("mini-play-pause").click();
    await expect.poll(() => bedSrc(page), { timeout: 10_000 }).toMatch(/^blob:/);
    await page.getByTestId("mini-play-pause").click();
    expect(pieces.keys.length).toBe(asked);
  });

  test("A5: changing a chapter's pick downloads the new piece and releases the old one", async ({ page }) => {
    await serveCatalog(page);
    const pieces = await holdPieces(page);
    await pieces.release();
    const id = await scoredBook(page);
    await page.getByTestId("build-playlist").click();
    await expect(page.getByTestId("playlist-done")).toBeVisible();

    const chapters = await storedChapters(page, id);
    const old = chapters[0].playlist.piece;
    const others = new Set(chapters.slice(1).map((c) => c.playlist.piece));
    const alt = chapters[0].playlist.alternates.find((a) => !others.has(a) && a !== old)!;
    expect(alt, "an alternate no other chapter plays").toBeTruthy();

    await page.getByTestId("chapter-row-0").getByTestId(`pick-${alt}`).click();
    await expect.poll(() => pieces.keys.includes(keyOf(alt))).toBe(true);
    await expect(page.getByTestId("playlist-done")).toBeVisible();
    await expect.poll(async () => (await record(page, id))?.pieces.map((p) => p.id).includes(alt)).toBe(true);
    const ids = (await record(page, id))!.pieces.map((p) => p.id);
    // Released: the old piece, which no other chapter plays, leaves the playlist, the queue and the browser.
    expect(others.has(old), "the old piece is chapter 1's alone").toBe(false);
    expect(ids).not.toContain(old);
    await expect.poll(async () => (await pieceRows(page)).some((d) => d.target.pieceId === old)).toBe(false);
    await expect.poll(async () => (await kept(page)).includes(`piece:${nameOf(old)}`)).toBe(false);
    await expect.poll(async () => (await kept(page)).includes(`piece:${nameOf(alt)}`)).toBe(true);
  });

  test("A4: an unscored book offers no playlist", async ({ page }) => {
    await serveCatalog(page);
    await unscoredBook(page);
    await expect(page.getByTestId("score-book")).toBeVisible();
    await expect(page.getByTestId("playlist-band")).toHaveCount(0);
  });
});
