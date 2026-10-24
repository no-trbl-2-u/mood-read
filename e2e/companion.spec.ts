// Companion mode on the web build (01.14, spec 01 A27): with the Settings switch on, a book's river plays the bed
// alone, no narration element ever playing and no Media Session handler set; a chapter tap moves the bed to that
// chapter (crossfading), the chapter timer moves it on by the book's lengths, and turning companion mode off brings
// back the narration with its Media Session (A4). The web has no OS audio session, so "mixes with the other app" is
// the device check's; here it is the bed only, claiming nothing. Audio elements are read directly, as in
// e2e/player.spec.ts: the bed's are the looping ones.
import { expect, test, type Page } from "@playwright/test";

import { guard } from "./guard";

const CH1 = 35;
const CH2 = 40;
/** The bed's level under the default mix (src/lib/mix.ts DEFAULT_MIX: balance -0.4, master 1). */
const BED_DEFAULT = 0.6;

/** A mono 16-bit PCM WAV of a quiet tone, `seconds` long. */
function wav(seconds: number, rate = 8000): Buffer {
  const samples = Math.round(seconds * rate);
  const data = Buffer.alloc(samples * 2);
  for (let i = 0; i < samples; i++) {
    data.writeInt16LE(Math.round(Math.sin((2 * Math.PI * 220 * i) / rate) * 800), i * 2);
  }
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

// Before the app loads: remember every Audio element made and the live Media Session handler for each action.
async function instrument(page: Page) {
  await page.addInitScript(() => {
    const w = window as unknown as { __audios: HTMLAudioElement[]; __ms: Record<string, unknown>; Audio: unknown };
    const Original = window.Audio;
    w.__audios = [];
    const Patched = function (src?: string) {
      const a = new Original(src);
      w.__audios.push(a);
      return a;
    } as unknown as typeof Audio;
    Patched.prototype = Original.prototype;
    w.Audio = Patched;
    w.__ms = {};
    const session = navigator.mediaSession;
    if (session) {
      const set = session.setActionHandler.bind(session);
      session.setActionHandler = (action, handler) => {
        w.__ms[action] = handler;
        set(action, handler);
      };
    }
  });
}

/** Whether any narration element (a player element that does not loop) is playing. */
async function narrationPlaying(page: Page): Promise<boolean> {
  return page.evaluate(() =>
    (window as unknown as { __audios: HTMLAudioElement[] }).__audios.some((a) => a.ontimeupdate && !a.loop && !a.paused),
  );
}

/** The Media Session actions with a live handler, and its title. */
async function mediaSession(page: Page): Promise<{ actions: string[]; title: string | null }> {
  return page.evaluate(() => ({
    actions: Object.entries((window as unknown as { __ms: Record<string, unknown> }).__ms)
      .filter(([, h]) => typeof h === "function")
      .map(([a]) => a)
      .sort(),
    title: navigator.mediaSession.metadata?.title ?? null,
  }));
}

type BedDeck = { sound: string; paused: boolean; volume: number };

async function bedDecks(page: Page): Promise<BedDeck[]> {
  return page.evaluate(() =>
    (window as unknown as { __audios: HTMLAudioElement[] }).__audios
      .filter((a) => a.ontimeupdate && a.loop)
      .map((a) => ({
        sound: /soundscapes\/([a-z-]+)\./.exec(a.src)?.[1] ?? a.src,
        paused: a.paused,
        volume: a.volume,
      })),
  );
}

/** The bed's sound heard now: the one playing deck at the mix's steady level, or "" for none (or mid-crossfade). */
async function bedPlaying(page: Page): Promise<string> {
  const playing = (await bedDecks(page)).filter((d) => !d.paused);
  return playing.length === 1 && Math.abs(playing[0].volume - BED_DEFAULT) < 1e-6 ? playing[0].sound : "";
}

/** Resolves true once two bed decks play at part volume together: a crossfade. */
function watchCrossfade(page: Page): Promise<boolean> {
  return page.evaluate(
    () =>
      new Promise<boolean>((resolve) => {
        const started = Date.now();
        const t = setInterval(() => {
          const live = (window as unknown as { __audios: HTMLAudioElement[] }).__audios.filter(
            (a) => a.ontimeupdate && a.loop && !a.paused,
          );
          const mid = live.length === 2 && live.every((a) => a.volume > 0 && a.volume < 1);
          if (mid || Date.now() - started > 10000) {
            clearInterval(t);
            resolve(mid);
          }
        }, 20);
      }),
  );
}

async function expectChapter(page: Page, index: number) {
  await expect(page.getByTestId(`chapter-row-${index}`).getByTestId("chapter-expanded")).toBeVisible();
}

async function readyToPlay(page: Page) {
  await expect(page.getByTestId("mini-play-pause")).toHaveAttribute("aria-label", /Play|Pause/);
  await expect(page.getByTestId("mini-play-pause").locator("[role=progressbar]")).toHaveCount(0);
}

/** From the library: Settings, set companion mode, and back to the shelf. */
async function setCompanion(page: Page, on: boolean) {
  await page.getByRole("button", { name: "More" }).click();
  await page.getByRole("menuitem", { name: "Settings" }).click();
  const companion = page.getByRole("switch", { name: "Companion mode" });
  if ((await companion.getAttribute("aria-checked")) !== String(on)) await companion.click();
  await expect(companion).toHaveAttribute("aria-checked", String(on));
  await page.getByRole("button", { name: "Back to your shelf" }).click();
  await expect(page.getByRole("heading", { name: "Your shelf" })).toBeVisible();
}

async function importBook(page: Page) {
  await page.getByTestId("import-book").click();
  await expect(page).toHaveURL(/\/import$/);
  const chooser = page.waitForEvent("filechooser");
  await page.getByTestId("import-files").click();
  await (
    await chooser
  ).setFiles([
    { name: "Test Book - 02.wav", mimeType: "audio/wav", buffer: wav(CH2) },
    { name: "Test Book - 01.wav", mimeType: "audio/wav", buffer: wav(CH1) },
  ]);
  await expect(page).toHaveURL(/\/book\/[a-z0-9]+$/);
  await expect(page.getByRole("heading", { name: "Test Book" })).toBeVisible();
  await readyToPlay(page);
  await expectChapter(page, 0);
}

async function backToShelf(page: Page) {
  await page.getByRole("button", { name: "Back to your shelf" }).click();
  await expect(page.getByRole("heading", { name: "Your shelf" })).toBeVisible();
}

async function openBook(page: Page) {
  await page.getByText("Test Book", { exact: true }).click();
  await expect(page.getByRole("heading", { name: "Test Book" })).toBeVisible();
  await readyToPlay(page);
}

test.describe("companion mode", () => {
  let problems: string[] = [];
  test.beforeEach(async ({ page }) => {
    problems = await guard(page);
    await instrument(page);
  });
  test.afterEach(() => {
    expect(problems).toEqual([]);
  });

  test("A27: turned on in Settings, a book plays its bed only, claims no Media Session, and follows a chapter tap and the timer; off brings the narration back (A4)", async ({
    page,
  }) => {
    await page.goto("/");
    await setCompanion(page, true);
    await importBook(page);
    await expect(page.getByTestId("companion-band")).toContainText("no narration");

    // Play: the bed alone, no narration element playing, no Media Session claimed.
    await page.getByTestId("mini-play-pause").click();
    await expect(page.getByTestId("mini-play-pause")).toHaveAttribute("aria-label", "Pause");
    await expect.poll(() => bedPlaying(page), { timeout: 10_000 }).toBe("night-wind");
    expect(await narrationPlaying(page)).toBe(false);
    expect(await mediaSession(page)).toEqual({ actions: [], title: null });

    // By tap: Ch.2 from the river moves the bed there; given its own sound, the bed plays it.
    await page.getByTestId("chapter-1").click();
    await expectChapter(page, 1);
    await page.getByTestId("layer-chapter-only").click();
    await page.getByTestId("layer-chip-tide").click();
    await expect.poll(() => bedPlaying(page), { timeout: 10_000 }).toBe("tide");
    // Back to Ch.1 while it plays: a crossfade into Night Wind.
    const fade = watchCrossfade(page);
    await page.getByTestId("chapter-0").click();
    expect(await fade).toBe(true);
    await expectChapter(page, 0);
    await expect.poll(() => bedPlaying(page), { timeout: 10_000 }).toBe("night-wind");
    expect(await narrationPlaying(page)).toBe(false);

    // By timer: on, 30 s into the 35 s Ch.1, the bed moves into Ch.2 by itself.
    const timer = page.getByRole("switch", { name: "Chapter timer" });
    await expect(timer).toHaveAttribute("aria-checked", "false");
    await timer.click();
    await expect(timer).toHaveAttribute("aria-checked", "true");
    await page.getByTestId("mini-fwd-30").click();
    await expect(page.getByTestId("mini-elapsed")).toHaveText(/0:3[0-4]/);
    await expect(page.getByTestId("chapter-row-1").getByTestId("chapter-expanded")).toBeVisible({ timeout: 15_000 });
    await expect.poll(() => bedPlaying(page), { timeout: 15_000 }).toBe("tide");
    expect(await narrationPlaying(page)).toBe(false);
    expect(await mediaSession(page)).toEqual({ actions: [], title: null });
    await page.getByTestId("mini-play-pause").click();
    await expect.poll(async () => (await bedDecks(page)).every((d) => d.paused)).toBe(true);

    // Off: the narration plays again, with its Media Session handlers and title (A4).
    await backToShelf(page);
    await setCompanion(page, false);
    await openBook(page);
    await expect(page.getByTestId("companion-band")).toHaveCount(0);
    await expect.poll(async () => (await mediaSession(page)).actions).toEqual(
      expect.arrayContaining(["pause", "play", "seekbackward", "seekforward"]),
    );
    expect((await mediaSession(page)).title).toBe("Test Book - 01");
    await page.getByTestId("mini-play-pause").click();
    await expect.poll(() => narrationPlaying(page)).toBe(true);
    await page.getByTestId("mini-play-pause").click();
    await expect.poll(() => narrationPlaying(page)).toBe(false);
  });

  test("A27: turning companion mode on with the narration open stops it and lets go of the Media Session", async ({
    page,
  }) => {
    await page.goto("/");
    await importBook(page);
    await page.getByTestId("mini-play-pause").click();
    await expect.poll(() => narrationPlaying(page)).toBe(true);
    expect((await mediaSession(page)).actions).toEqual(expect.arrayContaining(["pause", "play"]));

    await backToShelf(page);
    await setCompanion(page, true);
    await expect.poll(() => narrationPlaying(page)).toBe(false);
    await openBook(page);
    await expect(page.getByTestId("companion-band")).toBeVisible();
    await expect.poll(() => mediaSession(page)).toEqual({ actions: [], title: null });
    await page.getByTestId("mini-play-pause").click();
    await expect.poll(() => bedPlaying(page), { timeout: 10_000 }).toBe("night-wind");
    expect(await narrationPlaying(page)).toBe(false);
    expect((await mediaSession(page)).actions).toEqual([]);
  });
});
