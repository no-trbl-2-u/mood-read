// The river's scoring band and the first-run note (01.17, spec 01 A30): what the band shows for each job state,
// when Rescore is offered, and that the note shows on one run on this device only, across books and reloads.
import assert from "node:assert/strict";
import { test } from "node:test";

import type { Kv } from "./library-store.ts";
import { canRescore, createScoringNoteStore, NOTE_KEY, scoringBandView, scoringPercent, showsNote } from "./scoring-band.ts";
import type { BookScores, ScoringJob } from "./types.ts";

function mapKv(): Kv & { map: Map<string, string> } {
  const map = new Map<string, string>();
  return { map, getItem: (k) => map.get(k) ?? null, setItem: (k, v) => void map.set(k, v), removeItem: (k) => void map.delete(k) };
}

const job = (state: ScoringJob["state"], over: Partial<ScoringJob> = {}): ScoringJob => ({
  jobId: "j",
  state,
  progress: { step: 2, steps: 5, chaptersDone: 4, chapters: 10 },
  rescore: false,
  startedAt: 100,
  updatedAt: 100,
  ...over,
});

const scores: BookScores = { jobId: "j", model: "m", version: "v", scoredAt: 1, costUsd: 0, chapters: [] };

test("scoringPercent: whole, clamped, never 100 while running, 0 with no steps", () => {
  assert.equal(scoringPercent(2, 5), 40);
  assert.equal(scoringPercent(1, 3), 33);
  assert.equal(scoringPercent(4, 4), 99);
  assert.equal(scoringPercent(9, 4), 99);
  assert.equal(scoringPercent(-1, 4), 0);
  assert.equal(scoringPercent(1, 0), 0);
  assert.equal(scoringPercent(Number.NaN, 4), 0);
});

test("an unscored book with nothing running offers Score this book", () => {
  assert.deepEqual(scoringBandView(null, null, 12), { kind: "start" });
});

test("a run shows its percent and chapters done of the total", () => {
  assert.deepEqual(scoringBandView(job("running"), null, 12), { kind: "running", percent: 40, done: 4, total: 10 });
  // Before the proxy knows the chapter count, the book's own count stands in.
  const early = job("running", { progress: { step: 0, steps: 0, chaptersDone: 0, chapters: 0 } });
  assert.deepEqual(scoringBandView(early, null, 12), { kind: "running", percent: 0, done: 0, total: 12 });
  // A rescore runs over the old scores: still progress, not the scored state.
  assert.equal(scoringBandView(job("running", { rescore: true }), scores, 12)?.kind, "running");
});

test("the cap keeps the bar where it stopped, with no button", () => {
  assert.deepEqual(scoringBandView(job("capped"), null, 12), { kind: "capped", percent: 40, done: 4, total: 10 });
});

test("a failed or unreachable run says so and retries the same kind of run", () => {
  assert.deepEqual(scoringBandView(job("failed"), null, 12), { kind: "failed", rescore: false });
  assert.deepEqual(scoringBandView(job("unreachable", { rescore: true }), scores, 12), { kind: "unreachable", rescore: true });
});

test("a scored book with no run shows no band; Rescore is offered only then (and after a failed run)", () => {
  assert.equal(scoringBandView(null, scores, 12), null);
  assert.equal(canRescore(null, scores), true);
  assert.equal(canRescore(job("failed", { rescore: true }), scores), true);
  assert.equal(canRescore(null, null), false);
  assert.equal(canRescore(job("running", { rescore: true }), scores), false);
  assert.equal(canRescore(job("capped", { rescore: true }), scores), false);
});

test("the first-run note: claimed by the first run, shown for it until dismissed, never for another book or run", () => {
  const kv = mapKv();
  const note = createScoringNoteStore(kv);
  assert.equal(note.get(), null);
  // Nothing running: nothing to claim.
  note.claim("a", null);
  note.claim("a", job("failed"));
  assert.equal(note.get(), null);

  const first = job("running", { startedAt: 100 });
  note.claim("a", first);
  assert.deepEqual(note.get(), { bookId: "a", startedAt: 100, dismissed: false });
  assert.equal(showsNote(note.get(), "a", first), true);
  // The same run waiting at the cap, or after a reload, still carries it.
  assert.equal(showsNote(note.get(), "a", job("capped", { startedAt: 100 })), true);
  const reloaded = createScoringNoteStore(kv);
  assert.equal(showsNote(reloaded.get(), "a", first), true);

  // A second book never gets it, even before the first was dismissed; nor does a later run of the first book.
  const second = job("running", { startedAt: 200 });
  note.claim("b", second);
  assert.equal(note.get()?.bookId, "a");
  assert.equal(showsNote(note.get(), "b", second), false);
  assert.equal(showsNote(note.get(), "a", job("running", { startedAt: 300, rescore: true })), false);
  // Not once the run is over.
  assert.equal(showsNote(note.get(), "a", null), false);

  note.dismiss();
  assert.equal(showsNote(note.get(), "a", first), false);
  assert.equal(JSON.parse(kv.map.get(NOTE_KEY)!).dismissed, true);
  assert.equal(createScoringNoteStore(kv).get()?.dismissed, true);
});

test("a damaged note record reads as unclaimed", () => {
  const kv = mapKv();
  kv.setItem(NOTE_KEY, "{not json");
  assert.equal(createScoringNoteStore(kv).get(), null);
  kv.setItem(NOTE_KEY, JSON.stringify({ bookId: 3 }));
  assert.equal(createScoringNoteStore(kv).get(), null);
});
