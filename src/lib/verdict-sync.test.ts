import assert from "node:assert/strict";
import { test } from "node:test";

import type { Kv } from "./library-store.ts";
import type { BookScores, ChapterScore, Emotion, PieceVerdict, Settings, VerdictRow } from "./types.ts";
import { createVerdictSync, localDay, pendingRows, readSyncState, sentMark, VERDICT_SYNC_KEY } from "./verdict-sync.ts";

function memoryKv(): Kv & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => void data.set(k, v),
    removeItem: (k) => void data.delete(k),
  };
}

const piece = (id: string) => ({ id, title: id, artist: "A", kind: "score" as const, vocals: "none" as const, moodTags: ["dread" as Emotion] });

function chapter(index: number, title: string, emotions: Emotion[], coverage: ChapterScore["mood"]["coverage"] = "scored"): ChapterScore {
  return {
    mood: {
      chapterIndex: index,
      chapterTitle: title,
      emotions: emotions.map((emotion, i) => ({ emotion, intensity: 0.9 - i * 0.2 })),
      sources: [],
      coverage,
      model: "m",
      version: "v",
      scoredAt: 1,
    },
    pieces: [piece("p1"), piece("p2"), piece("p3")],
    playlist: { chapterIndex: index, piece: "p1", alternates: ["p2", "p3"], pick: "auto" },
  };
}

const book = { id: "b1", chapters: [{ title: "One" }, { title: "Two" }, { title: "Three" }, { title: "Four" }].map((c, index) => ({ ...c, index, bookId: "b1", fileIndex: 0, start: index, end: index + 1 })) };
const scores: Pick<BookScores, "chapters"> = {
  chapters: [chapter(0, "One", ["dread", "tension"]), chapter(1, "Two", ["sorrow"]), chapter(2, "Three", ["calm"], "listener"), chapter(3, "Four", [], "too-little")],
};
const v = (chapterIndex: number, pieceId: string, verdict: PieceVerdict["verdict"] = "fits"): PieceVerdict => ({ chapterIndex, pieceId, verdict, at: 123456 });

test("a row holds only the piece, the chapter's emotion names in the fixed order, and the verdict", () => {
  const rows = pendingRows(book, [v(0, "p1"), v(1, "p2", "misfit")], scores, []);
  assert.deepEqual(
    rows.map((r) => r.row),
    [
      { pieceId: "p1", emotions: ["tension", "dread"], verdict: "fits" },
      { pieceId: "p2", emotions: ["sorrow"], verdict: "misfit" },
    ],
  );
  for (const r of rows) assert.deepEqual(Object.keys(r.row).sort(), ["emotions", "pieceId", "verdict"]);
});

test("skipped: a listener's or too-little chapter, a piece no longer among the chapter's, a chapter whose title moved, and a sent one", () => {
  const verdicts = [v(2, "p1"), v(3, "p1"), v(0, "gone"), v(5, "p1")];
  assert.deepEqual(pendingRows(book, verdicts, scores, []), []);
  // The chapter list was edited: index 0 is now another chapter, so its verdict no longer matches the score.
  const edited = { ...book, chapters: [{ ...book.chapters[0], title: "Prologue" }, ...book.chapters.slice(1)] };
  assert.deepEqual(pendingRows(edited, [v(0, "p1")], scores, []), []);
  assert.deepEqual(pendingRows(book, [v(0, "p1")], null, []), []);
  assert.deepEqual(pendingRows(book, [v(0, "p1")], scores, [sentMark(v(0, "p1"))]), []);
  // A changed verdict is a new one.
  assert.equal(pendingRows(book, [v(0, "p1", "misfit")], scores, [sentMark(v(0, "p1"))]).length, 1);
});

function harness(over: Partial<Settings> = {}, opts: { fail?: boolean; onWifi?: boolean } = {}) {
  const kv = memoryKv();
  let verdicts: PieceVerdict[] = [v(0, "p1")];
  const settings = { shareVerdicts: true, wifiOnly: true, ...over };
  const posts: VerdictRow[][] = [];
  let clock = new Date(2026, 9, 24, 9, 0).getTime();
  let fail = opts.fail ?? false;
  const sync = createVerdictSync({
    kv,
    books: () => [book],
    verdicts: () => verdicts,
    scores: () => scores,
    settings: () => settings,
    send: async (rows) => {
      posts.push(rows);
      if (fail) throw new Error("offline");
    },
    onWifi: opts.onWifi === undefined ? undefined : () => opts.onWifi!,
    now: () => clock,
  });
  return {
    kv,
    sync,
    posts,
    settings,
    setVerdicts: (list: PieceVerdict[]) => (verdicts = list),
    later: (hours: number) => (clock += hours * 3600_000),
    setFail: (f: boolean) => (fail = f),
  };
}

