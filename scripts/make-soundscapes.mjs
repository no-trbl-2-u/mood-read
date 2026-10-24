// Writes the six ambient soundscapes (01.7) into assets/soundscapes/ from scripts/soundscapes/synth.mjs: seeded,
// procedural, this project's own work, no third-party license (agents.md rule 6, A18). Deterministic: running it
// again rewrites the same bytes. Mono 16-bit PCM WAV at 16 kHz: sample-exact in every decoder, so the loop's wrap is
// the seam the synthesis made, with no encoder priming silence (AAC adds some; see assets/soundscapes/README.md).
// Usage: node scripts/make-soundscapes.mjs
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { LOOPS, wav } from "./soundscapes/synth.mjs";

const OUT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "assets", "soundscapes");

mkdirSync(OUT, { recursive: true });
for (const { file, render } of LOOPS) {
  const bytes = wav(render());
  writeFileSync(path.join(OUT, file), bytes);
  console.log(`wrote assets/soundscapes/${file} (${Math.round(bytes.length / 1024)} KB)`);
}
