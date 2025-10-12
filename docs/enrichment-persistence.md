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

### Step-by-step setup on AWS (Free Tier friendly)

Follow these steps to configure a lightweight S3 backup target:

1. **Create the bucket**
   - Open the AWS console and go to **S3 → Create bucket**.
   - Choose a globally unique bucket name (for example `gvm-enrichment-backups`).
   - Pick a region close to your deployment (the Free Tier covers standard S3 storage in most
     regions). Disable "Block all public access" only if you explicitly need public reads—backups
     should stay private by default.

2. **Prepare credentials**
   - (Recommended) Create an IAM user dedicated to enrichment backups with `AmazonS3FullAccess` or a
     custom policy scoped to the new bucket.
   - Generate an access key pair for that user and record the `Access key ID` and `Secret access key`.
   - Alternatively, if you are deploying on AWS infrastructure that supports IAM roles (e.g. ECS,
     Lambda), attach a role with the same permissions instead of long-lived access keys.

3. **Populate environment variables**
   - Set `ENRICHMENT_S3_BUCKET` to the bucket name.
   - Set `ENRICHMENT_S3_REGION` to the bucket region (e.g. `us-east-1`). This ensures the SDK bypasses
     cross-region redirects.
   - Optionally set `ENRICHMENT_S3_PREFIX` to group snapshots under a prefix like
     `backups/enrichment`. Leave it empty to write objects at the root of the bucket.
   - Provide credentials via the standard AWS variables:

     ```bash
     export AWS_ACCESS_KEY_ID=...      # from the IAM user (skip when using an IAM role)
     export AWS_SECRET_ACCESS_KEY=...
     export AWS_REGION=us-east-1       # matches the bucket region
     ```

4. **Verify connectivity (optional but recommended)**
   - Install the AWS CLI and run `aws s3 ls s3://$ENRICHMENT_S3_BUCKET/` to confirm that the
     credentials can list the bucket.
   - If you are using a custom endpoint or an S3-compatible service (e.g. MinIO), set
     `ENRICHMENT_S3_ENDPOINT` and `ENRICHMENT_S3_FORCE_PATH_STYLE=true` before verifying.

5. **Trigger an upload**
   - Run `npm run enrichment:export -- --clean` to regenerate local snapshots, or apply enrichment
     data through the admin UI.
   - Confirm that new objects appear in the bucket under the expected prefix. You should see files
     such as `backups/enrichment/noun/provider.json` shortly after the export or apply finishes.

These steps keep you within the Free Tier for low-volume backups. Standard S3 pricing applies once
you exceed the Free Tier allowances or store large amounts of enrichment data.

### Switching to Supabase Storage

Supabase offers an [S3-compatible Storage API](https://supabase.com/docs/guides/storage/s3) that the
enrichment uploader can target without code changes. You only need to swap out the credentials and
endpoint in the environment:

1. **Create a storage bucket** in the Supabase dashboard (under **Storage → Buckets**). Buckets are
   private by default; keep them that way for backup data.
2. **Generate S3 credentials** from **Project Settings → Storage → S3 access keys**. Create a new
   key pair and note the access key and secret.
3. **Populate the enrichment environment variables**:

   ```bash
   export ENRICHMENT_S3_BUCKET=<your-supabase-bucket>
   export ENRICHMENT_S3_ENDPOINT=https://<project-ref>.supabase.co/storage/v1/s3
   export ENRICHMENT_S3_REGION=us-east-1        # Supabase accepts any region label
   export ENRICHMENT_S3_FORCE_PATH_STYLE=true   # required for Supabase's path-style API
   export AWS_ACCESS_KEY_ID=<supabase-access-key>
   export AWS_SECRET_ACCESS_KEY=<supabase-secret>
   ```

4. **Run the same verification/upload steps** as with AWS (`aws s3 ls` against the Supabase
   endpoint and `npm run enrichment:export -- --clean`).

Switching vendors is therefore a matter of provisioning Supabase credentials and pointing the
existing uploader at the Supabase endpoint. Because the integration continues to use the S3 API,
you can switch back to AWS (or any other S3-compatible provider) by restoring the original
environment values.

## Why the server still persists locally

The server continues to write JSON snapshots as part of the apply flow so that local development or
self-hosted deployments can operate entirely from the filesystem. The export script gives us an easy
way to mirror whatever is in the hosted database back into version control when needed (for example
before cutting a release or taking a manual backup).
