// The chapter mood card (01.4, spec 01 A16, A21) on the web build, hermetic: a book is imported from three local WAV
// files (one chapter each) and its scores are seeded on the device the way a finished scoring run stores them
// (src/lib/scoring-store.ts, `scores:<book id>`), so no proxy is involved. A chapter not yet reached shows no
// emotions and does not expand; the playing chapter shows its emotions, named piece and alternates; a picked
// alternate is saved across a reload, and Auto returns to auto. 07.4 (spec 07 A5): "Fits" and "Doesn't fit" keep a
// verdict per chapter across a reload, and "Doesn't fit" offers the chapter's other pieces in place. 07.2 (spec 07
// A2): a chapter with three scenes shows the playing scene's emotions in a band that changes as the clock crosses a
// boundary, nothing of a scene not yet reached, the earlier scene again on a seek back; the bed logs each scene's
// piece (until 01.10 plays pieces), and a chapter-wide pick is the piece for every scene.
import { expect, test, type Page } from "@playwright/test";

import { guard } from "./guard";
import { EMOTIONS, scoredBook, SOURCE } from "./scored-book";

/** The bed's scene lines (src/lib/bed.ts sceneLogLine) as the page logs them. */
function sceneLog(page: Page): string[] {
  const lines: string[] = [];
  page.on("console", (msg) => {
    if (msg.text().startsWith("bed scene:")) lines.push(msg.text());
  });
  return lines;
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
    // One labelling model (06.5): the sticker is read as it is shown, with no separate name.
    await expect(card.getByTestId("emotion-tension")).toHaveText("Tension 80%");
    await expect(card.getByTestId("emotion-tension")).not.toHaveAttribute("aria-label", /.*/);
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

  test("A5: Fits and Doesn't fit keep a verdict per chapter across a reload; Doesn't fit offers the other pieces in place", async ({ page }) => {
    const id = await scoredBook(page);
    const storedVerdicts = () =>
      page.evaluate((id) => {
        const raw = localStorage.getItem(`verdicts:${id}`);
        return raw ? (JSON.parse(raw) as { chapterIndex: number; pieceId: string; verdict: string }[]).map(({ chapterIndex, pieceId, verdict }) => ({ chapterIndex, pieceId, verdict })) : [];
      }, id);

    // Chapter 1: Theme 1 plays (Auto). "Fits" lights; nothing else opens.
    const row0 = page.getByTestId("chapter-row-0");
    await expect(row0.getByTestId("mood-verdict")).toContainText("Does Theme 1 fit this chapter?");
    const fits0 = row0.getByTestId("verdict-fits");
    await expect(fits0).toHaveAttribute("aria-label", "Fits: Theme 1 suits this chapter");
    await expect(fits0).toHaveAttribute("aria-pressed", "false");
    await fits0.click();
    await expect(fits0).toHaveAttribute("aria-pressed", "true");
    await expect(row0.getByTestId("verdict-misfit")).toHaveAttribute("aria-pressed", "false");
    await expect(row0.getByTestId("mood-misfit-offers")).toHaveCount(0);

    // Chapter 2: "Doesn't fit" lights and offers Theme 2 and Theme 3 right there.
    await page.getByTestId("chapter-1").click();
    const row1 = page.getByTestId("chapter-row-1");
    const misfit1 = row1.getByTestId("verdict-misfit");
    await expect(misfit1).toHaveAttribute("aria-label", "Doesn't fit: Theme 1 does not suit this chapter");
    await misfit1.click();
    await expect(misfit1).toHaveAttribute("aria-pressed", "true");
    await expect(row1.getByTestId("verdict-fits")).toHaveAttribute("aria-pressed", "false");
    const offers = row1.getByTestId("mood-misfit-offers");
    await expect(offers).toContainText("Try one of these instead");
    await expect(offers.getByTestId("offer-composer-2--theme-2")).toHaveAttribute("aria-label", "Try Theme 2 by Composer 2 for this chapter instead");
    await expect(offers.getByTestId("offer-composer-3--theme-3")).toBeVisible();
    await expect(offers.getByTestId("offer-composer-1--theme-1")).toHaveCount(0);
    expect(await storedVerdicts()).toEqual([
      { chapterIndex: 0, pieceId: "composer-1--theme-1", verdict: "fits" },
      { chapterIndex: 1, pieceId: "composer-1--theme-1", verdict: "misfit" },
    ]);

    // Kept per chapter across a reload.
    await page.reload();
    await page.getByTestId("chapter-0").click();
    await expect(page.getByTestId("chapter-row-0").getByTestId("verdict-fits")).toHaveAttribute("aria-pressed", "true");
    await page.getByTestId("chapter-1").click();
    const again = page.getByTestId("chapter-row-1");
    await expect(again.getByTestId("verdict-misfit")).toHaveAttribute("aria-pressed", "true");
    await expect(again.getByTestId("mood-misfit-offers")).toBeVisible();

    // The offer is a pick: Theme 2 plays for the chapter now, and has no verdict yet; the misfit on Theme 1 stays kept.
    await again.getByTestId("offer-composer-2--theme-2").click();
    await expect(again.getByTestId("pick-composer-2--theme-2")).toHaveAttribute("aria-pressed", "true");
    expect(await storedPick(page, id, 1)).toBe("composer-2--theme-2");
    await expect(again.getByTestId("mood-verdict")).toContainText("Does Theme 2 fit this chapter?");
    await expect(again.getByTestId("verdict-misfit")).toHaveAttribute("aria-pressed", "false");
    await expect(again.getByTestId("mood-misfit-offers")).toHaveCount(0);
    expect(await storedVerdicts()).toContainEqual({ chapterIndex: 1, pieceId: "composer-1--theme-1", verdict: "misfit" });

    // Tapping the lit target again takes the verdict back.
    await page.getByTestId("chapter-0").click();
    const fits = page.getByTestId("chapter-row-0").getByTestId("verdict-fits");
    await fits.click();
    await expect(fits).toHaveAttribute("aria-pressed", "false");
    expect(await storedVerdicts()).toEqual([{ chapterIndex: 1, pieceId: "composer-1--theme-1", verdict: "misfit" }]);
  });

  test("A2: the band follows the playing scene, shows nothing of a scene not reached, and a pick plays for every scene", async ({ page }) => {
    const log = sceneLog(page);
    await scoredBook(page, { scenes: true });
    const card = page.getByTestId("chapter-row-0").getByTestId("mood-card");
    const band = card.getByTestId("mood-scene");
    const play = page.getByTestId("mini-play-pause");
    const pause = async () => {
      if ((await play.getAttribute("aria-label")) === "Pause") await play.click();
      await expect(play).toHaveAttribute("aria-label", "Play");
    };
    const sceneChips = (emotion: string) => page.getByTestId(`scene-emotion-${emotion}`);

    // The first scene, under the chapter's own chips; nothing of the later scenes anywhere on the page.
    await expect(card.getByTestId("mood-emotions")).toContainText("Tension 80%");
    await expect(band).toContainText("In this scene");
    await expect(band.getByTestId("mood-scene-emotions")).toHaveAttribute("aria-label", "Emotions in the playing scene");
    await expect(sceneChips("wonder")).toHaveText("Wonder 75%");
    await expect(sceneChips("calm")).toHaveText("Calm 50%");
    for (const e of ["tension", "dread", "triumph"]) await expect(sceneChips(e)).toHaveCount(0);
    await expect(page.getByText("Triumph 85%")).toHaveCount(0);
    await expect.poll(() => log.some((l) => l.includes("chapter=0 scene=0 piece=composer-1--theme-1 direction=enter"))).toBe(true);

    // Play through the boundary at 4 s: the band moves to the second scene, and its piece crosses in.
    await play.click();
    await expect(sceneChips("tension")).toHaveText("Tension 90%", { timeout: 15_000 });
    await pause();
    await expect(sceneChips("dread")).toHaveText("Dread 45%");
    await expect(sceneChips("wonder")).toHaveCount(0);
    await expect(sceneChips("triumph")).toHaveCount(0);
    await expect(page.getByText("Triumph 85%")).toHaveCount(0);
    expect(log).toContainEqual("bed scene: chapter=0 scene=1 piece=composer-2--theme-2 direction=on crossfade=true");

    // A seek back crosses the other way: the first scene again.
    await page.getByTestId("mini-back-30").click();
    await expect(sceneChips("wonder")).toHaveText("Wonder 75%");
    await expect(sceneChips("tension")).toHaveCount(0);
    await expect.poll(() => log.some((l) => /^bed scene: chapter=0 scene=0 piece=composer-1--theme-1 direction=back/.test(l))).toBe(true);

    // A chapter-wide pick is the piece for every scene, and the band still follows the scenes.
    const before = log.length;
    await card.getByTestId("pick-composer-3--theme-3").click();
    await expect.poll(() => log.slice(before).some((l) => l.includes("scene=0 piece=composer-3--theme-3"))).toBe(true);
    await play.click();
    await expect(sceneChips("tension")).toHaveText("Tension 90%", { timeout: 15_000 });
    await expect(sceneChips("triumph")).toHaveText("Triumph 85%", { timeout: 15_000 });
    await pause();
    const picked = log.slice(before).filter((l) => l.includes("chapter=0 "));
    expect(picked.map((l) => l.match(/scene=(\d)/)![1])).toEqual(expect.arrayContaining(["0", "1", "2"]));
    for (const l of picked) expect(l).toContain("piece=composer-3--theme-3");
    // The same piece plays on across each boundary: nothing crossfades at a scene change under a pick.
    for (const l of picked.filter((l) => / direction=on /.test(l) && !/scene=0 /.test(l))) expect(l).toContain("crossfade=false");
  });
});
