# The cloud loop

`workflows/next.yml` runs one `/next` tick four times a day (02:00, 08:00, 14:00, 20:00 UTC): it reads
`plan/README.md`, settles anything in `plan/pending/`, builds the next eligible chunk, runs the gate and pushes
to main. `workflows/heartbeat.yml` cancels runs wedged past 3h and opens an issue if no tick has succeeded in 26h.
Adapted from the Nexus kit's `march.yml` / `heartbeat.yml` templates.

## Setup

1. Install the Claude Code GitHub App on this repo: https://github.com/apps/claude. Without it the run fails
   with `401 — Claude Code is not installed on this repository`.
2. Run `claude setup-token`, then add the token as the Actions secret `CLAUDE_CODE_OAUTH_TOKEN`.
3. Optional, user-author mode: add a fine-grained `ACTIONS_PAT` (Contents + Issues read/write on this repo
   only), then uncomment the `token:` line and the `GIT_*` env block in `next.yml`.
4. Check it once by hand: `gh workflow run next -f verb=audit`.

## Operating it

- **Ceiling:** 6 cloud commits per 24h, counted by the `Cloud-Run:` trailer. Local commits don't count.
- **Pause / resume:** `gh workflow disable next` / `gh workflow enable next`. Pause before running `/next`
  locally: one writer at a time.
- **Verbs:** `gh workflow run next -f verb=next|settle|audit`.
- **Gate:** once `package.json` exists, `npm run typecheck`, `npm run lint` and `npm test` must pass.
- Chunks that need an owner decision or a device check are skipped and listed in the run's closing audit.

## When something breaks

- **Green run, no commit, "This command requires approval" in the log:** `--permission-mode bypassPermissions`
  was dropped from `claude_args`.
- **A `Cloud next tick crashed` issue:** read the linked run. A one-off flake: `gh run rerun <id>`.
- **Pushes to `.github/workflows/` are rejected from cloud:** the action's app token overrides the PAT for
  workflow files. Make workflow edits locally.
- **Ticks no-op forever:** the plan is out of eligible chunks, or GitHub paused the cron after 60 idle days.
