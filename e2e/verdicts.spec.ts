// The listener's say as daily aggregates (07.5, spec 07 A6) on the web build, hermetic: the scoring proxy's
// POST /v1/verdicts is a route stub at the app's configured base URL (e2e/scored-book.ts stubVerdicts), so nothing
// leaves localhost. "Share what fits" toggles in Settings and survives a reload; with it on, a kept verdict sends one
// batch whose rows hold only pieceId, emotions and verdict, and nothing more goes that day, even after a reload; with
// it off, nothing is sent at all. The first "Fits" says once what is shared.
import { expect, test, type Page } from "@playwright/test";

import { guard } from "./guard";
import { PROXY, scoredBook, stubVerdicts } from "./scored-book";

/** Every request the page makes to the proxy, of any kind. */
function proxyRequests(page: Page): string[] {
  const seen: string[] = [];
  page.on("request", (r) => {
    if (r.url().startsWith(PROXY)) seen.push(`${r.method()} ${new URL(r.url()).pathname}`);
  });
  return seen;
}

/** The device's sending record: the day it last posted and the sent markers. */
const syncState = (page: Page) => page.evaluate(() => JSON.parse(localStorage.getItem("verdict-sync") ?? "null") as { day: string; sent: Record<string, string[]> } | null);

test.describe("sharing what fits", () => {
  let problems: string[] = [];
  test.beforeEach(async ({ page }) => {
    problems = await guard(page);
  });
  test.afterEach(() => {
    expect(problems).toEqual([]);
  });

  test("A6: the Share what fits row is on by default, toggles, and stays off after a reload", async ({ page }) => {
    await page.goto("/settings");
    const share = page.getByRole("switch", { name: "Share what fits" });
    await expect(share).toHaveAttribute("aria-checked", "true");
    await expect(page.getByText(/No book, chapter, device or time/)).toBeVisible();
    await share.click();
    await expect(share).toHaveAttribute("aria-checked", "false");
    await page.reload();
    await expect(page.getByRole("switch", { name: "Share what fits" })).toHaveAttribute("aria-checked", "false");
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem("settings")!).shareVerdicts)).toBe(false);
    await page.getByRole("switch", { name: "Share what fits" }).click();
    await page.reload();
    await expect(page.getByRole("switch", { name: "Share what fits" })).toHaveAttribute("aria-checked", "true");
  });

  test("A6: with it on, a kept verdict sends one batch of pieceId, emotions and verdict only, and not again that day", async ({ page }) => {
    const id = await scoredBook(page);
    const posts = await stubVerdicts(page);
    const seen = proxyRequests(page);

    const row0 = page.getByTestId("chapter-row-0");
    await row0.getByTestId("verdict-fits").click();
    await expect(row0.getByTestId("verdict-fits")).toHaveAttribute("aria-pressed", "true");
    await expect.poll(() => posts.length).toBe(1);

    const post = posts[0];
    expect(post.method()).toBe("POST");
    expect(new URL(post.url()).pathname).toBe("/v1/verdicts");
    const body = post.postDataJSON() as { rows: Record<string, unknown>[] };
    expect(Object.keys(body)).toEqual(["rows"]);
    // The chapter's emotion names in the fixed set's order (tension, wonder, dread), never its intensities.
    expect(body.rows).toEqual([{ pieceId: "composer-1--theme-1", emotions: ["tension", "wonder", "dread"], verdict: "fits" }]);
    for (const r of body.rows) expect(Object.keys(r).sort()).toEqual(["emotions", "pieceId", "verdict"]);
    const raw = post.postData() ?? "";
    expect(raw).not.toContain(id);
    expect(raw).not.toMatch(/chapter|book|device|time|"at"/i);
    // No identifying header: the app sets only the content type (the browser adds its own, as any request has).
    const headers = await post.allHeaders();
    expect(headers["content-type"]).toBe("application/json");
    expect(Object.keys(headers).filter((h) => /^x-|authorization|cookie/i.test(h))).toEqual([]);

    // The first "Fits" says once what is shared, politely, with a 44 px dismiss.
    const toast = page.getByTestId("verdicts-shared");
    await expect(toast).toHaveAttribute("role", "status");
    await expect(toast).toContainText("no book, chapter, device or time");
    await page.getByTestId("verdicts-shared-dismiss").click();
    await expect(toast).toHaveCount(0);

    // The device keeps the day (a date, no time) and the sent marker; no more posts that day.
    const kept = await syncState(page);
    expect(kept?.day).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(kept?.sent[id]).toEqual(["0|fits|composer-1--theme-1"]);

    await page.getByTestId("chapter-1").click();
    await page.getByTestId("chapter-row-1").getByTestId("verdict-misfit").click();
    await expect(page.getByTestId("chapter-row-1").getByTestId("verdict-misfit")).toHaveAttribute("aria-pressed", "true");
    await page.reload();
    await expect(page.getByTestId("mini-play-pause")).toHaveAttribute("aria-label", /Play|Pause/);
    // Chapter 2 plays after the reload: changing its verdict to Fits is a new verdict, but today is spent.
    await page.getByTestId("chapter-row-1").getByTestId("verdict-fits").click();
    await expect(page.getByTestId("chapter-row-1").getByTestId("verdict-fits")).toHaveAttribute("aria-pressed", "true");
    await page.waitForTimeout(500);
    expect(posts).toHaveLength(1);
    expect(seen.filter((r) => !r.startsWith("OPTIONS"))).toEqual(["POST /v1/verdicts"]);
    // The notice was said once and is not said again.
    await expect(page.getByTestId("verdicts-shared")).toHaveCount(0);
  });

  test("A6: with it off, nothing is sent, and no notice shows", async ({ page }) => {
    await page.goto("/settings");
    await page.getByRole("switch", { name: "Share what fits" }).click();
    await expect(page.getByRole("switch", { name: "Share what fits" })).toHaveAttribute("aria-checked", "false");
    await scoredBook(page);
    const posts = await stubVerdicts(page);
    const seen = proxyRequests(page);

    const row0 = page.getByTestId("chapter-row-0");
    await row0.getByTestId("verdict-fits").click();
    await expect(row0.getByTestId("verdict-fits")).toHaveAttribute("aria-pressed", "true");
    await page.getByTestId("chapter-1").click();
    await page.getByTestId("chapter-row-1").getByTestId("verdict-misfit").click();
    await page.reload();
    await expect(page.getByTestId("mini-play-pause")).toHaveAttribute("aria-label", /Play|Pause/);
    await page.waitForTimeout(500);
    expect(posts).toHaveLength(0);
    expect(seen).toEqual([]);
    await expect(page.getByTestId("verdicts-shared")).toHaveCount(0);
    expect(await syncState(page)).toBeNull();
    // The verdicts stay on the device either way.
    expect(await page.evaluate(() => Object.keys(localStorage).filter((k) => k.startsWith("verdicts:")).length)).toBe(1);
  });
});
