// A busy scoring proxy (01.25, spec 01 A38) on the web build, hermetic: the proxy is a route stub at the app's
// configured base URL that answers 429 with Retry-After the way proxy/src/http.ts does ({error, reason,
// retryAfterSeconds}). The band says when scoring can start again instead of "unreachable", nothing is sent before
// then (a reload included), and once the time passes the band offers "Score this book" again. The page's clock is
// Playwright's, in UTC, so the band's time reads the same on every machine.
import { expect, test, type Page, type Route } from "@playwright/test";

import { guard } from "./guard";
import { scoredBook, unscoredBook } from "./scored-book";

const PROXY = "https://mood-read-proxy.invalid";
const JOB = "c".repeat(64);
const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET, POST, OPTIONS",
  "access-control-allow-headers": "content-type",
  "access-control-expose-headers": "retry-after",
};
const ERRORS = {
  "client-limit": "too many new books from this connection this hour; try again later",
  "global-limit": "scoring is busy this hour; try again later",
  "rescore-too-soon": "this book was scored recently; it can be rescored later",
} as const;

type Reason = keyof typeof ERRORS;

/** A fake proxy that refuses new runs with a 429 while `refuse` is set, and otherwise starts a run. */
async function busyProxy(page: Page, refuse: { reason: Reason; seconds: number } | null) {
  const posts: string[] = [];
  const state = { refuse };
  await page.route(`${PROXY}/**`, async (route: Route) => {
    const req = route.request();
    const path = new URL(req.url()).pathname;
    if (req.method() === "OPTIONS") return route.fulfill({ status: 204, headers: CORS });
    if (req.method() === "POST") {
      posts.push(path);
      const r = state.refuse;
      if (r) {
        return route.fulfill({
          status: 429,
          headers: { ...CORS, "retry-after": String(r.seconds) },
          json: { error: ERRORS[r.reason], reason: r.reason, retryAfterSeconds: r.seconds },
        });
      }
      return route.fulfill({ status: 200, headers: CORS, json: { jobId: JOB, state: "running", progress: { step: 1, steps: 4, chaptersDone: 0, chapters: 3 } } });
    }
    return route.fulfill({ status: 200, headers: CORS, json: { jobId: JOB, state: "running", progress: { step: 2, steps: 4, chaptersDone: 0, chapters: 3 } } });
  });
  return { posts, allow: () => (state.refuse = null) };
}

/** The 429s the stub answers are expected; anything else the guard collects is still a failure. */
const expected = (p: string) => p === `HTTP 429: ${PROXY}/v1/score` || p === `HTTP 429: ${PROXY}/v1/rescore` || /console error: Failed to load resource: .*429/.test(p);

test.use({ timezoneId: "UTC" });

test.describe("a busy scoring proxy (A38)", () => {
  let problems: string[] = [];
  test.beforeEach(async ({ page }) => {
    problems = await guard(page);
    await page.clock.install({ time: new Date("2026-10-24T15:00:00Z") });
  });
  test.afterEach(() => {
    expect(problems.filter((p) => !expected(p))).toEqual([]);
  });

  test("A38: a 429 reads as try later with its time, nothing is sent before it, and Score this book returns after", async ({ page }) => {
    const proxy = await busyProxy(page, { reason: "client-limit", seconds: 40 * 60 });
    await unscoredBook(page);

    await page.getByTestId("score-book").click();
    const busy = page.getByTestId("scoring-waiting");
    await expect(busy).toHaveText("Scoring is busy. Try again after 3:40 pm.");
    await expect(busy).toHaveAttribute("role", "status");
    await expect(page.getByText(/Couldn't reach the scoring service/)).toHaveCount(0);
    await expect(page.getByTestId("score-book")).toHaveCount(0);
    await expect(page.getByTestId("scoring-retry")).toHaveCount(0);
    expect(proxy.posts).toEqual(["/v1/score"]);

    // The wait lives on the device: after a reload it still waits, and no second request leaves.
    await page.reload();
    await expect(busy).toHaveText("Scoring is busy. Try again after 3:40 pm.");
    await page.waitForLoadState("networkidle");
    expect(proxy.posts).toEqual(["/v1/score"]);

    // Once the time has passed, the band offers Score this book again, and it goes.
    proxy.allow();
    await page.clock.fastForward("41:00");
    await expect(page.getByTestId("score-book")).toBeVisible();
    await expect(busy).toHaveCount(0);
    await page.getByTestId("score-book").click();
    await expect(page.getByTestId("scoring-progress")).toBeVisible();
    expect(proxy.posts).toEqual(["/v1/score", "/v1/score"]);
  });

  test("A38: a rescore too soon says the day, and Rescore again before then sends nothing", async ({ page }) => {
    const proxy = await busyProxy(page, { reason: "rescore-too-soon", seconds: 7 * 86_400 - 3600 });
    await scoredBook(page);

    await page.getByTestId("open-river-menu").click();
    await page.getByTestId("menu-rescore").click();
    await page.getByTestId("rescore-confirm-yes").click();
    const busy = page.getByTestId("scoring-waiting");
    await expect(busy).toHaveText("Rescored recently. Try again on 31 Oct.");
    expect(proxy.posts).toEqual(["/v1/rescore"]);

    // Asked again before the day: it waits, and no request leaves.
    await page.getByTestId("open-river-menu").click();
    await page.getByTestId("menu-rescore").click();
    await page.getByTestId("rescore-confirm-yes").click();
    await expect(busy).toHaveText("Rescored recently. Try again on 31 Oct.");
    await page.waitForLoadState("networkidle");
    expect(proxy.posts).toEqual(["/v1/rescore"]);
  });
});
