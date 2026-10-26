import assert from "node:assert/strict";
import { test } from "node:test";

import { booksToEvict, createBookRemoval, newlyOnDevice, piecesFreedBy } from "./book-removal.ts";
import { createLibraryStore, type Kv } from "./library-store.ts";
import { DEFAULT_MIX } from "./mix.ts";
import type { PlaylistRecord } from "./playlist.ts";
import { createPlaylistStore } from "./playlist-store.ts";
import { createReachedStore, reachedKey } from "./reached.ts";
import { scoresKey, seedsKey } from "./scoring-store.ts";
import { SOUNDTRACK_KEY } from "./soundtrack-store.ts";
import type { Book, Download } from "./types.ts";
import { verdictsKey } from "./verdict-store.ts";

function memoryKv(): Kv & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => void data.set(k, v),
    removeItem: (k) => void data.delete(k),
  };
}

function book(id: string, onDevice = true): Book {
  return {
    id,
    title: `Book ${id}`,
    author: "A. Author",
    narrator: "",
    cover: `idb:${id}/cover`,
    files: [
      { ref: `idb:${id}/0`, name: "01.mp3", duration: 60 },
      { ref: `idb:${id}/1`, name: "02.mp3", duration: 60 },
    ],
    chapters: [
      { bookId: id, index: 0, title: "One", fileIndex: 0, start: 0, end: 60 },
      { bookId: id, index: 1, title: "Two", fileIndex: 1, start: 60, end: 120 },
    ],
    duration: 120,
    addedAt: 1,
    lastPlayedAt: 5,
    source: { kind: "import" },
    onDevice,
  };
}

const rec = (bookId: string, ...ids: string[]): PlaylistRecord => ({ bookId, pieces: ids.map((id) => ({ id, key: `pieces/${id}.aac` })), builtAt: 1 });

const row = (id: string, target: Download["target"], state: Download["state"] = "done"): Download => ({
  id,
  target,
  state,
  bytes: 0,
  totalBytes: null,
  error: null,
  attempts: 0,
  queuedAt: 1,
  updatedAt: 1,
});

function setup(books: Book[], records: PlaylistRecord[], rows: Download[] = []) {
  const kv = memoryKv();
  const library = createLibraryStore(kv);
  for (const b of books) library.addBook(b);
  const playlists = createPlaylistStore(kv);
  for (const r of records) playlists.put(r);
  let downloadRows = [...rows];
  const deleted = { audio: [] as string[], books: [] as string[], pieces: [] as string[], pending: [] as string[] };
  const removal = createBookRemoval({
    library,
    playlists,
    downloads: { list: () => downloadRows, remove: (id) => void (downloadRows = downloadRows.filter((d) => d.id !== id)) },
    files: {
      deleteAudio: async (refs) => void deleted.audio.push(...refs),
      deleteBook: async (id) => void deleted.books.push(id),
      deletePiece: async (key) => void deleted.pieces.push(key),
    },
    forgetPending: (id) => void deleted.pending.push(id),
  });
  return { kv, library, playlists, removal, deleted, rows: () => downloadRows };
}

/** Everything a listener made of book `id`, as stored. */
function seedListening(kv: Kv & { data: Map<string, string> }, library: ReturnType<typeof createLibraryStore>, id: string) {
  library.savePosition(id, 73.5);
  library.saveSpeed(id, 1.5);
  library.saveMix(id, { ...DEFAULT_MIX, balance: 0.2 });
  library.addBookmark(id, 42, "The storm");
  kv.setItem(scoresKey(id), JSON.stringify({ jobId: "j", chapters: [{ playlist: { pick: "piece-b" } }] }));
  kv.setItem(seedsKey(id), JSON.stringify([{ mood: { chapterIndex: 1 } }]));
  kv.setItem(verdictsKey(id), JSON.stringify([{ chapterIndex: 0, pieceId: "piece-b", verdict: "fits", at: 1 }]));
  createReachedStore(kv).reach(id, { start: 60 });
  kv.setItem(SOUNDTRACK_KEY, JSON.stringify([{ bookId: id, pieceId: "piece-b" }]));
}

