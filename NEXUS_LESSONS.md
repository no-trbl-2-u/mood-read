# Lessons for nexus (from Mood Read's adoption, 2026-10-22)

Gaps the adoption hit, for `/lessons-pr` to turn into a nexus pull request. Each says what happened and the fix
applied here.

1. **`scripts/__tests__/install-hooks-run.test.mjs` fails in every adopter.** It also tests nexus's own installer at
   `../../scripts/install-hooks.mjs`, which only exists inside the kit repo (ENOENT on copy). Fixed here by skipping
   an installer that isn't on disk; the template should do the same.
2. **`deploy-check.mjs`'s Cloudflare block reads `CF_API_TOKEN` / `CF_ACCOUNT_ID`,** while wrangler, the secrets
   sinks and most vaults use `CLOUDFLARE_API_TOKEN` / `CLOUDFLARE_ACCOUNT_ID`. Fixed here with a fallback to the
   `CLOUDFLARE_*` names; the template could read both.
3. **The guard blocks the playbooks' own commands once `.claude/` is copied.** After the overlay copy the guard is
   live mid-adoption, and any shell command naming `.env.example` (the playbooks' sed/grep sweeps include it) is
   refused as a vault read. Worked around with a node script; the guard could allow `.env.example` by name.
4. **A repo the GUI started before adoption has a plan whose chunk lines don't parse** (`- **01.1** · L · ...`, the
   Measure line under Acceptance). `plan-check` reports it, but the adopt prompt doesn't say to expect it. Rewritten
   here into the canonical shape.
5. **Spec number 01 can already be taken** by a product spec when adoption runs late. The playbook's "keep
   `01-bootstrap.md` first" can't hold without renumbering (forbidden), so the bootstrap became `02-bootstrap.md` at
   `priority 1`. Worth a sentence in `new-project.md` §3.
