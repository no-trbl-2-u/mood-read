// A scored book for the e2e (01.4, shared by e2e/mood-card.spec.ts and e2e/a11y.spec.ts), hermetic: imported from
// three local WAV files (one chapter each), its scores seeded on the device the way a finished scoring run stores
// them (src/lib/scoring-store.ts, `scores:<book id>`), so no proxy is involved. With `scenes` (07.2, spec 07 A2) the
// first chapter is 10 s long and holds three scenes (spans 0.4, 0.35, 0.25: 0-4 s, 4-7.5 s, 7.5-10 s), each with its
// own emotions and its own piece (scenePieces: Theme 1, 2, 3), so a scene boundary is crossed in a few seconds of play.
// A "Fits" tap posts the day's verdicts (07.5, src/lib/verdict-sync.ts): both books stub POST /v1/verdicts at the app's
// configured proxy URL (stubVerdicts), so that post stays on the page too.
import { expect, type Page, type Request, type Route } from "@playwright/test";

/** The app's configured scoring proxy (app.json `expo.extra.scoringProxyUrl`). */
export const PROXY = "https://mood-read-proxy.invalid";
const CORS = { "access-control-allow-origin": "*", "access-control-allow-methods": "GET, POST, OPTIONS", "access-control-allow-headers": "content-type" };

/** A stub of POST /v1/verdicts (07.5) that answers 204 like the proxy and keeps each post's request, in order. */
export async function stubVerdicts(page: Page): Promise<Request[]> {
  const posts: Request[] = [];
  await page.route(`${PROXY}/v1/verdicts`, async (route: Route) => {
    const req = route.request();
    if (req.method() === "OPTIONS") return route.fulfill({ status: 204, headers: CORS });
    posts.push(req);
    return route.fulfill({ status: 204, headers: CORS });
  });
  return posts;
}

