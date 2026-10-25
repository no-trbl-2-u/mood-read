# catalog/

The committed sources of Mood Read's music catalog (spec 05, 05.2) and a snapshot of what is live.

- `pieces/<id>.json`: each piece's metadata as it went to `catalog:add` (`--piece`).
- `verdicts/<id>.json`: the rights-checker's verdict record for that piece (`--verdict`).
- `catalog.json`: a copy of the live manifest, fetched back from the bucket after the last add.

The bucket is the source of truth: the app reads `catalog.json` and the audio from R2, never from here.
`catalog.json` in this folder is a snapshot, refreshed after every add, so the tests can hold the live catalog
to A1 and A2 (`src/lib/catalog-coverage.test.ts`: every entry passes the validator, every emotion at low and high
intensity has at least three pieces, and every source here matches its snapshot entry). Audio files are never
committed; they live in R2 under their content address.

## Adding a piece

1. Run the `rights-checker` sub-agent on the recording (docs/catalog.md, "The rights-checker's verdict record").
   Only `allowed` with vocals `none` enters; unclear counts as no.
2. Write `pieces/<id>.json` and `verdicts/<id>.json`.
3. Dry run, then add (one writer at a time):

   ```
   node scripts/secrets.mjs run --only CLOUDFLARE_S3_ACCESS_KEY_ID,CLOUDFLARE_S3_SECRET_ACCESS_KEY,S3_API_ENDPOINT -- \
     node scripts/catalog-add.mjs path/to/<id>.m4a --piece catalog/pieces/<id>.json --verdict catalog/verdicts/<id>.json --dry-run
   ```

   Drop `--dry-run` to write.
4. Refresh the snapshot (the query string dodges the 60 s cache) and commit it with the two sources:

   ```
   curl -fsS "https://pub-4a8a6c86fad24ced839c7dc3d3f4dc66.r2.dev/catalog.json?v=<version>" -o catalog/catalog.json
   ```

If `catalog:add` refuses a piece, it does not enter: delete its two source files.
