# mood-read

Mood Read: an audiobook player that scores each chapter. See [`spec.md`](spec.md).

This repo is built by the nexus loop: the rule book is [`agents.md`](agents.md), the plan is
[`plan/README.md`](plan/README.md), and the stack and standing decisions are in
[`plan/bearings.md`](plan/bearings.md).

```bash
pnpm install
pnpm verify          # the gate every commit passes
node scripts/install-hooks.mjs   # once per checkout: arms the pre-commit and pre-push hooks
```

## Develop

```bash
pnpm install
pnpm web             # dev server, web (expo start --web)
pnpm exec playwright install chromium   # once, for the e2e leg
pnpm build           # the web build, into dist/ (expo export -p web)
pnpm e2e             # the hermetic smoke walk over dist/ on localhost:4173
pnpm verify          # the nexus gates, typecheck, lint, unit tests, build and e2e
```
