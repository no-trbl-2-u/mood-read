import assert from "node:assert/strict";
import { test } from "node:test";

import {
  bookPosition,
  chapterAt,
  chaptersFromFiles,
  fileOffsets,
  locate,
  resumeStart,
  skipTarget,
  sleepAfterMove,
  sleepDue,
  sleepFollowPosition,
  speedPresets,
  stepSpeed,
  totalDuration,
} from "./timeline.ts";

const files = [
  { name: "01 Opening.mp3", duration: 100 },
  { name: "02 Middle.mp3", duration: 50 },
  { name: "03 End.mp3", duration: 25 },
];

test("file offsets and total duration", () => {
  assert.deepEqual(fileOffsets(files), [0, 100, 150]);
  assert.equal(totalDuration(files), 175);
  assert.equal(totalDuration([]), 0);
});

test("locate maps a book position to a file and an offset inside it", () => {
  assert.deepEqual(locate(files, 0), { fileIndex: 0, offset: 0 });
  assert.deepEqual(locate(files, 99.5), { fileIndex: 0, offset: 99.5 });
  assert.deepEqual(locate(files, 100), { fileIndex: 1, offset: 0 });
  assert.deepEqual(locate(files, 160), { fileIndex: 2, offset: 10 });
  assert.deepEqual(locate(files, -5), { fileIndex: 0, offset: 0 });
  assert.deepEqual(locate(files, 999), { fileIndex: 2, offset: 25 });
  assert.deepEqual(locate([], 10), { fileIndex: 0, offset: 0 });
});

test("bookPosition is the inverse of locate", () => {
  assert.equal(bookPosition(files, 2, 10), 160);
  assert.equal(bookPosition(files, 0, 0), 0);
  for (const p of [0, 42, 100, 149.9, 170]) {
    const { fileIndex, offset } = locate(files, p);
    assert.equal(bookPosition(files, fileIndex, offset), p);
  }
});

test("one chapter per file, titled from the file names", () => {
  const chapters = chaptersFromFiles("b1", files);
  assert.equal(chapters.length, 3);
  assert.deepEqual(chapters[1], { bookId: "b1", index: 1, title: "02 Middle", fileIndex: 1, start: 100, end: 150 });
  assert.equal(chaptersFromFiles("b1", [files[0]])[0].title, "Chapter 1");
  assert.equal(chaptersFromFiles("b1", [{ name: ".mp3", duration: 3 }, files[1]])[0].title, "Chapter 1");
});

test("chapterAt finds the chapter holding a position", () => {
  const chapters = chaptersFromFiles("b1", files);
  assert.equal(chapterAt(chapters, 0)?.index, 0);
  assert.equal(chapterAt(chapters, 120)?.index, 1);
  assert.equal(chapterAt(chapters, 150)?.index, 2);
  assert.equal(chapterAt(chapters, 175)?.index, 2);
  assert.equal(chapterAt(chapters, -1)?.index, 0);
  assert.equal(chapterAt([], 10), undefined);
});

test("skipTarget moves 30 s and clamps inside the book, a second short of the end", () => {
  assert.equal(skipTarget(50, 30, 175), 80);
  assert.equal(skipTarget(50, -30, 175), 20);
  assert.equal(skipTarget(10, -30, 175), 0);
  assert.equal(skipTarget(160, 30, 175), 174);
  assert.equal(skipTarget(0.5, 30, 0.5), 0);
  assert.equal(skipTarget(Number.NaN, 30, 175), 30);
});

test("a forward skip to the end never counts as finished", () => {
  assert.ok(resumeStart(skipTarget(170, 30, 175), 175) > 0);
});

test("resumeStart returns the saved position, and starts a finished book over", () => {
  assert.equal(resumeStart(87.51, 175), 87.51);
  assert.equal(resumeStart(0, 175), 0);
  assert.equal(resumeStart(-3, 175), 0);
  assert.equal(resumeStart(175, 175), 0);
  assert.equal(resumeStart(174.9, 175), 0);
  assert.equal(resumeStart(500, 175), 0);
  assert.equal(resumeStart(Number.NaN, 175), 0);
});

