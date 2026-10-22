/// <reference types="node" />
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  bookPosition, chapterAt, chaptersFromFiles, fileOffsets, formatTime, locate, sleepDue, totalDuration,
} from './timeline.ts';

const files = [
  { name: '01 Opening.mp3', duration: 100 },
  { name: '02 Middle.mp3', duration: 50 },
  { name: '03 End.mp3', duration: 25 },
];

test('file offsets and total', () => {
  assert.deepEqual(fileOffsets(files), [0, 100, 150]);
  assert.equal(totalDuration(files), 175);
});

test('locate maps a book position to a file and offset', () => {
  assert.deepEqual(locate(files, 0), { fileIndex: 0, offset: 0 });
  assert.deepEqual(locate(files, 99.5), { fileIndex: 0, offset: 99.5 });
  assert.deepEqual(locate(files, 100), { fileIndex: 1, offset: 0 });
  assert.deepEqual(locate(files, 160), { fileIndex: 2, offset: 10 });
  assert.deepEqual(locate(files, -5), { fileIndex: 0, offset: 0 });
  assert.deepEqual(locate(files, 999), { fileIndex: 2, offset: 25 });
  assert.equal(bookPosition(files, 2, 10), 160);
});

test('one chapter per file, titled from file names', () => {
  const chapters = chaptersFromFiles(files);
  assert.equal(chapters.length, 3);
  assert.deepEqual(chapters[1], { index: 1, title: '02 Middle', fileIndex: 1, start: 100, end: 150 });
  assert.equal(chaptersFromFiles([files[0]])[0].title, 'Chapter 1');
  assert.equal(chapterAt(chapters, 120)?.index, 1);
  assert.equal(chapterAt(chapters, 175)?.index, 2);
});

test('formatTime', () => {
  assert.equal(formatTime(0), '0:00');
  assert.equal(formatTime(65), '1:05');
  assert.equal(formatTime(3723), '1:02:03');
  assert.equal(formatTime(-30), '-0:30');
});

test('sleep timer', () => {
  assert.equal(sleepDue(null, 10, 0), false);
  assert.equal(sleepDue({ kind: 'minutes', endsAt: 100 }, 99, 0), false);
  assert.equal(sleepDue({ kind: 'minutes', endsAt: 100 }, 100, 0), true);
  assert.equal(sleepDue({ kind: 'chapterEnd', chapterIndex: 1 }, 0, 1), false);
  assert.equal(sleepDue({ kind: 'chapterEnd', chapterIndex: 1 }, 0, 2), true);
});