export function wav(seconds: number, rate = 8000): Buffer {
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

export const SOURCE = "https://summaries.example/mood-book";
const piece = (n: number) => ({ id: `composer-${n}--theme-${n}`, title: `Theme ${n}`, artist: `Composer ${n}`, kind: "score", vocals: "none", moodTags: ["tension"] });
export const EMOTIONS = [
  [
    { emotion: "tension", intensity: 0.8 },
    { emotion: "wonder", intensity: 0.7 },
    { emotion: "dread", intensity: 0.3 },
  ],
  [
    { emotion: "sorrow", intensity: 0.9 },
    { emotion: "calm", intensity: 0.4 },
  ],
  [
    { emotion: "triumph", intensity: 0.95 },
    { emotion: "joy", intensity: 0.6 },
    { emotion: "romance", intensity: 0.2 },
  ],
];

/** The first chapter's scenes with `scenes` on: emotions no other scene, and not the chapter's own chips, show. */
export const SCENES = [
  {
    span: 0.4,
    emotions: [
      { emotion: "wonder", intensity: 0.75 },
      { emotion: "calm", intensity: 0.5 },
    ],
  },
  {
    span: 0.35,
    emotions: [
      { emotion: "tension", intensity: 0.9 },
      { emotion: "dread", intensity: 0.45 },
    ],
  },
  { span: 0.25, emotions: [{ emotion: "triumph", intensity: 0.85 }] },
];

/**
 * Imports the three-chapter book, seeds every chapter's score on the device, reloads; returns the book id. With
 * `scenes`, the first chapter runs 10 s and carries SCENES and one piece per scene.
 */
export async function scoredBook(page: Page, opts: { scenes?: boolean } = {}): Promise<string> {
  await stubVerdicts(page);
  await page.goto("/");
  await page.getByTestId("import-book").click();
  const chooser = page.waitForEvent("filechooser");
  await page.getByTestId("import-files").click();
  await (await chooser).setFiles([
    { name: "Mood Book - 01.wav", mimeType: "audio/wav", buffer: wav(opts.scenes ? 10 : 4) },
    { name: "Mood Book - 02.wav", mimeType: "audio/wav", buffer: wav(4) },
    { name: "Mood Book - 03.wav", mimeType: "audio/wav", buffer: wav(4) },
  ]);
  await expect(page).toHaveURL(/\/book\/[a-z0-9]+$/);
  const id = new URL(page.url()).pathname.split("/").pop()!;
  await page.evaluate(
    ({ id, emotions, pieces, source, scenes }) => {
      const books = JSON.parse(localStorage.getItem("books")!) as { id: string; chapters: { index: number; title: string }[] }[];
      const book = books.find((b) => b.id === id)!;
      const chapters = book.chapters.map((c) => ({
        mood: {
          chapterIndex: c.index,
          chapterTitle: c.title,
          emotions: emotions[c.index],
          ...(scenes && c.index === 0 ? { scenes } : {}),
          sources: [{ url: source, title: "Mood Book summary" }],
          coverage: "scored",
          model: "gpt-5-mini",
          version: "01.2.1",
          scoredAt: 1,
        },
        pieces,
        playlist: {
          chapterIndex: c.index,
          piece: pieces[0].id,
          alternates: [pieces[1].id, pieces[2].id],
          pick: "auto",
          ...(scenes && c.index === 0 ? { scenePieces: pieces.map((p) => p.id) } : {}),
        },
      }));
      localStorage.setItem(`scores:${id}`, JSON.stringify({ jobId: "d".repeat(64), model: "gpt-5-mini", version: "01.2.1", scoredAt: 1, costUsd: 0.04, chapters }));
    },
    { id, emotions: EMOTIONS, pieces: [piece(1), piece(2), piece(3)], source: SOURCE, scenes: opts.scenes ? SCENES : null },
  );
  await page.reload();
  await expect(page.getByTestId("mini-play-pause")).toHaveAttribute("aria-label", /Play|Pause/);
  return id;
}


/** The pieces a scored first chapter names in `unscoredBook`: the second is the one a sorrow or calm seed matches. */
export const KNOWN_PIECES = [
  { id: "composer-1--theme-1", title: "Theme 1", artist: "Composer 1", kind: "score", vocals: "none", moodTags: ["tension"] },
  { id: "composer-2--theme-2", title: "Theme 2", artist: "Composer 2", kind: "score", vocals: "none", moodTags: ["sorrow", "calm"] },
  { id: "composer-3--theme-3", title: "Theme 3", artist: "Composer 3", kind: "ambient", vocals: "none", moodTags: ["joy"] },
];

/**
 * A three-chapter book with nothing scored (07.6, spec 07 A7), imported and reloaded; returns its id. With
 * `tooLittle`, a finished scoring run is stored the way the runner stores one: the first chapter scored (naming
 * KNOWN_PIECES), the second and third with too little written about them, each with its "Unscored" chip. Without
 * it the book was never scored: the band offers "Score this book".
 */
export async function unscoredBook(page: Page, opts: { tooLittle?: boolean } = {}): Promise<string> {
  await stubVerdicts(page);
  await page.goto("/");
  await page.getByTestId("import-book").click();
  const chooser = page.waitForEvent("filechooser");
  await page.getByTestId("import-files").click();
  await (await chooser).setFiles([
    { name: "Quiet Book - 01.wav", mimeType: "audio/wav", buffer: wav(4) },
    { name: "Quiet Book - 02.wav", mimeType: "audio/wav", buffer: wav(4) },
    { name: "Quiet Book - 03.wav", mimeType: "audio/wav", buffer: wav(4) },
  ]);
  await expect(page).toHaveURL(/\/book\/[a-z0-9]+$/);
  const id = new URL(page.url()).pathname.split("/").pop()!;
  if (opts.tooLittle) {
    await page.evaluate(
      ({ id, pieces, source }) => {
        const books = JSON.parse(localStorage.getItem("books")!) as { id: string; chapters: { index: number; title: string }[] }[];
        const book = books.find((b) => b.id === id)!;
        const chapters = book.chapters.map((c) => {
          const scored = c.index === 0;
          return {
            mood: {
              chapterIndex: c.index,
              chapterTitle: c.title,
              emotions: scored ? [{ emotion: "tension", intensity: 0.8 }] : [],
              sources: scored ? [{ url: source, title: "Quiet Book summary" }] : [],
              coverage: scored ? "scored" : "too-little",
              model: "gpt-5-mini",
              version: "01.2.1",
              scoredAt: 1,
            },
            pieces: scored ? pieces : [],
            playlist: scored ? { chapterIndex: 0, piece: pieces[0].id, alternates: [pieces[1].id, pieces[2].id], pick: "auto" } : null,
          };
        });
        localStorage.setItem(`scores:${id}`, JSON.stringify({ jobId: "e".repeat(64), model: "gpt-5-mini", version: "01.2.1", scoredAt: 1, costUsd: 0.04, chapters }));
      },
      { id, pieces: KNOWN_PIECES, source: SOURCE },
    );
  }
  await page.reload();
  await expect(page.getByTestId("mini-play-pause")).toHaveAttribute("aria-label", /Play|Pause/);
  return id;
}
