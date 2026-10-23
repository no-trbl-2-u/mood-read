# Archive

> Append-only: one line per finished chunk, added in the commit
> that closes it. Never edited or reordered. Mark this file
> `merge=union` in `.gitattributes` so parallel closes never
> conflict.

---

Format: `- <date> · <chunk> · <what now works, ≤ 10 words> ·
<commit or range>`. A finished spec gets one more line,
`- <date> · <NN> · spec complete: <title> · absorbed into
identity · deleted in <sha>`; recover its text with
`git log --diff-filter=D -- plan/<NN>-*.md`.
- 2026-10-23 · 03.1 · Three layout boards (A/B/C) compared, recommending chapter river · 24fb1be2..f6aee111
- 2026-10-23 · 02.1 · Expo app shell boots, with typecheck/lint/unit tests in the gate · 552d7f4b..67bd58b4
- 2026-10-23 · 03.2 · Option B, chapter river, is the layout contract · 358ef4e1..358ef4e1
- 2026-10-23 · 03 · spec complete: Layout pass · absorbed into plan/bearings.md Layout and design/layouts/DECISION.md · deleted in "plan: settle 03.2"
- 2026-10-23 · 01.9 · Streaming study: no service may play under narration · 1ac37fe9..1ac37fe9
- 2026-10-23 · 01.12 · SoundCloud study: link out, bundle hand-checked CC-BY tracks · 34202194..34202194
- 2026-10-23 · 01.13 · Workarounds study: CC, generated music, companion mode, DRM-free stores · 4ef5173d..0db06502
- 2026-10-23 · 02.2 · pnpm verify builds the web app and walks it hermetically · 79f6ee10..32b20f36
- 2026-10-23 · 02.3 · A push to main deploys to mood-read.pages.dev · eccba633..eccba633
- 2026-10-23 · 02.4 · pnpm secrets:sync fills the live mood-read-proxy Worker · 14aeba4c..ecb04b50
- 2026-10-23 · 02 · spec complete: Bootstrap · absorbed into plan/bearings.md Stack, External services, Verify gate and Operational notes · deleted in "plan: settle 02.4"
