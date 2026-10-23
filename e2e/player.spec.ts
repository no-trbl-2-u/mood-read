// The player on the web build (01.1, spec 01 A1-A4): a book opened from two local WAV files made here (two
// chapters), then play and pause, +/-30 s with clamps, a chapter jump from the river, speed without pitch change,
// the sleep timer, bookmarks, resume after a reload, and the browser's Media Session; then the bed (01.3, A8, A9)
// under it. The narration's and the bed's HTMLAudioElements are read directly (page.evaluate) so nothing waits
// on real time it does not need; the bed's are the looping ones.
import { expect, test, type Page } from "@playwright/test";

import { guard } from "./guard";

const CH1 = 35;
const CH2 = 40;

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

type AudioState = { currentTime: number; paused: boolean; playbackRate: number; preservesPitch: boolean };

// Before the app loads: remember every Audio element made (expo-audio's web player makes one per file) and every
// Media Session handler registered (the last one registered for an action is the live one).
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

/**
 * The narration's element: the newest one the player made (it sets ontimeupdate; the duration probe does not)
 * that does not loop (the bed's loop).
 */
async function narration(page: Page): Promise<AudioState> {
  return page.evaluate(() => {
    const all = (window as unknown as { __audios: HTMLAudioElement[] }).__audios.filter(
      (a) => a.ontimeupdate && !a.loop,
    );
    const a = all[all.length - 1];
    if (!a) return { currentTime: -1, paused: true, playbackRate: 0, preservesPitch: false };
    return { currentTime: a.currentTime, paused: a.paused, playbackRate: a.playbackRate, preservesPitch: a.preservesPitch };
  });
}

async function expectTime(page: Page, seconds: number, tolerance = 0.6) {
  await expect.poll(async () => (await narration(page)).currentTime).toBeGreaterThan(seconds - tolerance);
  await expect.poll(async () => (await narration(page)).currentTime).toBeLessThan(seconds + tolerance);
}

type BedDeck = { sound: string; currentTime: number; paused: boolean; volume: number; playbackRate: number };

/** The bed's live decks (looping elements the player has not removed), each named by its loop file. */
async function bedDecks(page: Page): Promise<BedDeck[]> {
  return page.evaluate(() =>
    (window as unknown as { __audios: HTMLAudioElement[] }).__audios
      .filter((a) => a.ontimeupdate && a.loop)
      .map((a) => ({
        sound: a.src.includes("test-drift") ? "drift" : a.src.includes("test-low-hum") ? "hum" : a.src,
        currentTime: a.currentTime,
        paused: a.paused,
        volume: a.volume,
        playbackRate: a.playbackRate,
      })),
  );
}

/** The bed's sound heard now: the one playing deck at full volume, or "" for none (or mid-crossfade). */
async function bedPlaying(page: Page): Promise<string> {
  const playing = (await bedDecks(page)).filter((d) => !d.paused);
  return playing.length === 1 && playing[0].volume === 1 ? playing[0].sound : "";
}

async function expectChapter(page: Page, index: number) {
  await expect(page.getByTestId(`chapter-row-${index}`).getByTestId("chapter-expanded")).toBeVisible();
}

async function readyToPlay(page: Page) {
  await expect(page.getByTestId("mini-play-pause")).toHaveAttribute("aria-label", /Play|Pause/);
  await expect(page.getByTestId("mini-play-pause").locator("[role=progressbar]")).toHaveCount(0);
}

