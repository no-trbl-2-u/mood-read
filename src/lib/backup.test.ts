import assert from "node:assert/strict";
import { test } from "node:test";

import {
  BACKED_UP,
  BACKUP_VERSION,
  backupFileName,
  backupText,
  chaptersFor,
  exportLibrary,
  importLibrary,
  matchBooks,
  parseBackup,
  type BackupBook,
  type RestoreDeps,
} from "./backup.ts";
import { createLibraryStore, PER_BOOK_KEYS, type Kv } from "./library-store.ts";
import { createReachedStore } from "./reached.ts";
import { createScoringStore } from "./scoring-store.ts";
import type { Book, BookScores, ChapterScore } from "./types.ts";
import { createVerdictStore } from "./verdict-store.ts";

function memoryKv(): Kv & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => void data.set(k, v),
    removeItem: (k) => void data.delete(k),
  };
}

function book(id: string, over: Partial<Book> = {}): Book {
  return {
    id,
    title: "The Storm Book",
    author: "A. Author",
    narrator: "N. Reader",
    cover: `file:///data/user/0/app/files/books/${id}/cover.jpg`,
    files: [
      { ref: `file:///data/user/0/app/files/books/${id}/000.mp3`, name: "Storm - 01.mp3", duration: 60 },
      { ref: `file:///data/user/0/app/files/books/${id}/001.mp3`, name: "Storm - 02.mp3", duration: 60 },
    ],
    chapters: [
      { bookId: id, index: 0, title: "One", fileIndex: 0, start: 0, end: 60 },
      { bookId: id, index: 1, title: "Two", fileIndex: 1, start: 60, end: 120 },
    ],
    duration: 120,
    addedAt: 1,
    lastPlayedAt: 5,
    source: { kind: "import" },
    onDevice: true,
    ...over,
  };
}

const scores = (pick: string): BookScores => ({
  jobId: "job-1",
  model: "m",
  version: "1",
  scoredAt: 2,
  costUsd: 0,
  chapters: [
    {
      mood: { chapterIndex: 0, chapterTitle: "One", emotions: [{ emotion: "tension", intensity: 0.8 }], coverage: "scored", sources: [] },
      pieces: [],
      playlist: { chapterIndex: 0, piece: "p1", alternates: ["p2"], pick },
    },
  ],
} as unknown as BookScores);

const seed: ChapterScore = {
  mood: { chapterIndex: 1, chapterTitle: "Two", emotions: [{ emotion: "calm", intensity: 0.5 }], coverage: "listener", sources: [] },
  pieces: [],
  playlist: null,
} as unknown as ChapterScore;

/** A device: the stores the app binds, over one key-value backend. */
function device(books: Book[]) {
  const kv = memoryKv();
  kv.setItem("books", JSON.stringify(books));
  const library = createLibraryStore(kv, () => 10, () => "mark");
  const scoring = createScoringStore(kv);
  const reached = createReachedStore(kv);
  const verdicts = createVerdictStore(kv, () => 3);
  const deps: RestoreDeps = {
    kv,
    setChapters: (id, chapters) => library.setChapters(id, chapters),
    refresh: (id) => {
      library.refresh(id);
      scoring.refresh(id);
      reached.refresh(id);
      verdicts.refresh(id);
    },
  };
  return { kv, library, scoring, reached, verdicts, deps };
}

/** A listener's book: a place, a bookmark, a speed, a mix, moods with a pick, a seed, a verdict, a reached chapter. */
function listenedTo(d: ReturnType<typeof device>, id: string) {
  d.library.savePosition(id, 75.5);
  d.library.addBookmark(id, 70, "The storm");
  d.library.saveSpeed(id, 1.5);
  d.library.saveMix(id, { ...d.library.getMix(id), balance: 0.3, duck: true });
  d.scoring.saveScores(id, scores("p2"));
  d.scoring.seed(id, [seed]);
  d.scoring.saveJob(id, { jobId: "job-1", startedAt: 1 } as never);
  d.verdicts.setVerdict(id, 0, "p2", "fits");
  d.reached.reach(id, { start: 60 });
}

