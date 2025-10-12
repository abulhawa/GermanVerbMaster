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

## Publishing snapshots to Supabase Storage

Production deployments can back up the filesystem artefacts to Supabase Storage. The enrichment
storage helper automatically uploads the provider JSON files whenever the following environment
variables are present:

| Variable | Description |
| --- | --- |
| `SUPABASE_URL` | **Required.** Base URL of the Supabase project (for example `https://xyzcompany.supabase.co`). |
| `SUPABASE_SERVICE_ROLE_KEY` | **Required.** Service-role API key with access to Storage. Use the project settings → API page in Supabase. |
| `ENRICHMENT_SUPABASE_BUCKET` | **Required.** Storage bucket that should receive the provider JSON files. |
| `ENRICHMENT_SUPABASE_PATH_PREFIX` | Optional folder prefix within the bucket (for example `backups/enrichment`). Trailing slashes are ignored. |

### Supabase setup checklist

1. In the Supabase dashboard open **Storage → Buckets** and create (or reuse) a bucket dedicated to
   enrichment backups. The bucket can be public or private—uploads use the service role key so
   policies are bypassed.
2. Navigate to **Project Settings → API** and copy the project URL plus the **service role** key.
   Store them as `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` in your deployment environment.
3. Define `ENRICHMENT_SUPABASE_BUCKET` with the bucket name you created and optionally set
   `ENRICHMENT_SUPABASE_PATH_PREFIX` to group the JSON files under a folder.
4. Restart the server or redeploy so the new environment variables take effect. Subsequent
   enrichment applies and `npm run enrichment:export` executions will synchronise JSON snapshots to
   the configured bucket using `upsert` semantics.

Uploads happen automatically both when the admin applies enrichment data and when the export script
regenerates local files.

## Why the server still persists locally

The server continues to write JSON snapshots as part of the apply flow so that local development or
self-hosted deployments can operate entirely from the filesystem. The export script gives us an easy
way to mirror whatever is in the hosted database back into version control when needed (for example
before cutting a release or taking a manual backup).
