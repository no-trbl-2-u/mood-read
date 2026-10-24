// The player on the web build (01.1, spec 01 A1-A4): a book opened from two local WAV files made here (two
// chapters), then play and pause, +/-30 s with clamps, a chapter jump from the river, speed without pitch change,
// the sleep timer, bookmarks, resume after a reload, and the browser's Media Session; then the bed (01.3, A8, A9)
// under it, the mixer (01.5, A10, A11) setting both, and the soundscapes picked from its Layer chips per book or per
// chapter (01.7, A12). The narration's and the bed's HTMLAudioElements are read directly (page.evaluate) so nothing waits
// on real time it does not need; the bed's are the looping ones.
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

type AudioState = {
  currentTime: number;
  paused: boolean;
  playbackRate: number;
  preservesPitch: boolean;
  volume: number;
};

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
    if (!a) return { currentTime: -1, paused: true, playbackRate: 0, preservesPitch: false, volume: -1 };
    return {
      currentTime: a.currentTime,
      paused: a.paused,
      playbackRate: a.playbackRate,
      preservesPitch: a.preservesPitch,
      volume: a.volume,
    };
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
        sound: /soundscapes\/([a-z-]+)\./.exec(a.src)?.[1] ?? a.src,
        currentTime: a.currentTime,
        paused: a.paused,
        volume: a.volume,
        playbackRate: a.playbackRate,
      })),
  );
}

/** The bed's sound heard now: the one playing deck at the mix's steady level, or "" for none (or mid-crossfade). */
async function bedPlaying(page: Page, level = BED_DEFAULT): Promise<string> {
  const playing = (await bedDecks(page)).filter((d) => !d.paused);
  return playing.length === 1 && Math.abs(playing[0].volume - level) < 1e-6 ? playing[0].sound : "";
}

/** The volume of the bed's deck carrying `sound`, or -1 if none does. */
async function bedVolume(page: Page, sound: string): Promise<number> {
  return (await bedDecks(page)).find((d) => d.sound === sound)?.volume ?? -1;
}