test("sleep timer in minutes is due at its end time", () => {
  assert.equal(sleepDue(null, 10, 0), false);
  const t = { kind: "minutes" as const, minutes: 15, endsAt: 100 };
  assert.equal(sleepDue(t, 99, 0), false);
  assert.equal(sleepDue(t, 100, 0), true);
  assert.equal(sleepDue(t, 101, 0), true);
});

test("sleep timer at chapter end is due when the position reaches the end", () => {
  const t = { kind: "chapterEnd" as const, chapterIndex: 1, end: 150 };
  assert.equal(sleepDue(t, 0, 120), false);
  assert.equal(sleepDue(t, 0, 149.9), false);
  assert.equal(sleepDue(t, 0, 149.96), true);
  assert.equal(sleepDue(t, 0, 152), true);
});

test("an End of chapter timer follows a seek or jump to the chapter now playing", () => {
  const chapters = [
    { index: 0, start: 0, end: 10 },
    { index: 1, start: 10, end: 20 },
    { index: 2, start: 20, end: 30 },
  ];
  const t = { kind: "chapterEnd" as const, chapterIndex: 0, end: 10 };
  // A jump to the start of Ch.3 retargets the timer to Ch.3's end, so it is not due there.
  const jumped = sleepAfterMove(t, chapters, 20);
  assert.deepEqual(jumped, { kind: "chapterEnd", chapterIndex: 2, end: 30 });
  assert.equal(sleepDue(jumped, 0, 20), false);
  // A skip back into an earlier chapter follows it too; a move inside the chapter changes nothing.
  assert.deepEqual(sleepAfterMove(jumped, chapters, 12), { kind: "chapterEnd", chapterIndex: 1, end: 20 });
  assert.deepEqual(sleepAfterMove(t, chapters, 4), t);
  // Minutes timers and no timer are untouched.
  const m = { kind: "minutes" as const, minutes: 15, endsAt: 100 };
  assert.equal(sleepAfterMove(m, chapters, 25), m);
  assert.equal(sleepAfterMove(null, chapters, 25), null);
});

test("sleepFollowPosition retargets an End of chapter timer from the position the player itself observes", () => {
  const chapters = [
    { index: 0, start: 0, end: 10 },
    { index: 1, start: 10, end: 20 },
    { index: 2, start: 20, end: 30 },
  ];
  const t = { kind: "chapterEnd" as const, chapterIndex: 0, end: 10 };
  // A native lock-screen or media-key seek moves `position` without ever calling the app's own seek/skip/jump:
  // the timer still has to follow it, because nothing else retargeted it.
  const crossed = sleepFollowPosition(t, chapters, 0, 15);
  assert.deepEqual(crossed.timer, { kind: "chapterEnd", chapterIndex: 1, end: 20 });
  assert.equal(crossed.due, false);
  // Once retargeted, it is due at the new chapter's end, not the old one (already passed).
  const atEnd = sleepFollowPosition(crossed.timer, chapters, 0, 20);
  assert.deepEqual(atEnd.timer, { kind: "chapterEnd", chapterIndex: 2, end: 30 });
  assert.equal(atEnd.due, false);
  // A seek that lands past the newly-retargeted chapter's end is due immediately, in the same call.
  const overshoot = sleepFollowPosition(t, chapters, 0, 30);
  assert.deepEqual(overshoot.timer, { kind: "chapterEnd", chapterIndex: 2, end: 30 });
  assert.equal(overshoot.due, true);
  // A move inside the same chapter leaves the timer's identity untouched (so the effect can skip a state update).
  const same = sleepFollowPosition(t, chapters, 0, 4);
  assert.equal(same.timer, t);
  assert.equal(same.due, false);
});

test("speed presets run 0.5x to 3x and cap at the platform maximum", () => {
  assert.deepEqual(speedPresets(3), [0.5, 1, 1.5, 2, 3]);
  assert.deepEqual(speedPresets(2), [0.5, 1, 1.5, 2]);
});

test("stepSpeed moves 0.1 at a time inside the range", () => {
  assert.equal(stepSpeed(1, 1, 3), 1.1);
  assert.equal(stepSpeed(1.2, -1, 3), 1.1);
  assert.equal(stepSpeed(3, 1, 3), 3);
  assert.equal(stepSpeed(2, 1, 2), 2);
  assert.equal(stepSpeed(0.5, -1, 3), 0.5);
  assert.equal(stepSpeed(0.7, 1, 3), 0.8);
});