test("A19: the file carries every listener-made field, and no audio, cover, file name, path or device id", () => {
  const d = device([book("b1")]);
  listenedTo(d, "b1");
  const backup = exportLibrary(d.kv, d.library.books(), new Date("2026-10-25T12:00:00Z"));
  assert.equal(backup.version, BACKUP_VERSION);
  assert.equal(backup.exportedAt, "2026-10-25T12:00:00.000Z");
  const [entry] = backup.books;
  for (const f of BACKED_UP) assert.ok(entry[f] !== undefined, `carries ${f}`);
  assert.deepEqual(entry.fileDurations, [60, 60]);
  assert.equal(entry.position, 75.5);
  assert.equal(entry.scores?.chapters[0].playlist?.pick, "p2");
  const text = backupText(backup);
  for (const banned of ["file://", ".mp3", "\"cover\"", "b1", "scorejob", "\"ref\"", "\"name\": \"Storm"]) assert.ok(!text.includes(banned), `no ${banned}`);
});

test("a field the device does not have is not carried", () => {
  const d = device([book("b1")]);
  const [entry] = exportLibrary(d.kv, d.library.books()).books;
  for (const f of BACKED_UP) assert.equal(entry[f], undefined, `${f} absent`);
});

test("every per-book key is carried but the scoring job", () => {
  assert.deepEqual([...BACKED_UP].sort(), Object.keys(PER_BOOK_KEYS).filter((k) => k !== "job").sort());
});

test("A19: import restores positions, bookmarks, moods, picks and mixes onto the matching book", () => {
  const from = device([book("b1")]);
  listenedTo(from, "b1");
  from.library.setChapters("b1", [
    { bookId: "b1", index: 0, title: "The Gale", fileIndex: 0, start: 0, end: 60 },
    { bookId: "b1", index: 1, title: "Two", fileIndex: 1, start: 60, end: 120 },
  ]);
  const text = backupText(exportLibrary(from.kv, from.library.books()));

  // Another device: the same book imported again (its own id, a few seconds longer), nothing made of it yet.
  const other = book("x9", { files: [{ ref: "r0", name: "a.mp3", duration: 62 }, { ref: "r1", name: "b.mp3", duration: 61 }], duration: 123 });
  other.chapters[1] = { ...other.chapters[1], end: 123 };
  const to = device([other]);
  // Read once first, so the stores hold the empty state the import must replace.
  assert.deepEqual(to.library.bookmarks("x9"), []);
  assert.equal(to.scoring.scores("x9"), null);
  assert.equal(to.reached.furthest("x9"), null);
  assert.deepEqual(to.verdicts.verdicts("x9"), []);

  const result = importLibrary(text, to.library.books(), to.deps);
  assert.deepEqual(result, { ok: true, restored: ["The Storm Book"], unmatched: [] });
  assert.equal(to.library.getPosition("x9"), 75.5);
  assert.deepEqual(to.library.bookmarks("x9").map((m) => [m.bookId, m.position, m.name]), [["x9", 70, "The storm"]]);
  assert.equal(to.library.getSpeed("x9"), 1.5);
  assert.equal(to.library.getMix("x9").balance, 0.3);
  assert.equal(to.library.getMix("x9").duck, true);
  assert.equal(to.scoring.scores("x9")?.chapters[0].playlist?.pick, "p2");
  assert.equal(to.scoring.seeds("x9").length, 1);
  assert.equal(to.scoring.job("x9"), null);
  assert.equal(to.verdicts.verdictFor("x9", 0, "p2"), "fits");
  assert.equal(to.reached.furthest("x9"), 60);
  const chapters = to.library.getBook("x9")!.chapters;
  assert.deepEqual(chapters.map((c) => [c.bookId, c.title, c.end]), [["x9", "The Gale", 60], ["x9", "Two", 123]]);
  // The audio, cover and files stay this device's own.
  assert.deepEqual(to.library.getBook("x9")!.files, other.files);
});

test("the file wins for what it carries; what it does not carry stays", () => {
  const from = device([book("b1")]);
  from.library.savePosition("b1", 30);
  const text = backupText(exportLibrary(from.kv, from.library.books()));
  const to = device([book("b2")]);
  to.library.savePosition("b2", 90);
  to.library.addBookmark("b2", 10, "Mine");
  to.library.saveSpeed("b2", 2);
  importLibrary(text, to.library.books(), to.deps);
  assert.equal(to.library.getPosition("b2"), 30);
  assert.deepEqual(to.library.bookmarks("b2").map((m) => m.name), ["Mine"]);
  assert.equal(to.library.getSpeed("b2"), 2);
});