/** Clicks a mixer slider's track at a fraction of its width. */
async function clickSlider(page: Page, testID: string, fraction: number) {
  const slider = page.getByTestId(testID);
  const box = (await slider.boundingBox())!;
  await slider.click({ position: { x: box.width * fraction, y: box.height / 2 } });
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

/** Quiet opening off for the open book (07.3): the bed enters at a chapter's start instead of holding 20 s. */
async function quietOpeningOff(page: Page) {
  await page.getByTestId("mix-quiet-off").click();
  await expect(page.getByTestId("mix-quiet-off")).toHaveAttribute("aria-pressed", "true");
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
    // A28: the times sit in the mini player, beside its bar; the river carries none.
    await expect(page.getByTestId("mini-time")).toHaveText("0:00 / 0:35");
    await expect(page.getByTestId("mini-sleep")).toHaveCount(0);
    await expect(page.getByTestId("chapter-river")).not.toContainText(/\d:\d\d/);

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
    await expect(page.getByTestId("mini-time")).toHaveText("0:30 / 0:35");
    await page.getByTestId("mini-fwd-30").click();
    await expectChapter(page, 1);
    await expectTime(page, 60 - CH1);
    await expect(page.getByTestId("mini-elapsed")).toHaveText(/0:2[45]/);
    await expect(page.getByTestId("mini-length")).toHaveText("0:40");
    await expect(page.getByTestId("chapter-river")).not.toContainText(/\d:\d\d/);
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

    // Back to your shelf: the book is listed with its chapter count and where it resumes.
    // The river's back control is the chevron alone, named for screen readers (design/layouts/DECISION.md, v2).
    await page.getByRole("button", { name: "Back to your shelf" }).click();
    await expect(page.getByRole("heading", { name: "Your shelf" })).toBeVisible();
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
    await expect(page.getByTestId("sleep-15")).toHaveAttribute("aria-pressed", "true");
    // A28: the sheet shows which timer is set but no time; the mini player docked under it reads what is left.
    await expect(page.getByTestId("speed-sleep-sheet")).not.toContainText(/\d:\d\d|Stops/);
    await expect(page.getByTestId("mini-sleep")).toHaveText("Sleep · 15 min");
    await page.getByTestId("sleep-off").click();
    await expect(page.getByTestId("sleep-off")).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByTestId("mini-sleep")).toHaveCount(0);

    // End of chapter: 5 s before chapter 1 ends, at 3x, playback stops at the chapter's end, parked on chapter 2.
    await page.getByTestId("speed-3").click();
    await page.getByTestId("sheet-done").click();
    await page.getByTestId("mini-fwd-30").click();
    await expectTime(page, 30);
    await page.getByTestId("open-speed-sleep").click();
    await page.getByTestId("sleep-chapter").click();
    await expect(page.getByTestId("sleep-chapter")).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByTestId("speed-sleep-sheet")).not.toContainText(/Stops/);
    await page.getByTestId("sheet-done").click();
    await expect(page.getByTestId("mini-sleep")).toHaveText("Sleep · end of chapter");
    await expect(page.getByTestId("chapter-river")).not.toContainText(/sleep/i);
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
    // Set on Ch.1 (ends at 35 s), then jump to Ch.2: it plays on past the old end, so the timer moved to Ch.2.
    await page.getByTestId("open-speed-sleep").click();
    await page.getByTestId("speed-3").click();
    await page.getByTestId("sleep-chapter").click();
    await page.getByTestId("sheet-done").click();
    await page.getByTestId("chapter-1").click();
    await expectChapter(page, 1);
    await expect.poll(async () => (await narration(page)).currentTime).toBeGreaterThan(1.5);
    expect((await narration(page)).paused).toBe(false);
    await expectChapter(page, 1);
    await expect(page.getByTestId("mini-sleep")).toHaveText("Sleep · end of chapter");
    // A skip back across into Ch.1 follows it back: playback stops at Ch.1's end, parked on Ch.2, not at Ch.2's.
    await page.getByTestId("mini-back-30").click();
    await expectChapter(page, 0);
    // The skip back leaves Ch.2's element as the newest one, so the stop is read from the mini player.
    await expect(page.getByTestId("mini-play-pause")).toHaveAttribute("aria-label", "Play", { timeout: 15_000 });
    await expectChapter(page, 1);
    await expect(page.getByTestId("mini-time")).toHaveText("0:00 / 0:40");
    await expect(page.getByTestId("mini-sleep")).toHaveCount(0);
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
    await quietOpeningOff(page);
    // A new book plays Night Wind under every chapter; the playing row's Layer line names it.
    await expect(page.getByTestId("chapter-row-0").getByTestId("layer-line")).toContainText("Layer");
    await expect(page.getByTestId("chapter-row-0").getByTestId("layer-sound")).toHaveText("Night Wind");
    await expect(page.getByTestId("chapter-row-1").getByTestId("layer-line")).toHaveCount(0);
    await expect.poll(async () => (await bedDecks(page)).map((d) => d.sound)).toContain("night-wind");
    // Ch.2 gets its own sound (01.7), so its boundary is heard as a crossfade.
    await page.getByTestId("chapter-1").click();
    await expectChapter(page, 1);
    await page.getByTestId("layer-chapter-only").click();
    await page.getByTestId("layer-chip-tide").click();
    await expect(page.getByTestId("chapter-row-1").getByTestId("layer-sound")).toHaveText("Tide");
    await expect.poll(() => bedPlaying(page), { timeout: 10_000 }).toBe("tide");
    await pause(page);
    await page.getByTestId("chapter-0").click();
    await expectChapter(page, 0);
    await expect.poll(() => bedPlaying(page), { timeout: 10_000 }).toBe("night-wind");
    await pause(page);
    await page.getByTestId("mini-back-30").click();
    await expectTime(page, 0);
    await expect.poll(async () => (await bedDecks(page)).every((d) => d.paused)).toBe(true);
    await expect.poll(async () => (await bedDecks(page)).map((d) => d.sound)).toContain("night-wind");

    // Play and pause with the narration.
    await page.getByTestId("mini-play-pause").click();
    await expect.poll(() => bedPlaying(page)).toBe("night-wind");
    await pause(page);
    await expect.poll(async () => (await bedDecks(page)).every((d) => d.paused)).toBe(true);

    // A seek moves the bed within its 24 s loop: 30 s into the chapter is 6 s into the loop. (Back to the start
    // first: the bed's 1.5 s entry, 07.3, let the narration run on past 0.)
    await page.getByTestId("mini-back-30").click();
    await expectTime(page, 0);
    await page.getByTestId("mini-fwd-30").click();
    await expectTime(page, 30);
    await expect
      .poll(async () => (await bedDecks(page)).find((d) => d.sound === "night-wind")?.currentTime ?? -1)
      .toBeGreaterThan(5.5);
    expect((await bedDecks(page)).find((d) => d.sound === "night-wind")!.currentTime).toBeLessThan(6.5);

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
    await expect(page.getByTestId("chapter-row-1").getByTestId("layer-sound")).toHaveText("Tide");
    await expect.poll(() => bedPlaying(page), { timeout: 10_000 }).toBe("tide");
    expect((await bedDecks(page)).every((d) => d.playbackRate === 1)).toBe(true);
    await pause(page);
    await expect.poll(async () => (await bedDecks(page)).every((d) => d.paused)).toBe(true);

    // A jump back to Ch.1 while paused brings its sound back.
    await page.getByTestId("chapter-0").click();
    await expectChapter(page, 0);
    await expect.poll(() => bedPlaying(page)).toBe("night-wind");
    await pause(page);
  });

  test("A10: balance and master volume set the narration against the layer, saved per book across a reload", async ({
    page,
  }) => {
    await importBook(page);
    await quietOpeningOff(page);
    const row = page.getByTestId("chapter-row-0");
    // Inline in the playing row, with the Layer chips; nothing opens a sheet.
    for (const id of ["mixer", "mix-balance", "mix-master", "mix-duck-on", "mix-duck-off", "layer-line"]) {
      await expect(row.getByTestId(id)).toBeVisible();
    }
    await expect(page.getByTestId("chapter-row-1").getByTestId("mixer")).toHaveCount(0);
    const balance = page.getByRole("slider", { name: "Balance" });
    const master = page.getByRole("slider", { name: "Master volume" });
    await expect(balance).toHaveAttribute("aria-valuetext", "Narration 100%, layer 60%");
    await expect(master).toHaveAttribute("aria-valuenow", "1");
    await expect(page.getByTestId("mix-duck-off")).toHaveAttribute("aria-pressed", "true");

    // The defaults reach both layers.
    await expect.poll(async () => (await narration(page)).volume).toBe(1);
    await expect.poll(() => bedVolume(page, "night-wind")).toBe(BED_DEFAULT);

    // Balance three quarters of the way to the layer: the narration down to 50%, the layer at full.
    await clickSlider(page, "mix-balance", 0.75);
    await expect(balance).toHaveAttribute("aria-valuenow", "0.5");
    await expect(page.getByTestId("mix-balance-value")).toHaveText("Narration 50%, layer 100%");
    await expect.poll(async () => (await narration(page)).volume).toBe(0.5);
    await expect.poll(() => bedVolume(page, "night-wind")).toBe(1);

    // Master at half scales both.
    await clickSlider(page, "mix-master", 0.5);
    await expect(master).toHaveAttribute("aria-valuenow", "0.5");
    await expect.poll(async () => (await narration(page)).volume).toBe(0.25);
    await expect.poll(() => bedVolume(page, "night-wind")).toBe(0.5);

    // The keyboard steps a focused slider by 10%.
    await master.focus();
    await page.keyboard.press("ArrowRight");
    await expect(master).toHaveAttribute("aria-valuenow", "0.6");
    await expect(page.getByTestId("mix-master-value")).toHaveText("60%");
    await expect.poll(() => bedVolume(page, "night-wind")).toBe(0.6);

    // Playing keeps the mix, across the chapter's new file too.
    await page.getByTestId("chapter-1").click();
    await expectChapter(page, 1);
    await expect.poll(async () => (await narration(page)).volume).toBe(0.3);
    await expect.poll(() => bedPlaying(page, 0.6), { timeout: 10_000 }).toBe("night-wind");
    await pause(page);

    // Saved for this book: a reload brings it back.
    await page.reload();
    await readyToPlay(page);
    await expect(page.getByRole("slider", { name: "Balance" })).toHaveAttribute("aria-valuenow", "0.5");
    await expect(page.getByRole("slider", { name: "Master volume" })).toHaveAttribute("aria-valuenow", "0.6");
    await expect.poll(async () => (await narration(page)).volume).toBe(0.3);
    await expect.poll(async () => (await bedDecks(page)).some((d) => d.volume === 0.6)).toBe(true);
  });

  test("A11: duck under voice dips the layer while the narration speaks and brings it back when turned off", async ({
    page,
  }) => {
    await importBook(page);
    await quietOpeningOff(page);
    await page.getByTestId("mix-duck-on").click();
    await expect(page.getByTestId("mix-duck-on")).toHaveAttribute("aria-pressed", "true");
    // Paused, nothing is heard: the layer is level.
    await expect.poll(() => bedVolume(page, "night-wind")).toBe(BED_DEFAULT);
    // The test narration is a steady tone, a narrator who never pauses: the layer dips under it.
    await page.getByTestId("mini-play-pause").click();
    await expect.poll(async () => (await narration(page)).paused).toBe(false);
    // Past the bed's 1.5 s entry from silence (07.3), so the dip read is the duck's.
    await expect.poll(async () => (await narration(page)).currentTime).toBeGreaterThan(2);
    await expect.poll(() => bedVolume(page, "night-wind"), { timeout: 5_000 }).toBeLessThan(BED_DEFAULT * 0.5);
    expect(await bedVolume(page, "night-wind")).toBeGreaterThan(0);
    // Duck off: straight back to the mix's level.
    await page.getByTestId("mix-duck-off").click();
    await expect.poll(() => bedVolume(page, "night-wind")).toBe(BED_DEFAULT);
    await pause(page);
  });

  test("A12: a layer chip sets the book's soundscape, saved across a reload; This chapter only sets one chapter's", async ({
    page,
  }) => {
    await importBook(page);
    await quietOpeningOff(page);
    const row0 = page.getByTestId("chapter-row-0");
    // Inline in the playing row with the mixer: Off and the six, Night Wind on for a new book.
    const names = ["Off", "Rain", "Hearth Fire", "Night Wind", "Tide", "Static Hush", "Low Café"];
    await expect(row0.getByTestId("layer-chips").getByRole("button")).toHaveText(names);
    await expect(row0.getByTestId("layer-chip-night-wind")).toHaveAttribute("aria-pressed", "true");
    await expect(row0.getByTestId("layer-chapter-only")).toHaveAttribute("aria-pressed", "false");

    // Picking Rain moves the bed to the rain loop, crossfading while it plays.
    await page.getByTestId("mini-play-pause").click();
    await expect.poll(() => bedPlaying(page)).toBe("night-wind");
    await row0.getByTestId("layer-chip-rain").click();
    await expect(row0.getByTestId("layer-chip-rain")).toHaveAttribute("aria-pressed", "true");
    await expect(row0.getByTestId("layer-sound")).toHaveText("Rain");
    await expect.poll(() => bedPlaying(page), { timeout: 10_000 }).toBe("rain");
    // Off silences the bed; a chip brings it back.
    await row0.getByTestId("layer-chip-off").click();
    await expect.poll(async () => (await bedDecks(page)).every((d) => d.paused), { timeout: 10_000 }).toBe(true);
    await row0.getByTestId("layer-chip-hearth-fire").click();
    await expect.poll(() => bedPlaying(page), { timeout: 10_000 }).toBe("hearth-fire");

    // The book's pick covers every chapter.
    await page.getByTestId("chapter-1").click();
    await expectChapter(page, 1);
    const row1 = page.getByTestId("chapter-row-1");
    await expect(row1.getByTestId("layer-sound")).toHaveText("Hearth Fire");
    await expect.poll(() => bedPlaying(page), { timeout: 10_000 }).toBe("hearth-fire");

    // This chapter only: Ch.2 gets Low Café; Ch.1 keeps the book's Hearth Fire.
    await row1.getByTestId("layer-chapter-only").click();
    await expect(row1.getByTestId("layer-chapter-only")).toHaveAttribute("aria-pressed", "true");
    await row1.getByTestId("layer-chip-low-cafe").click();
    await expect.poll(() => bedPlaying(page), { timeout: 10_000 }).toBe("low-cafe");
    await pause(page);
    await page.getByTestId("chapter-0").click();
    await expectChapter(page, 0);
    await expect(row0.getByTestId("layer-sound")).toHaveText("Hearth Fire");
    await expect(row0.getByTestId("layer-chapter-only")).toHaveAttribute("aria-pressed", "false");
    await expect.poll(() => bedPlaying(page), { timeout: 10_000 }).toBe("hearth-fire");
    await pause(page);

    // Saved for this book: after a reload Ch.1 plays Hearth Fire and Ch.2 its own Low Café.
    await page.reload();
    await readyToPlay(page);
    await expect(row0.getByTestId("layer-chip-hearth-fire")).toHaveAttribute("aria-pressed", "true");
    await expect.poll(async () => (await bedDecks(page)).map((d) => d.sound)).toContain("hearth-fire");
    await page.getByTestId("chapter-1").click();
    await expectChapter(page, 1);
    await expect(row1.getByTestId("layer-sound")).toHaveText("Low Café");
    await expect.poll(() => bedPlaying(page), { timeout: 10_000 }).toBe("low-cafe");

    // This chapter only off: Ch.2 follows the book's Hearth Fire again.
    await row1.getByTestId("layer-chapter-only").click();
    await expect(row1.getByTestId("layer-sound")).toHaveText("Hearth Fire");
    await expect.poll(() => bedPlaying(page), { timeout: 10_000 }).toBe("hearth-fire");
    await pause(page);
  });

  test("A3, A4: quiet opening holds the bed 20 s into every chapter then ramps it in; a seek ramps it from silence; the book's end and a sleep timer fade it out", async ({
    page,
  }) => {
    test.setTimeout(120_000);
    await importBook(page);
    // On by default, in the mixer beside duck.
    await expect(page.getByTestId("mix-quiet-on")).toHaveAttribute("aria-pressed", "true");
    // At 3x the 20 s hold passes in under 7 s; the bed stays at 1x and its ramps run on the wall clock.
    await page.getByTestId("open-speed-sleep").click();
    await page.getByTestId("speed-3").click();
    await page.getByTestId("sheet-done").click();

    // A4: from Ch.1's start the bed plays silent through the hold, ramps in past 20 s, then holds the mix's level.
    let rec = recordGain(page, { untilTime: 26 });
    await page.getByTestId("mini-play-pause").click();
    let samples = await rec;
    const hold = samples.filter((s) => s.time > 0.5 && s.time < 19.5);
    expect(hold.length).toBeGreaterThan(10);
    expect(hold.every((s) => s.bedPlaying && s.volume === 0)).toBe(true);
    expect(samples.some((s) => s.time > 20 && s.time < 22 && s.volume > 0 && s.volume < BED_DEFAULT)).toBe(true);
    const after = samples.filter((s) => s.time > 23);
    expect(after.length).toBeGreaterThan(0);
    expect(after.every((s) => Math.abs(s.volume - BED_DEFAULT) < 1e-6)).toBe(true);
    await pause(page);

    // Every chapter holds: a jump to Ch.2's start is silent again.
    await page.getByTestId("chapter-1").click();
    await expectChapter(page, 1);
    await expect.poll(async () => (await narration(page)).currentTime).toBeGreaterThan(1);
    expect(await bedLevel(page)).toEqual({ playing: true, volume: 0 });

    // A4, A3: a seek past the hold skips it, the bed ramping in from silence; at the book's end (10 s on at 3x) it
    // plays on after the narration stops, fading out, and then stops.
    rec = recordGain(page, { untilBedPaused: true, maxMs: 15_000 });
    await page.getByTestId("mini-fwd-30").click();
    samples = await rec;
    const ramp = samples.findIndex((s) => s.time > 30 && s.volume > 0 && s.volume < BED_DEFAULT);
    const full = samples.findIndex((s) => Math.abs(s.volume - BED_DEFAULT) < 1e-6);
    expect(ramp).toBeGreaterThanOrEqual(0);
    expect(full).toBeGreaterThan(ramp);
    const tail = samples.filter((s) => s.narrationPaused && s.bedPlaying);
    expect(tail.some((s) => s.volume > 0 && s.volume < BED_DEFAULT)).toBe(true);
    expect(samples.at(-1)!.bedPlaying).toBe(false);

    // A seek back to the chapter's start brings the hold back.
    await page.getByTestId("chapter-1").click();
    await expect.poll(async () => (await narration(page)).currentTime).toBeGreaterThan(1);
    expect(await bedLevel(page)).toEqual({ playing: true, volume: 0 });
    await pause(page);

    // A4: off, the bed enters at once, ramped over 1.5 s, long before 20 s.
    await page.getByTestId("chapter-row-1").getByTestId("mix-quiet-off").click();
    await expect(page.getByTestId("mix-quiet-off")).toHaveAttribute("aria-pressed", "true");
    rec = recordGain(page, { untilTime: 10 });
    await page.getByTestId("chapter-1").click();
    samples = await rec;
    expect(samples.some((s) => s.time < 8 && s.volume > 0 && s.volume < BED_DEFAULT)).toBe(true);
    expect(samples.some((s) => s.time < 8 && Math.abs(s.volume - BED_DEFAULT) < 1e-6)).toBe(true);
    await pause(page);

    // A3: an End of chapter timer on the 35 s Ch.1 fades the bed over the whole chapter (shorter than 60 s), and
    // the narration stops with the bed already silent.
    await page.getByTestId("chapter-0").click();
    await expectChapter(page, 0);
    // The jump loads Ch.1's file and plays it; pause once it does.
    await expect.poll(async () => (await narration(page)).currentTime).toBeGreaterThan(0.5);
    await pause(page);
    await page.getByTestId("open-speed-sleep").click();
    await page.getByTestId("sleep-chapter").click();
    await page.getByTestId("sheet-done").click();
    await page.getByTestId("mini-back-30").click();
    await expectTime(page, 0);
    await page.getByTestId("mini-fwd-30").click();
    await expectTime(page, 30);
    rec = recordGain(page, { untilBedPaused: true, maxMs: 15_000 });
    await page.getByTestId("mini-play-pause").click();
    samples = await rec;
    const fading = samples.filter((s) => s.bedPlaying && s.time > 31 && !s.narrationPaused);
    expect(fading.length).toBeGreaterThan(0);
    expect(fading.every((s) => s.volume < BED_DEFAULT * 0.3)).toBe(true);
    const lastHeard = samples.filter((s) => s.bedPlaying).at(-1)!;
    expect(lastHeard.volume).toBeLessThan(0.02);
    await expectChapter(page, 1);
    await expect(page.getByTestId("mini-play-pause")).toHaveAttribute("aria-label", "Play");
  });
});

