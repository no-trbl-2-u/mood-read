// Owner tools (05.21, spec 05 A23): the gate reads app.config.ts's switch, and "Copy books for pre-scoring" copies,
// per library book, only what the proxy accepts. Every entry parses through the proxy's own parseBookRequest, the
// contract test's pattern (src/lib/scoring-contract.test.ts).
import assert from "node:assert/strict";
import { test } from "node:test";

import { ownerToolsFromEnv } from "../../app.config.ts";
import { parseBookRequest } from "../../proxy/src/validate.ts";
import { ownerToolsOn, prescoreList } from "./owner-tools.ts";
import type { Book, Chapter } from "./types.ts";

const chapters = (bookId: string, titles: string[]): Chapter[] =>
  titles.map((title, index) => ({ bookId, index, title, fileIndex: 0, start: index * 60, end: (index + 1) * 60 }));

const book = (id: string, over: Partial<Book>): Book => ({
  id,
  title: "Untitled",
  author: "",
  narrator: "A Reader",
  cover: "cover:abc",
  files: [{ ref: `file:///books/${id}/1.mp3`, name: "1.mp3", duration: 120 }],
  chapters: chapters(id, ["One", "Two"]),
  duration: 120,
  addedAt: 1,
  lastPlayedAt: 2,
  source: { kind: "import" },
  onDevice: true,
  ...over,
});

const LIBRARY: Book[] = [
  book("a", { title: "Alice's Adventures in Wonderland", author: "Lewis Carroll", chapters: chapters("a", ["Down the Rabbit-Hole", "The Pool of Tears"]), source: { kind: "librivox", librivoxId: "alice_librivox", catalogId: "200", gutenbergId: "11" } }),
  book("b", { title: "My Own Recording", author: "", chapters: chapters("b", ["Part 1"]) }),
  book("c", { title: "A LibriVox Book Without Its Text", author: "Someone", source: { kind: "librivox", librivoxId: "notext_librivox", catalogId: "300" } }),
];

test("A23: the gate is on only when the app config's ownerTools is true", () => {
  assert.equal(ownerToolsOn({ ownerTools: true }), true);
  for (const extra of [undefined, null, {}, { ownerTools: false }, { ownerTools: "true" }, { ownerTools: 1 }]) assert.equal(ownerToolsOn(extra as never), false);
});

test("A23: app.config.ts turns owner tools on in local dev and the preview profile, never in a production build", () => {
  assert.equal(ownerToolsFromEnv({ NODE_ENV: "development" }), true);
  assert.equal(ownerToolsFromEnv({ NODE_ENV: "production", MOOD_READ_OWNER_TOOLS: "1" }), true);
  assert.equal(ownerToolsFromEnv({ NODE_ENV: "production" }), false);
  assert.equal(ownerToolsFromEnv({}), false);
  assert.equal(ownerToolsFromEnv({ NODE_ENV: "production", MOOD_READ_OWNER_TOOLS: "0" }), false);
});

test("A23: every copied entry parses through the proxy's parseBookRequest, unchanged", () => {
  const copied = JSON.parse(prescoreList(LIBRARY)) as unknown[];
  assert.equal(copied.length, LIBRARY.length);
  for (const entry of copied) assert.deepEqual(parseBookRequest(entry), { ok: true, book: entry });
});

test("A23: only title, author, chapter titles and the catalog numbers when known; nothing else of the book", () => {
  const copied = JSON.parse(prescoreList(LIBRARY));
  assert.deepEqual(copied, [
    { title: "Alice's Adventures in Wonderland", author: "Lewis Carroll", chapters: ["Down the Rabbit-Hole", "The Pool of Tears"], librivoxId: "200", gutenbergId: "11" },
    { title: "My Own Recording", author: "", chapters: ["Part 1"] },
    { title: "A LibriVox Book Without Its Text", author: "Someone", chapters: ["One", "Two"], librivoxId: "300" },
  ]);
  const text = prescoreList(LIBRARY);
  for (const leak of ["file:///", "cover:", "A Reader", "alice_librivox", "lastPlayedAt", "duration"]) assert.ok(!text.includes(leak), leak);
});

test("an empty shelf copies an empty list", () => {
  assert.equal(prescoreList([]), "[]");
});