test("A7: Remove download deletes the book's audio and keeps the book, its position, bookmarks, moods, picks and mix", async () => {
  const { kv, library, removal, deleted } = setup([book("a")], []);
  seedListening(kv, library, "a");
  const before = new Map(kv.data);
  before.delete("books");

  assert.equal(await removal.removeDownload("a"), true);

  assert.deepEqual(deleted.audio, ["idb:a/0", "idb:a/1"]);
  assert.deepEqual(deleted.books, [], "the cover stays");
  // The book stays on the shelf, not on the device, with its chapters, files and cover as they were.
  const kept = library.getBook("a")!;
  assert.equal(kept.onDevice, false);
  assert.deepEqual({ ...kept, onDevice: true }, book("a"));
  // Every per-book key is untouched: position, speed, mix, bookmarks, scores (moods and picks), seeds, verdicts,
  // reached chapters, the soundtrack log.
  for (const [k, v] of before) assert.equal(kv.data.get(k), v, k);
  assert.equal(library.getPosition("a"), 73.5);
  assert.equal(library.bookmarks("a")[0]?.name, "The storm");
  assert.equal(library.getMix("a").balance, 0.2);
  assert.ok(kv.data.has(reachedKey("a")));

  // And it reads the same after the app restarts.
  const reopened = createLibraryStore(kv);
  assert.equal(reopened.getBook("a")?.onDevice, false);
  assert.equal(reopened.getPosition("a"), 73.5);
  assert.equal(reopened.bookmarks("a").length, 1);
});

test("A7: removing a download twice, or for an unknown book, does nothing", async () => {
  const { removal, deleted } = setup([book("a", false)], []);
  assert.equal(await removal.removeDownload("a"), false);
  assert.equal(await removal.removeDownload("nope"), false);
  assert.deepEqual(deleted.audio, []);
});

test("A7: removing a download drops the book's own download rows and forgets a pending LibriVox download", async () => {
  const { removal, rows, deleted } = setup([book("a"), book("b")], [], [row("d1", { kind: "book", bookId: "a" }), row("d2", { kind: "book", bookId: "b" })]);
  await removal.removeDownload("a");
  assert.deepEqual(
    rows().map((d) => d.id),
    ["d2"],
  );
  assert.deepEqual(deleted.pending, ["a"]);
});

test("A8: removing a download keeps a piece another book on the device still plays, and deletes the rest", async () => {
  const { removal, deleted, playlists, rows } = setup(
    [book("a"), book("b")],
    [rec("a", "p1", "p2"), rec("b", "p2", "p3")],
    [row("r1", { kind: "piece", pieceId: "p1" }), row("r2", { kind: "piece", pieceId: "p2" }), row("r3", { kind: "piece", pieceId: "p3" })],
  );
  await removal.removeDownload("a");
  assert.deepEqual(deleted.pieces, ["pieces/p1.aac"]);
  assert.equal(playlists.get("a"), null, "a book not on the device holds no playlist");
  assert.deepEqual(
    rows().map((d) => d.id),
    ["r2", "r3"],
  );

  // Now b goes too: nothing on the device holds p2 or p3 any more.
  await removal.removeDownload("b");
  assert.deepEqual(deleted.pieces.sort(), ["pieces/p1.aac", "pieces/p2.aac", "pieces/p3.aac"]);
  assert.deepEqual(rows(), []);
});

test("A8: a book that is not on the device does not keep a piece", () => {
  const records = [rec("a", "p1"), rec("gone", "p1"), rec("b", "p2")];
  const onDevice = (id: string) => id !== "gone";
  assert.deepEqual(
    piecesFreedBy("a", records, onDevice).map((p) => p.id),
    ["p1"],
  );
  assert.deepEqual(
    piecesFreedBy("a", records, () => true).map((p) => p.id),
    [],
  );
  assert.deepEqual(piecesFreedBy("none", records, onDevice), []);
});

test("Delete book removes it and everything kept for it: files, cover, keys, playlist and download rows", async () => {
  const { kv, library, removal, deleted, playlists, rows } = setup(
    [book("a"), book("b")],
    [rec("a", "p1", "p2"), rec("b", "p2")],
    [row("d1", { kind: "book", bookId: "a" }), row("r1", { kind: "piece", pieceId: "p1" }), row("r2", { kind: "piece", pieceId: "p2" })],
  );
  seedListening(kv, library, "a");
  library.savePosition("b", 9);

  assert.equal(await removal.deleteBook("a"), true);

  assert.equal(library.getBook("a"), undefined);
  assert.deepEqual(deleted.books, ["a"]);
  for (const key of kv.data.keys()) assert.ok(!key.endsWith(":a"), `${key} was left behind`);
  assert.equal(JSON.parse(kv.data.get(SOUNDTRACK_KEY) ?? "[]").length, 0);
  assert.equal(playlists.get("a"), null);
  // A8: p2 is in b's playlist, and b is on the device.
  assert.deepEqual(deleted.pieces, ["pieces/p1.aac"]);
  assert.deepEqual(
    rows().map((d) => d.id),
    ["r2"],
  );
  // The other book is untouched.
  assert.equal(library.getPosition("b"), 9);
  assert.ok(playlists.get("b"));
  assert.equal(await removal.deleteBook("a"), false);
});