test("once a book has a verdict, one batch goes out, and not again the same day; the next day only new verdicts go", async () => {
  const h = harness();
  assert.equal(await h.sync.run(), "sent");
  assert.deepEqual(h.posts, [[{ pieceId: "p1", emotions: ["tension", "dread"], verdict: "fits" }]]);
  h.setVerdicts([v(0, "p1"), v(1, "p3", "misfit")]);
  h.later(5);
  assert.equal(await h.sync.run(), "today");
  assert.equal(h.posts.length, 1);
  h.later(20);
  assert.equal(await h.sync.run(), "sent");
  assert.deepEqual(h.posts[1], [{ pieceId: "p3", emotions: ["sorrow"], verdict: "misfit" }], "the verdict sent yesterday is not counted again");
  h.later(24);
  assert.equal(await h.sync.run(), "nothing");
  assert.equal(h.posts.length, 2);
  // The device keeps a day and markers, never a time.
  const kept = readSyncState(h.kv.getItem(VERDICT_SYNC_KEY));
  assert.match(kept.day!, /^\d{4}-\d{2}-\d{2}$/);
  assert.deepEqual(kept.sent, { b1: ["0|fits|p1", "1|misfit|p3"] });
});

test("nothing is sent while Share what fits is off; turning it on sends", async () => {
  const h = harness({ shareVerdicts: false });
  assert.equal(await h.sync.run(), "off");
  assert.equal(h.posts.length, 0);
  assert.equal(h.kv.getItem(VERDICT_SYNC_KEY), null, "the day is not spent");
  h.settings.shareVerdicts = true;
  assert.equal(await h.sync.run(), "sent");
});

test("Wi-Fi-only holds the post back off Wi-Fi; without a network check the setting alone gates (as 05.6)", async () => {
  const off = harness({ wifiOnly: true }, { onWifi: false });
  assert.equal(await off.sync.run(), "no-wifi");
  assert.equal(off.posts.length, 0);
  const anyNet = harness({ wifiOnly: false }, { onWifi: false });
  assert.equal(await anyNet.sync.run(), "sent");
  const noCheck = harness({ wifiOnly: true });
  assert.equal(await noCheck.sync.run(), "sent");
});

test("a failed post spends the day but sends the same rows tomorrow", async () => {
  const h = harness({}, { fail: true });
  assert.equal(await h.sync.run(), "failed");
  assert.equal(await h.sync.run(), "today", "never twice in a day");
  h.setFail(false);
  h.later(24);
  assert.equal(await h.sync.run(), "sent");
  assert.deepEqual(h.posts[0], h.posts[1]);
});

test("at most 200 rows go in a post; the rest wait for the next day", async () => {
  // 250 distinct verdicts: one on each of 250 scored chapters.
  const big = { id: "b1", chapters: Array.from({ length: 250 }, (_, index) => ({ index, title: `C${index}`, bookId: "b1", fileIndex: 0, start: index, end: index + 1 })) };
  const bigScores = { chapters: big.chapters.map((c) => chapter(c.index, c.title, ["joy"])) };
  const kv = memoryKv();
  const posts: VerdictRow[][] = [];
  let clock = 0;
  const sync = createVerdictSync({
    kv,
    books: () => [big],
    verdicts: () => big.chapters.map((c) => v(c.index, "p1")),
    scores: () => bigScores,
    settings: () => ({ shareVerdicts: true, wifiOnly: true }),
    send: async (rows) => void posts.push(rows),
    now: () => clock,
  });
  assert.equal(await sync.run(), "sent");
  assert.equal(posts[0].length, 200);
  clock += 24 * 3600_000;
  assert.equal(await sync.run(), "sent");
  assert.equal(posts[1].length, 50);
});

test("a day is the device's local calendar day", () => {
  assert.equal(localDay(new Date(2026, 0, 5, 23, 59).getTime()), "2026-01-05");
  assert.equal(localDay(new Date(2026, 0, 6, 0, 1).getTime()), "2026-01-06");
  assert.deepEqual(readSyncState("{nope"), { day: null, sent: {} });
});
