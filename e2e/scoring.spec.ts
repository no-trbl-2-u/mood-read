// Scoring a book (01.2, spec 01 A13, A15, A19, A22) on the web build, hermetic: the scoring proxy is a route stub at
// the app's configured base URL (app.json `expo.extra.scoringProxyUrl`), so nothing leaves localhost. The book is
// imported from two local WAV files; scoring starts from the river, shows progress, completes, and its chapters are
// stored on the device; a run left going when the page closes is picked up again after a reload.
import { expect, test, type Page, type Route } from "@playwright/test";

import { guard } from "./guard";

const PROXY = "https://mood-read-proxy.invalid";
const JOB = "c".repeat(64);
const CORS = { "access-control-allow-origin": "*", "access-control-allow-methods": "GET, POST, OPTIONS", "access-control-allow-headers": "content-type" };

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

async function importBook(page: Page) {
  await page.goto("/");
  await page.getByTestId("import-book").click();
  const chooser = page.waitForEvent("filechooser");
  await page.getByTestId("import-files").click();
  await (await chooser).setFiles([
    { name: "Test Book - 01.wav", mimeType: "audio/wav", buffer: wav(4) },
    { name: "Test Book - 02.wav", mimeType: "audio/wav", buffer: wav(4) },
  ]);
  await expect(page).toHaveURL(/\/book\/[a-z0-9]+$/);
  await expect(page.getByRole("heading", { name: "Test Book" })).toBeVisible();
}

type Body = { title: string; author: string; chapters: string[] };

/** A fake proxy: the job runs until `finish()`; then the first chapter is scored and the second has too little written. */
async function fakeProxy(page: Page) {
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
  const running = (step: number) => ({ jobId: JOB, state: "running", progress: { step, steps: 4, chaptersDone: 0, chapters: chapters.length } });
  await page.route(`${PROXY}/**`, async (route: Route) => {
    const req = route.request();
    const path = new URL(req.url()).pathname;
    if (req.method() === "OPTIONS") return route.fulfill({ status: 204, headers: CORS });
    if (req.method() === "POST") {
      const body = req.postDataJSON() as Body;
      posts.push({ path, body });
      chapters = body.chapters;
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

  test("A13, A19, A22: Score this book sends only the title, author and chapter titles, shows progress, and stores each chapter", async ({ page }) => {
    const proxy = await fakeProxy(page);
    await importBook(page);
    await expect(page.getByText("Only the title, author and chapter titles are sent.")).toBeVisible();
    await expect(page.getByTestId("unscored-0")).toHaveCount(0);

    await page.getByTestId("score-book").click();
    await expect(page.getByTestId("scoring-progress")).toHaveText(/^Scoring \d+%$/);
    expect(proxy.posts).toHaveLength(1);
    expect(proxy.posts[0].path).toBe("/v1/score");
    expect(Object.keys(proxy.posts[0].body)).toEqual(["title", "author", "chapters"]);
    expect(proxy.posts[0].body.title).toBe("Test Book");
    expect(proxy.posts[0].body.chapters).toHaveLength(2);

    proxy.finish();
    await expect(page.getByTestId("scoring-done")).toHaveText("Scored: 1 of 2 chapters", { timeout: 15_000 });
    // The chapter with too little written about it is unscored, never guessed; the scored one shows no events.
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
    await expect(page.getByTestId("scoring-done")).toBeVisible();
    expect(proxy.posts).toHaveLength(1);

    // Rescore is explicit and goes to its own endpoint.
    await page.getByTestId("rescore").click();
    await expect.poll(() => proxy.posts.length).toBe(2);
    expect(proxy.posts[1].path).toBe("/v1/rescore");
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
    await expect(page.getByTestId("scoring-done")).toBeVisible({ timeout: 15_000 });
    expect(proxy.posts).toHaveLength(1);
  });
});
