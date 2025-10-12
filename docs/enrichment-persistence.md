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
If the command exits with `No applied enrichment snapshots found.` double-check that you have
applied the enrichment changes (the admin UI apply flow or the pipeline with `--apply`) and that
the updated words have a non-null `enrichment_method` in the database.

```bash
npm run enrichment:export -- --clean
```

Passing `--clean` (or `-c`) removes the existing `data/enrichment` directory before the export so
stale entries are cleared. Omit the flag to merge with whatever is already on disk.

After running the command, review the changes under `data/enrichment` and commit them to persist the
new enrichment data in git. The local filesystem continues to be the canonical source for
bootstrap/seed data, so expect to find the snapshots under `data/enrichment/<pos>/<provider>.json`.

## Publishing snapshots to S3

Production deployments can back up the filesystem artefacts to an object store. The enrichment
storage helper automatically uploads the provider JSON files to S3 whenever the following
environment variables are present:

| Variable | Description |
| --- | --- |
| `ENRICHMENT_S3_BUCKET` | **Required.** Bucket name that should receive the provider JSON files. |
| `ENRICHMENT_S3_PREFIX` | Optional key prefix (for example `backups/enrichment`). Trailing slashes are ignored. |
| `ENRICHMENT_S3_REGION` | AWS region for the bucket. Falls back to `AWS_REGION` when omitted. |
| `ENRICHMENT_S3_ENDPOINT` | Optional custom endpoint (useful for S3-compatible storage). |
| `ENRICHMENT_S3_FORCE_PATH_STYLE` | Set to `true`/`1` to force path-style URLs for S3-compatible storage. |

The AWS SDK picks up credentials from the standard environment variables (`AWS_ACCESS_KEY_ID`,
`AWS_SECRET_ACCESS_KEY`, etc.) or from the runtime IAM role. Uploads happen automatically both when
the admin applies enrichment data and when the export script regenerates local files.

## Why the server still persists locally

The server continues to write JSON snapshots as part of the apply flow so that local development or
self-hosted deployments can operate entirely from the filesystem. The export script gives us an easy
way to mirror whatever is in the hosted database back into version control when needed (for example
before cutting a release or taking a manual backup).
