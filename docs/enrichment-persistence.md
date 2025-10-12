# Enrichment Data Persistence

The enrichment pipeline stores the provider snapshots that get applied to a word in two different
places:

1. **Database** – every enrichment run inserts a row into the
   `enrichment_provider_snapshots` table with the provider payload that was collected.
   The `words` table keeps track of when enrichment was last applied and what method was used.
2. **Repository checkout** – whenever the pipeline is executed with the `apply` trigger it also
   writes the selected provider snapshot to `data/enrichment/<pos>/<provider>.json`. These files are
   the source of truth for the seed script and can be committed to the repository.

Because the production API runs inside a long-lived environment the JSON files generated at apply
time stay on that filesystem. When we want to synchronise the latest applied data back into the
repository we can export it directly from the database.

## Exporting applied snapshots

Run the export script with `tsx` (or through the `npm` alias) from the repository root. The script
connects to the configured `DATABASE_URL`, fetches the latest applied snapshot for every
`(lemma, pos, provider)` combination, and rewrites the JSON files under `data/enrichment`.

```bash
npm run enrichment:export -- --clean
```

Passing `--clean` (or `-c`) removes the existing `data/enrichment` directory before the export so
stale entries are cleared. Omit the flag to merge with whatever is already on disk.

After running the command, review the changes under `data/enrichment` and commit them to persist the
new enrichment data in git.

## Why the server still persists locally

The server continues to write JSON snapshots as part of the apply flow so that local development or
self-hosted deployments can operate entirely from the filesystem. The export script gives us an easy
way to mirror whatever is in the hosted database back into version control when needed (for example
before cutting a release or taking a manual backup).
