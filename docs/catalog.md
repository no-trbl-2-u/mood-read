# The music catalog

Spec 05 (`plan/05-mood-read-v2.md`), chunk 05.1, acceptance A1: every piece in the catalog carries a license that
allows playing it in the app (CC0, public domain, CC-BY or CC-BY-SA), a rights-checker `yes`, vocals `none` and mood
tags; nothing else enters it.

The contract lives in code, in one module the app and the scripts both import: `src/lib/catalog.ts` (types and the
validator). This page writes it out for people. If the two ever differ, the code wins and this page is fixed.

## Where it lives

- One Cloudflare R2 bucket (default name `mood-read-catalog`), public and read-only to the app.
- `catalog.json` at the bucket's root: the manifest.
- `pieces/<sha256>.<ext>`: one audio file per piece, named by the SHA-256 of its bytes, so a key never changes
  meaning. `<ext>` is `m4a` (AAC, `audio/mp4`) or `opus` (Opus, `audio/ogg`).
- The app reads both from one public base URL, `expo.extra.catalogBaseUrl` in `app.json`
  (`src/lib/catalog-config.ts`): the bucket's r2.dev address, `https://pub-4a8a6c86fad24ced839c7dc3d3f4dc66.r2.dev`
  (05.19). With the placeholder `https://mood-read-catalog.invalid` the app fetches nothing.
- Public read is r2.dev's; writes need the vault's S3 credentials. The bucket's CORS rule allows GET and HEAD
  (with `Range`) from `https://mood-read.pages.dev` and `http://localhost:8081` (local web dev); native builds need
  none. The e2e guard (`e2e/guard.ts`) answers the address with an empty catalog, so no test reaches R2.

## catalog.json

```json
{ "schema": 1, "version": 7, "updatedAt": "2026-10-24T12:00:00.000Z", "pieces": [ <CatalogPiece>, ... ] }
```

- `schema`: the shape version, 1. A file with any other schema is refused whole.
- `version`: goes up by one with every `catalog:add`.
- `updatedAt`: the ISO time of the last add.
- `pieces`: the entries. No two share an id or a file.

## CatalogPiece

Spec 01's `Piece` (`src/lib/types.ts`):

| Field | Rule |
|---|---|
| `id` | lowercase slug (a-z, 0-9, dashes), 80 characters at most; unique |
| `title`, `artist` | non-empty text |
| `kind` | `score`, `instrumental` or `ambient` |
| `vocals` | exactly `none` (A20) |
| `moodTags` | one or more of the scorer's fixed set: tension, sorrow, wonder, joy, dread, calm, romance, triumph; no repeats |

plus:

| Field | Rule |
|---|---|
| `intensity` | `low` or `high` (A2 asks for both per emotion) |
| `source` | https URL of the recording's page; the URL the rights-checker checked |
| `license` | `{ id, version, url }`: `id` one of `cc0`, `public-domain`, `cc-by`, `cc-by-sa`; `version` "1.0" for cc0, "1.0" to "4.0" for cc-by and cc-by-sa, `null` for public domain; `url` the deed's https URL (`null` allowed only for public domain) |
| `credit` | the credit line the license asks for; required for cc-by and cc-by-sa, otherwise `null` or a courtesy line |
| `verdict` | the rights-checker's verdict record, below |
| `duration` | seconds, above zero |
| `loop` | `{ start, end }` seconds, 0 <= start < end <= duration |
| `file` | `{ key, sha256, bytes, format, contentType }`: `key` is `pieces/<sha256>.<ext>`, `sha256` lowercase hex, `bytes` a positive integer, `format` `aac` or `opus`, `contentType` `audio/mp4` or `audio/ogg` to match |
| `addedAt` | ISO time of the add |

NC, ND and all-rights-reserved never enter (D7). The app ignores, and never plays or names, any entry that fails;
`catalog:add` refuses it, with every reason.

## The rights-checker's verdict record

A node script cannot call a sub-agent, so the person (or the lead agent) runs the `rights-checker` sub-agent
(`.claude/agents/rights-checker.md`) on the recording, with the question "Recording `<source URL>` for piece
`<title>`: may Mood Read stream it from its catalog and loop it under narration in a free app? Does it have vocals of
any kind?", and writes its block down as JSON:

```json
{
  "by": "rights-checker",
  "verdict": "allowed",
  "vocals": "none",
  "useChecked": "stream from Mood Read's catalog and loop under narration in a free app, credited on a Credits screen",
  "source": "https://<the recording's page>",
  "license": { "id": "cc-by", "version": "4.0" },
  "evidence": [
    { "quote": "<the clause, word for word>", "url": "https://<where it was read>", "readOn": "2026-10-24" }
  ],
  "conditions": "attribution",
  "checkedOn": "2026-10-24"
}
```

Only `allowed` (the checker's yes; `"yes"` is accepted and stored as `allowed`) with vocals `none` enters.
`unclear` and `not-allowed` are refused: unclear counts as no (agents.md rule 6). `source` must equal the piece's
`source`, and `license` must equal the piece's license id and version.

## Adding a piece

The piece's metadata, everything above but `verdict`, `file` and `addedAt` (those are filled in), as `piece.json`:

```json
{
  "id": "night-vigil", "title": "Night Vigil", "artist": "A. Composer", "kind": "instrumental", "vocals": "none",
  "moodTags": ["dread", "tension"], "intensity": "low",
  "source": "https://<the recording's page>",
  "license": { "id": "cc-by", "version": "4.0", "url": "https://creativecommons.org/licenses/by/4.0/" },
  "credit": "\"Night Vigil\" by A. Composer, licensed under CC BY 4.0",
  "loop": { "start": 0, "end": 120 }
}
```

`duration` is read from the file's container when it states one (and a stated `duration` must agree within a
second); otherwise give it. `loop` defaults to the whole file.

```
node scripts/secrets.mjs run --only CLOUDFLARE_S3_ACCESS_KEY_ID,CLOUDFLARE_S3_SECRET_ACCESS_KEY,S3_API_ENDPOINT -- \
  pnpm catalog:add path/to/night-vigil.m4a --piece piece.json --verdict verdict.json --dry-run
```

Drop `--dry-run` to write. `--bucket <name>` (or `CATALOG_BUCKET`) picks another bucket. The script checks the file
is AAC or Opus and not DRM-locked, hashes it, builds the entry, checks it with the app's validator, reads
`catalog.json` (refusing to write over one that fails its own check), refuses a repeated id or file, uploads the audio
under its content address, then writes `catalog.json` with `version` one higher. Credentials come only from the
environment and are never printed.

One writer at a time: the script reads, then writes `catalog.json` without a conditional write, so two adds at once
could lose one.