/** Opens the library, imports the two files through the Import screen's file input, and lands on the book's river. */
async function importBook(page: Page) {
  await page.goto("/");
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

async function pause(page: Page) {
  if (!(await narration(page)).paused) await page.getByTestId("mini-play-pause").click();
  await expect.poll(async () => (await narration(page)).paused).toBe(true);
}

test.describe("the player", () => {
  let problems: string[] = [];
  test.beforeEach(async ({ page }) => {
    problems = await guard(page);
    await instrument(page);
  });
  test.afterEach(() => {
    expect(problems).toEqual([]);
  });

  test("A1: a book plays, pauses, skips 30 s both ways (clamped) and jumps to a chapter from the river", async ({
    page,
  }) => {
    await importBook(page);
    await expect(page.getByText("Ch.1 — Test Book - 01")).toBeVisible();
    await expect(page.getByText("Ch.2 — Test Book - 02")).toBeVisible();
    await expect(page.getByTestId("chapter-row-0")).toContainText("0:35");
    await expect(page.getByTestId("chapter-row-1")).toContainText("0:40");

    await page.getByTestId("mini-play-pause").click();
    await expect.poll(async () => (await narration(page)).paused).toBe(false);
    await expect(page.getByTestId("mini-play-pause")).toHaveAttribute("aria-label", "Pause");
    await page.getByTestId("mini-play-pause").click();
    await expect.poll(async () => (await narration(page)).paused).toBe(true);
    await expect(page.getByTestId("mini-play-pause")).toHaveAttribute("aria-label", "Play");

    // Back to the start, then +30 within chapter 1, +30 across into chapter 2, and back again.
    await page.getByTestId("mini-back-30").click();
    await expectTime(page, 0);
    await page.getByTestId("mini-fwd-30").click();
    await expectTime(page, 30);
    await page.getByTestId("mini-fwd-30").click();
    await expectChapter(page, 1);
    await expectTime(page, 60 - CH1);
    await page.getByTestId("mini-back-30").click();
    await expectChapter(page, 0);
    await expectTime(page, 30);
    await page.getByTestId("mini-back-30").click();
    await page.getByTestId("mini-back-30").click();
    await expectTime(page, 0);

    // A chapter jump from the river starts that chapter and plays it.
    await page.getByTestId("chapter-1").click();
    await expectChapter(page, 1);
    await expect.poll(async () => (await narration(page)).paused).toBe(false);
    await pause(page);
    await expect.poll(async () => (await narration(page)).currentTime).toBeLessThan(1.5);

    // Forward past the end clamps just short of it.
    await page.getByTestId("mini-fwd-30").click();
    await page.getByTestId("mini-fwd-30").click();
    await expectTime(page, CH2 - 1, 0.3);
    await expectChapter(page, 1);

    // Back to Library: the book is listed with its chapter count and where it resumes.
    await page.getByTestId("top-back").click();
    await expect(page.getByRole("heading", { name: "Library" })).toBeVisible();
    await expect(page.getByText("2 ch · resuming Ch.2")).toBeVisible();
    await expect(page.getByTestId("cover-play-mark")).toBeVisible();
  });

  test("A2: speed runs 0.5x to 3x with pitch kept; the sleep timer offers minutes and End of chapter", async ({
    page,
  }) => {
    await importBook(page);
    await page.getByTestId("open-speed-sleep").click();
    await expect(page.getByRole("heading", { name: "Speed & Sleep" })).toBeVisible();
    for (const [chip, rate] of [
      ["speed-0.5", 0.5],
      ["speed-1.5", 1.5],
      ["speed-3", 3],
      ["speed-1", 1],
    ] as const) {
      await page.getByTestId(chip).click();
      await expect.poll(async () => (await narration(page)).playbackRate).toBe(rate);
      expect((await narration(page)).preservesPitch).toBe(true);
    }
    await page.getByTestId("speed-faster").click();
    await expect.poll(async () => (await narration(page)).playbackRate).toBe(1.1);
    await expect(page.getByTestId("speed-now")).toHaveText("1.1x");

    for (const label of ["15 min", "30 min", "45 min", "End of chapter", "Off"]) {
      await expect(page.getByRole("button", { name: label, exact: true })).toBeVisible();
    }
    await page.getByTestId("sleep-15").click();
    await expect(page.getByTestId("sleep-status")).toHaveText(/Stops in 1[45]:\d\d\./);
    await page.getByTestId("sleep-off").click();
    await expect(page.getByTestId("sleep-status")).toHaveCount(0);

    // End of chapter: 5 s before chapter 1 ends, at 3x, playback stops at the chapter's end, parked on chapter 2.
    await page.getByTestId("speed-3").click();
    await page.getByTestId("sheet-done").click();
    await page.getByTestId("mini-fwd-30").click();
    await expectTime(page, 30);
    await page.getByTestId("open-speed-sleep").click();
    await page.getByTestId("sleep-chapter").click();
    await expect(page.getByTestId("sleep-status")).toHaveText("Stops at the end of Ch.1.");
    await page.getByTestId("sheet-done").click();
    await expect(page.getByText("Sleep timer: stops at the end of this chapter.")).toBeVisible();
    await page.getByTestId("mini-play-pause").click();
    await expectChapter(page, 1);
    await expect.poll(async () => (await narration(page)).paused, { timeout: 10_000 }).toBe(true);
    await expect(page.getByTestId("mini-play-pause")).toHaveAttribute("aria-label", "Play");
    await expectTime(page, 0, 0.3);
    // The speed carries over to the next file.
    expect((await narration(page)).playbackRate).toBe(3);
  });

  test("A2: an End of chapter timer follows a chapter jump instead of stopping at the old chapter's end", async ({
    page,
  }) => {
    await importBook(page);
    // Set on Ch.1 (ends at 35 s), then jump to Ch.2: it plays from Ch.2's start and the timer moves to Ch.2.
    await page.getByTestId("open-speed-sleep").click();
    await page.getByTestId("sleep-chapter").click();
    await expect(page.getByTestId("sleep-status")).toHaveText("Stops at the end of Ch.1.");
    await page.getByTestId("sheet-done").click();
    await page.getByTestId("chapter-1").click();
    await expectChapter(page, 1);
    await expect.poll(async () => (await narration(page)).currentTime).toBeGreaterThan(1.5);
    expect((await narration(page)).paused).toBe(false);
    await expectChapter(page, 1);
    await page.getByTestId("open-speed-sleep").click();
    await expect(page.getByTestId("sleep-status")).toHaveText("Stops at the end of Ch.2.");
    await page.getByTestId("sheet-done").click();
    // A skip back across into Ch.1 follows it back.
    await page.getByTestId("mini-back-30").click();
    await expectChapter(page, 0);
    await page.getByTestId("open-speed-sleep").click();
    await expect(page.getByTestId("sleep-status")).toHaveText("Stops at the end of Ch.1.");
    await page.getByTestId("sheet-done").click();
    await pause(page);
  });

  test("A3: bookmarks are added, named and jumped to", async ({ page }) => {
    await importBook(page);
    await page.getByTestId("mini-fwd-30").click();
    await expectTime(page, 30);
    await page.getByTestId("open-bookmarks").click();
    await expect(page.getByText("No bookmarks yet.")).toBeVisible();
    await page.getByTestId("add-bookmark").click();
    const name = page.getByTestId("bookmark-name");
    await expect(name).toHaveValue("Test Book - 01");
    await name.fill("The storm");
    await name.press("Enter");
    await expect(page.getByText("Ch. 1 — 0:30")).toBeVisible();
    await expect(page.getByText("“The storm”")).toBeVisible();

    await page.getByTestId("sheet-done").click();
    await page.getByTestId("mini-back-30").click();
    await expectTime(page, 0);
    await page.getByTestId("open-bookmarks").click();
    await page.getByTestId("bookmark-jump").click();
    await expectTime(page, 30);
  });

  test("A3: after a reload the book resumes within 1 s of where it stopped", async ({ page }) => {
    await importBook(page);
    await page.getByTestId("open-speed-sleep").click();
    await page.getByTestId("speed-1.5").click();
    await page.getByTestId("sheet-done").click();
    await page.getByTestId("mini-fwd-30").click();
    await expectTime(page, 30);
    await page.getByTestId("mini-play-pause").click();
    await expect.poll(async () => (await narration(page)).currentTime).toBeGreaterThan(31);
    // Close while playing: no pause first, as when the app is swiped away.
    const before = (await narration(page)).currentTime;
    await page.reload();
    await readyToPlay(page);
    await expectChapter(page, 0);
    const after = (await narration(page)).currentTime;
    expect(Math.abs(after - before)).toBeLessThan(1);
    expect((await narration(page)).playbackRate).toBe(1.5);
  });

  test("A4: the Media Session carries the chapter and book and answers play, pause and 30 s skips", async ({
    page,
  }) => {
    await importBook(page);
    const meta = await page.evaluate(() => ({
      title: navigator.mediaSession.metadata?.title,
      artist: navigator.mediaSession.metadata?.artist,
    }));
    expect(meta).toEqual({ title: "Test Book - 01", artist: "Test Book" });

    const call = (action: string) =>
      page.evaluate((a) => {
        const h = (window as unknown as { __ms: Record<string, ((d: object) => void) | null> }).__ms[a];
        h?.({ action: a });
      }, action);
    await call("seekforward");
    await expectTime(page, 30);
    await call("seekforward");
    await expectChapter(page, 1);
    await expectTime(page, 60 - CH1);
    await call("seekbackward");
    await expectChapter(page, 0);
    await expectTime(page, 30);
    await call("play");
    await expect.poll(async () => (await narration(page)).paused).toBe(false);
    await call("pause");
    await expect.poll(async () => (await narration(page)).paused).toBe(true);
  });

  test("A8, A9: the bed loops under the narration, follows play, pause and seek, crossfades at the chapter boundary and ignores the speed", async ({
    page,
  }) => {
    await importBook(page);
    // The playing row's Layer line names its chapter's sound; chapters take the test loops in turn.
    await expect(page.getByTestId("chapter-row-0").getByTestId("layer-line")).toContainText("Layer");
    await expect(page.getByTestId("chapter-row-0").getByTestId("layer-sound")).toHaveText("Low Hum (test loop)");
    await expect(page.getByTestId("chapter-row-1").getByTestId("layer-line")).toHaveCount(0);
    await expect.poll(async () => (await bedDecks(page)).map((d) => d.sound)).toContain("hum");
    expect((await bedDecks(page)).every((d) => d.paused)).toBe(true);

    // Play and pause with the narration.
    await page.getByTestId("mini-play-pause").click();
    await expect.poll(() => bedPlaying(page)).toBe("hum");
    await pause(page);
    await expect.poll(async () => (await bedDecks(page)).every((d) => d.paused)).toBe(true);

    // A seek moves the bed within its 4 s loop: 30 s into the chapter is 2 s into the loop.
    await page.getByTestId("mini-fwd-30").click();
    await expectTime(page, 30);
    await expect
      .poll(async () => (await bedDecks(page)).find((d) => d.sound === "hum")?.currentTime ?? -1)
      .toBeGreaterThan(1.5);
    expect((await bedDecks(page)).find((d) => d.sound === "hum")!.currentTime).toBeLessThan(2.5);

    // A9: the narration at 2x and 3x, the bed still at 1x.
    await page.getByTestId("open-speed-sleep").click();
    for (const [chip, rate] of [
      ["speed-2", 2],
      ["speed-3", 3],
    ] as const) {
      await page.getByTestId(chip).click();
      await expect.poll(async () => (await narration(page)).playbackRate).toBe(rate);
      expect((await bedDecks(page)).every((d) => d.playbackRate === 1)).toBe(true);
    }
    await page.getByTestId("sheet-done").click();

    // A8: at 3x from 30 s, Ch.1 ends in under 2 s. Watch for the crossfade: both decks playing, part volume.
    const fade = page.evaluate(
      () =>
        new Promise<boolean>((resolve) => {
          const started = Date.now();
          const t = setInterval(() => {
            const live = (window as unknown as { __audios: HTMLAudioElement[] }).__audios.filter(
              (a) => a.ontimeupdate && a.loop && !a.paused,
            );
            const mid = live.length === 2 && live.every((a) => a.volume > 0 && a.volume < 1);
            if (mid || Date.now() - started > 15000) {
              clearInterval(t);
              resolve(mid);
            }
          }, 20);
        }),
    );
    await page.getByTestId("mini-play-pause").click();
    expect(await fade).toBe(true);
    await expectChapter(page, 1);
    await expect(page.getByTestId("chapter-row-1").getByTestId("layer-sound")).toHaveText("Drift (test loop)");
    await expect.poll(() => bedPlaying(page), { timeout: 10_000 }).toBe("drift");
    expect((await bedDecks(page)).every((d) => d.playbackRate === 1)).toBe(true);
    await pause(page);
    await expect.poll(async () => (await bedDecks(page)).every((d) => d.paused)).toBe(true);

    // A jump back to Ch.1 while paused brings its sound back.
    await page.getByTestId("chapter-0").click();
    await expectChapter(page, 0);
    await expect.poll(() => bedPlaying(page)).toBe("hum");
    await pause(page);
  });
});
