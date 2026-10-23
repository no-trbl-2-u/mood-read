// Spec 01 A5: ID3v2 edge cases the tag reader must survive.
import assert from "node:assert/strict";
import { test } from "node:test";

import { parseId3v2 } from "./id3.ts";
import { cat, JPEG } from "./test-fixtures.ts";

const syncsafe = (n: number) => [(n >> 21) & 127, (n >> 14) & 127, (n >> 7) & 127, n & 127];
const enc = (s: string) => [...s].map((c) => c.charCodeAt(0) & 0xff);
const v24Frame = (id: string, data: number[] | Uint8Array) =>
  cat(enc(id), syncsafe(data.length), [0, 0], data instanceof Uint8Array ? data : new Uint8Array(data));
const v24Tag = (flags: number, ...frames: Uint8Array[]) => {
  const body = cat(...frames);
  return cat(enc("ID3"), [4, 0, flags], syncsafe(body.length), body);
};
/** ID3 unsynchronisation: a 0x00 after every 0xFF that is followed by 0xE0+ or 0x00 (or ends the data). */
function unsync(b: Uint8Array): Uint8Array {
  const out: number[] = [];
  for (let i = 0; i < b.length; i++) {
    out.push(b[i]);
    if (b[i] === 0xff && (i + 1 === b.length || b[i + 1] === 0 || b[i + 1] >= 0xe0)) out.push(0);
  }
  return new Uint8Array(out);
}

test("A5 ID3v2.4: the tag-level unsynchronisation flag undoes the inserted zeros in every frame", () => {
  const title = unsync(new Uint8Array([0, 0x41, 0x62, 0xff, 0xe0])); // Latin-1 "Ab\xFF\xE0"
  const pic = unsync(cat([0], enc("image/jpeg"), [0, 3], enc("c"), [0], JPEG));
  const t = parseId3v2(v24Tag(0x80, v24Frame("TIT2", title), v24Frame("APIC", pic)));
  assert.equal(t.title, "Ab\u00ff\u00e0");
  assert.deepEqual(t.cover?.data, JPEG);
});

test("A5 ID3v2.4: a frame's own unsynchronisation flag is not undone twice under the tag flag", () => {
  const raw = unsync(new Uint8Array([0, 0x41, 0xff, 0x00, 0x42]));
  const frame = cat(enc("TIT2"), syncsafe(raw.length), [0, 0x02], raw);
  // The original holds a real FF 00 (FF, then a value separator): one pass keeps it, two would merge the values.
  assert.equal(parseId3v2(v24Tag(0x80, frame)).title, "A\u00ff, B");
});