test("A8: deleting a book frees a piece shared only with a book whose download was removed", async () => {
  const { removal, deleted } = setup([book("a"), book("b")], [rec("a", "p1"), rec("b", "p1")]);
  await removal.removeDownload("b");
  assert.deepEqual(deleted.pieces, [], "a still plays p1");
  await removal.deleteBook("a");
  assert.deepEqual(deleted.pieces, ["pieces/p1.aac"]);
});

test("a book saved before spec 05's contract reads as an import on the device", () => {
  const kv = memoryKv();
  const { source: _s, onDevice: _o, ...old } = book("a");
  kv.setItem("books", JSON.stringify([old]));
  const library = createLibraryStore(kv);
  assert.equal(library.getBook("a")?.onDevice, true);
  assert.deepEqual(library.getBook("a")?.source, { kind: "import" });
});

test("setOnDevice turns a book back on, and ignores an unknown one", () => {
  const kv = memoryKv();
  const library = createLibraryStore(kv);
  library.addBook(book("a", false));
  library.setOnDevice("a", true);
  assert.equal(createLibraryStore(kv).getBook("a")?.onDevice, true);
  library.setOnDevice("nope", false);
  assert.equal(library.books().length, 1);
});

// The web build keeps at most one book offline (spec 05 Design, "The web build streams; phones keep"): when a book
// lands on the device, the others leave it through Remove download, and stay on the shelf.

const withTimes = (id: string, addedAt: number, lastPlayedAt: number | null, onDevice = true): Book => ({ ...book(id, onDevice), addedAt, lastPlayedAt });

test("web cap: a book that landed pushes every other book off the device when one is allowed", () => {
  const books = [book("a"), book("b"), book("c", false)];
  assert.deepEqual(booksToEvict(books, ["b"], 1), ["a"]);
  assert.deepEqual(booksToEvict(books, ["a"], 1), ["b"]);
});

test("web cap: a phone, with no cap, evicts nothing", () => {
  assert.deepEqual(booksToEvict([book("a"), book("b"), book("c")], ["c"], Infinity), []);
});

test("web cap: with room for more, the most recently played others stay", () => {
  const books = [withTimes("a", 1, 10), withTimes("b", 2, null), withTimes("c", 3, 20), withTimes("d", 4, null)];
  assert.deepEqual(booksToEvict(books, ["d"], 3), ["b"], "b was never played and was added first of the unplayed");
  assert.deepEqual(booksToEvict(books, ["d"], 2).sort(), ["a", "b"]);
});

test("web cap: nothing is evicted when nothing landed, or the book is within the cap", () => {
  assert.deepEqual(booksToEvict([book("a"), book("b")], [], 1), []);
  assert.deepEqual(booksToEvict([book("a")], ["a"], 1), []);
});

test("web cap: newlyOnDevice finds books that turned up on the device since the last look", () => {
  const seen = new Set(["a"]);
  assert.deepEqual(newlyOnDevice(seen, [book("a"), book("b"), book("c", false)]), ["b"]);
  assert.deepEqual([...seen].sort(), ["a", "b"], "the set is brought up to date");
  assert.deepEqual(newlyOnDevice(seen, [book("a"), book("b")]), []);
  // A book removed and then found again is new again.
  assert.deepEqual(newlyOnDevice(seen, [book("a"), book("b", false)]), []);
  assert.deepEqual(newlyOnDevice(seen, [book("a"), book("b")]), ["b"]);
});

test("web cap: enforceLimit removes the downloads of the other books and keeps them on the shelf", async () => {
  const { library, removal, deleted, playlists } = setup([book("a"), book("b"), book("c")], [rec("a", "p1")]);
  library.savePosition("a", 12);
  const gone = await removal.enforceLimit(["c"], 1);
  assert.deepEqual(gone.sort(), ["a", "b"]);
  assert.equal(library.getBook("a")?.onDevice, false);
  assert.equal(library.getBook("b")?.onDevice, false);
  assert.equal(library.getBook("c")?.onDevice, true);
  assert.equal(library.books().length, 3, "all three stay on the shelf");
  assert.equal(library.getPosition("a"), 12);
  assert.deepEqual(deleted.audio.sort(), ["idb:a/0", "idb:a/1", "idb:b/0", "idb:b/1"]);
  assert.deepEqual(deleted.pieces, ["pieces/p1.aac"]);
  assert.equal(playlists.get("a"), null);
});

test("web cap: enforceLimit with no cap does nothing", async () => {
  const { library, removal, deleted } = setup([book("a"), book("b")], []);
  assert.deepEqual(await removal.enforceLimit(["b"], Infinity), []);
  assert.equal(library.getBook("a")?.onDevice, true);
  assert.deepEqual(deleted.audio, []);
});
