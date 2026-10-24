// The display face ships from assets/fonts/ (src/app/_layout.tsx says why), as an exact copy of the installed
// package's file, with the package's OFL text beside it: an upgrade of the package that changes either fails here.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const root = new URL("../../", import.meta.url);
const pkg = "node_modules/@expo-google-fonts/bricolage-grotesque/";
const read = (p: string) => readFileSync(new URL(p, root));
const text = (p: string) => read(p).toString("utf8").replace(/\r\n/g, "\n");

test("the bundled Bricolage Grotesque ExtraBold is the package's file, byte for byte", () => {
  const ours = read("assets/fonts/BricolageGrotesque_800ExtraBold.ttf");
  const theirs = read(`${pkg}800ExtraBold/BricolageGrotesque_800ExtraBold.ttf`);
  assert.ok(ours.length > 0);
  assert.ok(ours.equals(theirs));
});

test("the OFL text sits beside the font, word for word", () => {
  assert.equal(text("assets/fonts/OFL.txt"), text(`${pkg}LICENSE_FONT`));
  assert.match(text("assets/fonts/OFL.txt"), /SIL OPEN FONT LICENSE Version 1\.1/);
});
