// The open-source notices (design/system/DECISION.md, Iconography; spec 06, 06.4) are shown word for word: the
// in-app /licenses screen's text (src/ui/licenses.ts) and the web build's /licenses.txt (public/) must equal what
// scripts/licenses.mjs writes from each installed package's license file, so neither can drift from it.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { notices, sourceFile, textFile } from "../../scripts/licenses.mjs";
import { NOTICES } from "../ui/licenses.ts";

const root = new URL("../../", import.meta.url);
const read = (p: string) => readFileSync(new URL(p, root), "utf8").replace(/\r\n/g, "\n");

test("each notice on the licenses screen is its package's license file, word for word", () => {
  assert.equal(NOTICES.length, 3);
  for (const n of NOTICES) assert.equal(n.text, read(`node_modules/${n.file}`), n.name);
});

test("the notices 06.1's rights check requires are all there", () => {
  const lucide = NOTICES.find((n) => n.package === "lucide-react-native")!.text;
  assert.match(lucide, /^ISC License/);
  assert.match(lucide, /Copyright \(c\) 2026 Lucide Icons and Contributors/);
  assert.match(lucide, /derived from the Feather project/);
  assert.match(lucide, /Copyright \(c\) 2013-present Cole Bemis/);
  assert.match(NOTICES.find((n) => n.package === "react-native-svg")!.text, /Copyright \(c\) \[2015-2016\] \[Horcrux\]/);
  assert.match(
    NOTICES.find((n) => n.package === "@expo-google-fonts/bricolage-grotesque")!.text,
    /SIL OPEN FONT LICENSE Version 1\.1/,
  );
});

test("src/ui/licenses.ts and public/licenses.txt are what scripts/licenses.mjs writes now", () => {
  const list = notices();
  assert.equal(read("src/ui/licenses.ts"), sourceFile(list), "run node scripts/licenses.mjs");
  assert.equal(read("public/licenses.txt"), textFile(list), "run node scripts/licenses.mjs");
  assert.match(read("public/licenses.txt"), /Lucide/);
});
