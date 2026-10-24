// Scoring a book (01.2, spec 01 A13, A15, A19, A22; 01.17, A30) on the web build, hermetic: the scoring proxy is a
// route stub at the app's configured base URL (app.json `expo.extra.scoringProxyUrl`), so nothing leaves localhost.
// The book is imported from two local WAV files; "Score this book" starts from the river's top bar, the band shows
// progress (and, on the first run on this device only, that only the title, author and chapter titles are sent),
// the run completes and its chapters are stored on the device; "Rescore" is in the river's overflow and asks first;
// the monthly cap says plainly it has paused the run; a run left going when the page closes is picked up again.
import { expect, test, type Page, type Route } from "@playwright/test";

import { guard } from "./guard";

const PROXY = "https://mood-read-proxy.invalid";
const JOB = "c".repeat(64);
const CORS = { "access-control-allow-origin": "*", "access-control-allow-methods": "GET, POST, OPTIONS", "access-control-allow-headers": "content-type" };
const NOTE = "Only the title, author and chapter titles are sent.";

function wav(seconds: number, rate = 8000): Buffer {
  const samples = Math.round(seconds * rate);
  const data = Buffer.alloc(samples * 2);
  for (let i = 0; i < samples; i++) data.writeInt16LE(Math.round(Math.sin((2 * Math.PI * 220 * i) / rate) * 800), i * 2);
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

/** Imports a two-chapter book; the first from the empty shelf's "Import a book", a later one from the top bar. */
async function importBook(page: Page, title = "Test Book") {
  await page.goto("/");
  await page.getByTestId(title === "Test Book" ? "import-book" : "import").click();
  const chooser = page.waitForEvent("filechooser");
  await page.getByTestId("import-files").click();
  await (await chooser).setFiles([
    { name: `${title} - 01.wav`, mimeType: "audio/wav", buffer: wav(4) },
    { name: `${title} - 02.wav`, mimeType: "audio/wav", buffer: wav(4) },
  ]);
  await expect(page).toHaveURL(/\/book\/[a-z0-9]+$/);
  await expect(page.getByRole("heading", { name: title })).toBeVisible();
}

type Body = { title: string; author: string; chapters: string[] };

/**
 * A fake proxy: the job runs until `finish()`; then the first chapter is scored and the second has too little written.
 * With `capped`, every run waits at the monthly cap.
 */
async function fakeProxy(page: Page, opts: { capped?: boolean } = {}) {
  const posts: { path: string; body: Body }[] = [];
  let chapters: string[] = [];
  let finished = false;
  let polls = 0;
  const piece = (n: number) => ({ id: `composer-${n}--theme-${n}`, title: `Theme ${n}`, artist: `Composer ${n}`, kind: "score", vocals: "none", moodTags: ["tension"] });
  const done = () => ({
    jobId: JOB,
    state: "done",
    progress: { step: 4, steps: 4, chaptersDone: chapters.length, chapters: chapters.length },
    result: {
      key: JOB,
      model: "gpt-5-mini",
      version: "01.2.1",
      scoredAt: 1,
      costUsd: 0.04,
      chapters: chapters.map((title, index) => ({
        index,
        title,
        mood: {
          chapterIndex: index,
          chapterTitle: title,
          emotions: index === 0 ? [{ emotion: "tension", intensity: 0.8 }] : [],
          sources: index === 0 ? [{ url: "https://summaries.example/test-book", title: "Test Book summary" }] : [],
          coverage: index === 0 ? "scored" : "too-little",
          model: "gpt-5-mini",
          version: "01.2.1",
          scoredAt: 1,
        },
        pieces: index === 0 ? { piece: piece(1), alternates: [piece(2), piece(3)] } : null,
      })),
    },
  });
  const running = (step: number) => ({
    jobId: JOB,
    state: opts.capped ? "capped" : "running",
    progress: { step, steps: 4, chaptersDone: step - 1, chapters: chapters.length },
  });
  await page.route(`${PROXY}/**`, async (route: Route) => {
    const req = route.request();
    const path = new URL(req.url()).pathname;
    if (req.method() === "OPTIONS") return route.fulfill({ status: 204, headers: CORS });
    if (req.method() === "POST") {
      const body = req.postDataJSON() as Body;
      posts.push({ path, body });
      chapters = body.chapters;
      finished = false;
      return route.fulfill({ status: 200, headers: CORS, json: running(1) });
    }
    if (path === `/v1/jobs/${JOB}`) {
      polls += 1;
      return route.fulfill({ status: 200, headers: CORS, json: finished ? done() : running(2) });
    }
    return route.fulfill({ status: 404, headers: CORS, body: "not found" });
  });
  return {
    posts,
    polls: () => polls,
    finish: () => {
      finished = true;
    },
  };
}

test.describe("scoring a book", () => {
  let problems: string[] = [];
  test.beforeEach(async ({ page }) => {
    problems = await guard(page);
  });
  test.afterEach(() => {
    expect(problems).toEqual([]);
  });

  test("A13, A19, A22, A30: Score this book in the top bar sends only the title, author and chapter titles, shows progress, and stores each chapter", async ({ page }) => {
    const proxy = await fakeProxy(page);
    await importBook(page);
    // Nothing tried yet: no "Unscored" chip, no overflow (nothing to rescore), and no note before a run starts.
    await expect(page.getByTestId("unscored-0")).toHaveCount(0);
    await expect(page.getByTestId("river-more")).toHaveCount(0);
    await expect(page.getByText(NOTE)).toHaveCount(0);

    await page.getByTestId("score-book").click();
    await expect(page.getByRole("status").filter({ hasText: /^Scoring \d+%$/ })).toHaveText(/^Scoring (25|50)%$/);
    await expect(page.getByTestId("scoring-band")).toContainText(/[01] of 2 chapters/);
    await expect(page.getByTestId("score-book")).toHaveCount(0);
    expect(proxy.posts).toHaveLength(1);
    expect(proxy.posts[0].path).toBe("/v1/score");
    expect(Object.keys(proxy.posts[0].body)).toEqual(["title", "author", "chapters"]);
    expect(proxy.posts[0].body.title).toBe("Test Book");
    expect(proxy.posts[0].body.chapters).toHaveLength(2);
    // The first run on this device says once what is sent.
    await expect(page.getByTestId("scoring-note")).toHaveText(NOTE);

    proxy.finish();
    // Done: the band is gone and Rescore is in the overflow.
    await expect(page.getByTestId("scoring-band")).toHaveCount(0, { timeout: 15_000 });
    await expect(page.getByTestId("river-more")).toBeVisible();
    // The chapter with too little written about it is unscored, never guessed; the scored one shows no events. A
    // chapter not reached yet shows no chips at all (01.4, A21), so the listener goes to chapter 2 first.
    await expect(page.getByTestId("unscored-1")).toHaveCount(0);
    await page.getByTestId("chapter-1").click();
    await expect(page.getByTestId("unscored-1")).toBeVisible();
    await expect(page.getByTestId("unscored-0")).toHaveCount(0);
    await expect(page.getByText("Unscored", { exact: true })).toHaveCount(1);

    const stored = await page.evaluate(() => {
      const key = Object.keys(localStorage).find((k) => k.startsWith("scores:"));
      return key ? JSON.parse(localStorage.getItem(key)!) : null;
    });
    expect(stored.jobId).toBe("c".repeat(64));
    expect(stored.chapters).toHaveLength(2);
    expect(stored.chapters[0].mood.coverage).toBe("scored");
    expect(stored.chapters[0].playlist).toMatchObject({ piece: "composer-1--theme-1", alternates: ["composer-2--theme-2", "composer-3--theme-3"], pick: "auto" });
    expect(stored.chapters[1].mood.coverage).toBe("too-little");
    expect(stored.chapters[1].playlist).toBeNull();

    // Scored once: after a reload the book reads as scored from the device, with no new request.
    await page.reload();
    await expect(page.getByTestId("river-more")).toBeVisible();
    await expect(page.getByTestId("score-book")).toHaveCount(0);
    expect(proxy.posts).toHaveLength(1);

    // Rescore is explicit: from the overflow, it asks once, inline, and Cancel sends nothing.
    await page.getByTestId("river-more").click();
    await page.getByRole("menuitem", { name: "Rescore" }).click();
    const confirm = page.getByTestId("menu-rescore-confirm");
    await expect(confirm).toContainText("Rescore all 2 chapters?");
    await expect(confirm).toContainText("It uses this month's scoring budget.");
    await page.getByTestId("menu-rescore-no").click();
    await expect(page.getByRole("menu")).toHaveCount(0);
    expect(proxy.posts).toHaveLength(1);

    await page.getByTestId("river-more").click();
    await page.getByRole("menuitem", { name: "Rescore" }).click();
    await page.getByTestId("menu-rescore-yes").click();
    await expect.poll(() => proxy.posts.length).toBe(2);
    expect(proxy.posts[1].path).toBe("/v1/rescore");
    // While it runs the band shows progress again; the note does not come back for a later run.
    await expect(page.getByTestId("scoring-progress")).toBeVisible();
    await expect(page.getByText(NOTE)).toHaveCount(0);
    await expect(page.getByTestId("river-more")).toHaveCount(0);
    await page.waitForLoadState("networkidle");
  });

  test("A30: the first-run note stays with the first run until dismissed, and never shows on a second book", async ({ page }) => {
    await fakeProxy(page);
    await importBook(page);
    await page.getByTestId("score-book").click();
    await expect(page.getByTestId("scoring-note")).toHaveText(NOTE);
    // The same run after a reload still carries it, until it is dismissed.
    await page.reload();
    await expect(page.getByTestId("scoring-note")).toBeVisible();
    await page.getByRole("button", { name: "Dismiss" }).click();
    await expect(page.getByText(NOTE)).toHaveCount(0);
    await page.reload();
    await expect(page.getByTestId("scoring-progress")).toBeVisible();
    await expect(page.getByText(NOTE)).toHaveCount(0);

    await importBook(page, "Other Book");
    await page.getByTestId("score-book").click();
    await expect(page.getByTestId("scoring-progress")).toBeVisible();
    await expect(page.getByText(NOTE)).toHaveCount(0);
    await page.waitForLoadState("networkidle");
  });

  test("A30: the note is not repeated on a second book even when the first never dismissed it", async ({ page }) => {
    await fakeProxy(page);
    await importBook(page);
    await page.getByTestId("score-book").click();
    await expect(page.getByTestId("scoring-note")).toBeVisible();
    await importBook(page, "Other Book");
    await page.getByTestId("score-book").click();
    await expect(page.getByTestId("scoring-progress")).toBeVisible();
    await expect(page.getByText(NOTE)).toHaveCount(0);
    await page.waitForLoadState("networkidle");
  });

  test("A30: when the monthly cap pauses a run, the band says so plainly, keeps its place, and offers no button", async ({ page }) => {
    await fakeProxy(page, { capped: true });
    await importBook(page);
    await page.getByTestId("score-book").click();
    const capped = page.getByRole("status").filter({ hasText: "Waiting" });
    await expect(capped).toContainText("Waiting: this month's scoring budget is spent.");
    await expect(capped).toContainText("Chapters already scored still play.");
    await expect(capped).toContainText("picks up again on its own");
    await expect(page.getByTestId("scoring-band")).toContainText("0 of 2 chapters");
    await expect(page.getByTestId("score-book")).toHaveCount(0);
    await expect(page.getByTestId("scoring-retry")).toHaveCount(0);
    await expect(page.getByTestId("scoring-progress")).toHaveCount(0);
    await expect(page.getByTestId("river-more")).toHaveCount(0);
    await page.waitForLoadState("networkidle");
  });

  test("A15: a run left going when the page closes is picked up again after a reload, and chapters play meanwhile", async ({ page }) => {
    const proxy = await fakeProxy(page);
    await importBook(page);
    await page.getByTestId("score-book").click();
    await expect(page.getByTestId("scoring-progress")).toBeVisible();
    // Playback never waits on scoring: the player is usable while the run goes.
    await expect(page.getByTestId("mini-play-pause")).toBeVisible();

    await page.reload();
    await expect(page.getByTestId("scoring-progress")).toBeVisible();
    const before = proxy.polls();
    await expect.poll(() => proxy.polls(), { timeout: 10_000 }).toBeGreaterThan(before);
    proxy.finish();
    await expect(page.getByTestId("scoring-band")).toHaveCount(0, { timeout: 15_000 });
    await expect(page.getByTestId("river-more")).toBeVisible();
    expect(proxy.posts).toHaveLength(1);
  });
});
