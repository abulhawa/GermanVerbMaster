# Enrichment Data Persistence

The enrichment pipeline stores the provider snapshots that get applied to a word in two different
places:

1. **Database** – every enrichment run inserts a row into the
   `enrichment.enrichment_provider_snapshots` table with the provider payload that was collected.
   The `words` table keeps track of when enrichment was last applied and what method was used.
2. **Repository checkout** – whenever the pipeline is executed with the `apply` trigger it also
   writes the selected provider snapshot to `data/enrichment/<pos>/<provider>.json`. These files are
   the source of truth for the seed script and can be committed to the repository.

## Applying the enrichment schema

Run the standard migration helper after provisioning a database to create the `enrichment`
schema and its tables without touching the `public` schema owned by the core application. The
`drizzle.config.ts` file now points Drizzle to `db/enrichment-schema.ts`, which only re-exports the
enrichment tables, and the `schemaFilter` setting is pinned to `enrichment` so Drizzle ignores the
`public` schema entirely. Either workflow below keeps the public tables untouched:

```bash
npm run db:push
# or, if you prefer to call drizzle-kit directly
npx drizzle-kit push
```

Both commands read the SQL migrations under `migrations/` and create the enrichment schema plus the
`enrichment.enrichment_provider_snapshots` and `enrichment.word_enrichment_drafts` tables. Use the
same commands whenever new enrichment migrations are added.

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

When you want to trim the database history after capturing the latest files, add `--purge` (or
`-p`). The flag deletes the exported `apply` snapshots from `enrichment.enrichment_provider_snapshots`
once the JSON files have been written so the next export only processes snapshots created after the
purge. Each snapshot is still preserved in the generated files, so commit the updated
`data/enrichment` directory first if you need to keep an audit trail.

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

### Manual applies and words backups

Single-word applies made through the admin UI now record a `manual` provider snapshot so the
changes show up in the JSON exports and Supabase backups. The export script also writes a
`data/enrichment/backups/words-*.json` file that captures the full contents of the `words` table.
Each run refreshes a `words-latest.json` alias so storage syncing can overwrite the canonical copy in
Supabase.

Run the Supabase sync endpoint (or the "Export enrichment" button in the storage admin page) to push
both the provider snapshots and the `words` backup into the configured bucket. The API response (and
UI) reports where the latest backup was uploaded.

### Restoring from Supabase

Use the restore helper to pull the JSON backup from Supabase and repopulate the `words` table. The
script truncates the table before importing the backup and resets the sequence, so ensure you are
targeting an environment that should be replaced.

```bash
npm run enrichment:restore -- --object words-latest.json --force
```

Omit `--object` to fall back to `words-latest.json`. The script requires the Supabase
environment variables (`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, and
`ENRICHMENT_SUPABASE_BUCKET`) so it can download the JSON payload directly from Storage.

## Why the server still persists locally

The server continues to write JSON snapshots as part of the apply flow so that local development or
self-hosted deployments can operate entirely from the filesystem. The export script gives us an easy
way to mirror whatever is in the hosted database back into version control when needed (for example
before cutting a release or taking a manual backup).