type GainSample = { time: number; narrationPaused: boolean; bedPlaying: boolean; volume: number };

/**
 * The bed's gain readout over time (07.3): every 40 ms, the newest narration element's time and play state, and the
 * loudest playing bed deck's volume (0 with none playing). Stops once the narration reaches `untilTime` seconds into
 * its file, once every bed deck has stopped, or after `maxMs`.
 */
function recordGain(
  page: Page,
  opts: { untilTime?: number; untilBedPaused?: boolean; maxMs?: number },
): Promise<GainSample[]> {
  return page.evaluate(
    ({ untilTime, untilBedPaused, maxMs }) =>
      new Promise<GainSample[]>((resolve) => {
        const out: GainSample[] = [];
        const started = Date.now();
        let heard = false;
        const t = setInterval(() => {
          const all = (window as unknown as { __audios: HTMLAudioElement[] }).__audios.filter((a) => a.ontimeupdate);
          const narr = all.filter((a) => !a.loop).at(-1);
          const live = all.filter((a) => a.loop && !a.paused);
          const sample = {
            time: narr?.currentTime ?? -1,
            narrationPaused: narr?.paused ?? true,
            bedPlaying: live.length > 0,
            volume: live.reduce((v, a) => Math.max(v, a.volume), 0),
          };
          out.push(sample);
          heard ||= sample.bedPlaying;
          const done =
            (untilTime !== undefined && sample.time >= untilTime) ||
            (untilBedPaused && heard && !sample.bedPlaying) ||
            Date.now() - started > (maxMs ?? 20_000);
          if (done) {
            clearInterval(t);
            resolve(out);
          }
        }, 40);
      }),
    opts,
  );
}

/** Whether the bed plays now, and the loudest playing deck's volume. */
async function bedLevel(page: Page): Promise<{ playing: boolean; volume: number }> {
  const live = (await bedDecks(page)).filter((d) => !d.paused);
  return { playing: live.length > 0, volume: live.reduce((v, d) => Math.max(v, d.volume), 0) };
}
