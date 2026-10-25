// The chapter's piece under the narration (01.10, spec 01 A17, A18) on the web build, hermetic: a scored book whose
// pieces the device re-matches to catalog pieces (the committed snapshot answers the catalog's address, e2e/guard.ts
// serveCatalog), and every piece's audio answered at the catalog's address by a local WAV (servePieces), so nothing
// reaches R2. The Music chip puts the chapter's catalog piece on the bed, looping at the bed's own rate; a pick moves
// it to the picked piece; it is saved with the book's mix; and with no catalog the bed keeps its soundscape.
import { expect, test, type Page } from "@playwright/test";

import { CATALOG_SNAPSHOT, guard, serveCatalog, servePieces } from "./guard";
import { scoredBook, wav } from "./scored-book";

type Deck = { src: string; paused: boolean; loop: boolean; playbackRate: number };

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

/** The bed's decks: the looping elements the player made. */
function decks(page: Page): Promise<Deck[]> {
  return page.evaluate(() =>
    (window as unknown as { __audios: HTMLAudioElement[] }).__audios
      .filter((a) => a.ontimeupdate && a.loop)
      .map((a) => ({ src: a.src, paused: a.paused, loop: a.loop, playbackRate: a.playbackRate })),
  );
}

/** What the bed plays now: the one playing deck's source, or "" for none. */
async function bedSrc(page: Page): Promise<string> {
  const playing = (await decks(page)).filter((d) => !d.paused);
  return playing.length === 1 ? playing[0].src : "";
}

const keyOf = (id: string) => (CATALOG_SNAPSHOT.pieces as unknown as { id: string; file: { key: string } }[]).find((p) => p.id === id)!.file.key;

async function storedPlaylist(page: Page, id: string) {
  return page.evaluate((id) => JSON.parse(localStorage.getItem(`scores:${id}`)!).chapters[0].playlist as { piece: string; alternates: string[] }, id);
}

test.describe("the chapter's piece under the narration", () => {
  let problems: string[] = [];
  test.beforeEach(async ({ page }) => {
    problems = await guard(page);
    await instrument(page);
  });
  test.afterEach(() => {
    expect(problems).toEqual([]);
  });

  test("A17: Music loops the chapter's catalog piece under the narration; a pick moves it; saved with the mix", async ({ page }) => {
    await serveCatalog(page);
    const fetched = await servePieces(page, wav(6));
    const id = await scoredBook(page);
    const row0 = page.getByTestId("chapter-row-0");
    await page.getByTestId("mix-quiet-off").click();
    await expect(row0.getByTestId("mood-piece")).toBeVisible();
    const playlist = await storedPlaylist(page, id);

    await row0.getByTestId("layer-chip-music").click();
    await expect(row0.getByTestId("layer-chip-music")).toHaveAttribute("aria-pressed", "true");
    await expect(row0.getByTestId("layer-sound")).toHaveText("Music");
    await page.getByTestId("mini-play-pause").click();
    // Auto: the chapter's catalog piece, streamed from the catalog's address, looping at the bed's own rate.
    await expect.poll(() => bedSrc(page), { timeout: 10_000 }).toMatch(new RegExp(`/${keyOf(playlist.piece)}$`));
    const deck = (await decks(page)).find((d) => !d.paused)!;
    expect(deck.loop).toBe(true);
    expect(deck.playbackRate).toBe(1);
    expect(fetched).toContain(keyOf(playlist.piece));

    // The listener's pick plays from then on.
    const alt = playlist.alternates[0];
    await row0.getByTestId(`pick-${alt}`).click();
    await expect.poll(() => bedSrc(page), { timeout: 10_000 }).toMatch(new RegExp(`/${keyOf(alt)}$`));
    await page.getByTestId("mini-play-pause").click();

    // Saved with the book's mix: after a reload Music is on and the picked piece loads for the chapter.
    await page.reload();
    await expect(page.getByTestId("chapter-row-0").getByTestId("layer-chip-music")).toHaveAttribute("aria-pressed", "true");
    await expect.poll(async () => (await decks(page)).map((d) => d.src).some((s) => s.endsWith(keyOf(alt))), { timeout: 10_000 }).toBe(true);
  });

  test("A18: with no catalog piece to play, Music keeps the soundscape that was on and fetches nothing", async ({ page }) => {
    // The guard answers the catalog's address with an empty catalog: no piece may play.
    const fetched = await servePieces(page, wav(6));
    await scoredBook(page);
    const row0 = page.getByTestId("chapter-row-0");
    await page.getByTestId("mix-quiet-off").click();
    await row0.getByTestId("layer-chip-music").click();
    await expect(row0.getByTestId("layer-chip-music")).toHaveAttribute("aria-pressed", "true");
    await page.getByTestId("mini-play-pause").click();
    await expect.poll(() => bedSrc(page), { timeout: 10_000 }).toMatch(/soundscapes\/night-wind\./);
    await page.getByTestId("mini-play-pause").click();
    expect(fetched).toEqual([]);
  });
});
