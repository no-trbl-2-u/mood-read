// The scorer names catalog pieces only (05.3, spec 05 A3; D8, D13) on the web build, hermetic: a book stored the way a
// scoring run before v2 stored it (pieces the model named freely, e2e/scored-book.ts) opens with the catalog answered
// from the committed snapshot (e2e/guard.ts serveCatalog). The device re-matches it from its stored emotions with no
// request to the scoring proxy: every stored piece becomes a catalog piece, the card names the catalog piece with its
// artist and license, and the old named piece shows only as "In the spirit of", never as a piece or a pick.
import { expect, test } from "@playwright/test";

import { CATALOG_SNAPSHOT, guard, serveCatalog } from "./guard";
import { PROXY, scoredBook } from "./scored-book";

const LICENSE: Record<string, string> = { cc0: "CC0", "public-domain": "Public domain", "cc-by": "CC BY", "cc-by-sa": "CC BY-SA" };
const byId = new Map(CATALOG_SNAPSHOT.pieces.map((p) => [p.id, p]));

test.describe("a book scored before v2, re-matched against the catalog", () => {
  let problems: string[] = [];
  test.beforeEach(async ({ page }) => {
    problems = await guard(page);
  });
  test.afterEach(() => {
    expect(problems).toEqual([]);
  });

  test("A3: its pieces become catalog pieces on the device, with no scoring request; the old piece is the reference", async ({ page }) => {
    const scoring: string[] = [];
    page.on("request", (req) => {
      if (req.url().startsWith(PROXY) && !req.url().endsWith("/v1/verdicts")) scoring.push(req.url());
    });
    await serveCatalog(page);
    const id = await scoredBook(page);

    const card = page.getByTestId("chapter-row-0").getByTestId("mood-card");
    await expect(card.getByTestId("mood-reference")).toHaveText("In the spirit of Theme 1 by Composer 1");
    // 01.11 (A24): a link-out to the reference on each of the five services, inert (never clicked, never a network
    // call) — Mood Read links out, it never plays any of this.
    for (const service of ["spotify", "youtube", "youtube-music", "apple-music", "soundcloud"]) {
      await expect(card.getByTestId(`reference-link-${service}`)).toBeVisible();
    }
    const stored = await page.evaluate((id) => JSON.parse(localStorage.getItem(`scores:${id}`)!).chapters as { playlist: { piece: string; alternates: string[]; pick: string }; pieces: { id: string }[]; reference?: { id: string } }[], id);
    for (const c of stored) {
      for (const pid of [c.playlist.piece, ...c.playlist.alternates]) expect(byId.has(pid), `${pid} is a catalog piece`).toBe(true);
      expect(c.pieces.every((p) => byId.has(p.id))).toBe(true);
      expect(c.reference?.id).toMatch(/^composer-\d--theme-\d$/);
      expect(c.playlist.pick).toBe("auto");
    }

    // The card: the catalog piece's title, artist and license; no old piece among the pieces or the picks.
    const named = byId.get(stored[0].playlist.piece)!;
    const license = `${LICENSE[named.license.id]}${named.license.version ? ` ${named.license.version}` : ""}`;
    await expect(card.getByTestId("mood-piece")).toContainText(named.title);
    await expect(card.getByTestId("mood-piece")).toContainText(named.artist);
    await expect(card.getByTestId("mood-piece")).toContainText(license);
    await expect(card.getByTestId("mood-pick")).not.toContainText("Theme");
    await expect(card.getByTestId("mood-alternates")).not.toContainText("Composer");

    // A pick among the catalog alternates is kept across a reload, and the re-match does not run again over it.
    const alt = stored[0].playlist.alternates[0];
    await card.getByTestId(`pick-${alt}`).click();
    await page.reload();
    await expect(page.getByTestId("chapter-row-0").getByTestId(`pick-${alt}`)).toHaveAttribute("aria-pressed", "true");
    expect(scoring).toEqual([]);
  });
});