test("a book with no match is reported and not created", () => {
  const from = device([book("b1"), book("b2", { title: "Another Book" }), book("b3", { title: "Third", author: "Someone" })]);
  const text = backupText(exportLibrary(from.kv, from.library.books()));
  const to = device([book("c1", { duration: 200, files: [{ ref: "r", name: "a", duration: 100 }, { ref: "s", name: "b", duration: 100 }] }), book("c3", { title: "third!", author: "SOMEONE" })]);
  const result = importLibrary(text, to.library.books(), to.deps);
  assert.ok(result.ok);
  assert.deepEqual(result.restored, ["third!"]);
  assert.deepEqual([...result.unmatched].sort(), ["Another Book", "The Storm Book"]);
  assert.equal(to.library.books().length, 2);
});

test("matchBooks gives each shelf book to one entry", () => {
  const entry = exportLibrary(memoryKv(), [book("b1")]).books[0];
  const { pairs, unmatched } = matchBooks([entry, entry], [book("s1"), book("s2")]);
  assert.deepEqual(pairs.map((p) => p.book.id), ["s1", "s2"]);
  assert.deepEqual(unmatched, []);
  assert.equal(matchBooks([entry, entry], [book("s1")]).unmatched.length, 1);
});

test("a broken, foreign or newer file is refused and nothing changes", () => {
  const d = device([book("b1")]);
  const before = new Map(d.kv.data);
  const good = exportLibrary(memoryKv(), [book("b1")]);
  const cases: [string, "malformed" | "newer"][] = [
    ["not json", "malformed"],
    ["[]", "malformed"],
    [JSON.stringify({ ...good, app: "other" }), "malformed"],
    [JSON.stringify({ ...good, kind: "settings" }), "malformed"],
    [JSON.stringify({ ...good, version: "1" }), "malformed"],
    [JSON.stringify({ ...good, books: {} }), "malformed"],
    [JSON.stringify({ ...good, books: [{ title: "No author", duration: 5, fileDurations: [5] }] }), "malformed"],
    [JSON.stringify({ ...good, books: [{ ...good.books[0], fileDurations: [] }] }), "malformed"],
    [JSON.stringify({ ...good, version: BACKUP_VERSION + 1 }), "newer"],
  ];
  for (const [text, reason] of cases) {
    assert.deepEqual(importLibrary(text, d.library.books(), d.deps), { ok: false, reason }, text.slice(0, 40));
  }
  assert.deepEqual(d.kv.data, before);
});

test("a broken field is dropped and the rest of the book restores", () => {
  const good = exportLibrary(memoryKv(), [book("b1")]);
  const entry = { ...good.books[0], position: "far", bookmarks: [{ position: 4, name: "ok" }, { name: "no place" }], mix: [1], speed: 1.25 };
  const parsed = parseBackup(JSON.stringify({ ...good, books: [entry] }));
  assert.ok(parsed.ok);
  const b: BackupBook = parsed.backup.books[0];
  assert.equal(b.position, undefined);
  assert.equal(b.mix, undefined);
  assert.equal(b.speed, 1.25);
  assert.deepEqual(b.bookmarks?.map((m) => m.name), ["ok"]);
});

test("chaptersFor ends the last chapter where this copy ends, and skips a list for other files", () => {
  const entry = exportLibrary(memoryKv(), [book("b1")]).books[0];
  assert.equal(chaptersFor(entry, { id: "z", duration: 118, files: book("z").files })?.at(-1)?.end, 118);
  assert.equal(chaptersFor({ ...entry, chapters: [] }, book("z")), null);
  assert.equal(chaptersFor({ ...entry, chapters: [{ title: "x", fileIndex: 5, start: 0, end: 120 }] }, book("z")), null);
});

test("the file is named for its day", () => {
  assert.equal(backupFileName(new Date("2026-10-25T23:00:00Z")), "mood-read-library-2026-10-25.json");
});
