# Content Admin Guide – Lexeme Rollout

## Overview
The admin dashboard at `/admin` now manages verbs, nouns, and adjectives from a single words table while the lexeme-based task system rolls out. This guide documents the controls content editors need to curate entries, trigger ETL updates, and verify offline readiness.

## Prerequisites
- Confirm admin tooling is enabled locally (defaults to on when `NODE_ENV` is not `production`).
- When enabled, set an `ADMIN_API_TOKEN` in your `.env` file and restart the server so protected routes accept updates.
- Confirm the lexeme schema is enabled (`ENABLE_LEXEME_SCHEMA=true`).
- Run `npm install` followed by `npm run dev` so the React admin UI and Express API are available locally.

## Navigating the dashboard
1. Open `http://localhost:5000/admin` and enter the admin token when prompted. The token is stored locally for the session.
2. Use the **Part of speech** filter to switch between verbs (`V`), nouns (`N`), adjectives (`Adj`), and the other supported categories imported from upstream sources.
3. Combine filters for CEFR level, approval status, and completeness to focus on items that are ready for queue promotion.
4. Click a row to edit: the drawer surfaces shared metadata (translations, examples, sources) along with POS-specific fields such as auxiliary verbs, noun plurals, or adjective degrees.
5. Save changes to issue a `PATCH /api/words/:id` request. Successful edits automatically refresh the table and invalidate cached rows.

## Coordinating with ETL & offline bundles
1. After curating a batch, run `npm run seed` to re-aggregate source CSVs and refresh deterministic task specs in the database via the template registry.
2. When promoting new POS content, reseed after QA signs off on the regenerated tasks and monitor the `/api/tasks` responses during the first live session.
3. Exercise `/api/tasks` or the practice UI to confirm learners receive the refreshed prompts before sign-off.

## Exporting approved words to JSONL
Once a POS slice is ready to back up or publish, use the dedicated export endpoints and CLI helpers to sync the database with the JSONL feeds under `data/sync/`:

- `GET /api/admin/export/status` returns the number of dirty rows overall and per POS plus the oldest `updated_at` timestamp. A non-zero count means a bulk export should run before taking a snapshot.
- `POST /api/admin/words/:id/save-to-files` performs a targeted export for a single word. On success the API appends an `op: "upsert"` line to `data/sync/<pos>.updates.jsonl`, marks the word’s `exported_at`, and updates `data/sync/manifest.json` so local tooling mirrors the change.
- `POST /api/admin/export/bulk` with an optional `{ "pos": "V", "limit": 250 }` body streams the dirty queue in batches, appending JSONL updates and resetting `exported_at` for each successful row.

During development the assistant stores exports under `data/sync/` using the layout described in `docs/pos-jsonl-sync-plan.md`. The default can be overridden by setting `JSONL_LOCAL_DIR` before starting the server or running CLI tasks.

### Snapshot and seeding workflows

- `npm run export:compact -- --pos V` compacts the approved verb corpus into `data/sync/versions/<timestamp>/v.snapshot.jsonl(.br)` (compression is enabled when `COMPRESS_SNAPSHOTS=true`). The command also rotates `data/sync/v.updates.jsonl`, archives it under the versioned `updates/` folder, and rewrites both `data/sync/manifest.json` and `data/sync/latest/manifest.json` to point at the fresh snapshot.
- `npm run seed:jsonl -- --pos V` restores the selected POS from `data/sync/latest/manifest.json`. Snapshot entries are upserted by `export_uid`, updates replayed in order (`op: "delete"` removes rows), and every restored word keeps `exported_at=NULL` so the next export run revalidates content.
- Passing `--snapshot-only` skips replaying the updates stream, which is useful after generating a pristine snapshot.

### Bucket layout reference

The local mirror matches the production bucket structure described in the sync plan:

```
data/sync/
  manifest.json                # dev mirror (per-POS updates under ./<pos>.updates.jsonl)
  latest/
    manifest.json              # points to the newest version and live updates
    updates/<pos>.updates.jsonl
  versions/<timestamp>/
    <pos>.snapshot.jsonl(.br)
    updates/<pos>.updates.jsonl
    manifest.json
```

When publishing to cloud storage, replicate the same hierarchy under `exports/latest` and `exports/versions/<timestamp>` so the seeding CLI can resolve manifests without code changes.

## Troubleshooting checklist
- **Unauthorized responses**: confirm the admin token matches the `.env` value and that the request includes the `x-admin-token` header.
- **Missing noun/adjective fields**: verify the lexeme schema feature flag remains enabled; falling back to the legacy stack hides the new form controls.
- **Practice queue issues**: reseed to regenerate tasks, inspect `/api/tasks` responses for malformed payloads, fix upstream data issues, and reseed before retrying.
- **Need a clean slate**: run `npm run db:reset` to drop and recreate the `public` schema, clear drizzle metadata, and wipe everything under `data/` except `data/pos/`. Follow up with `npm run db:push` to reapply migrations before seeding or restoring JSONL snapshots.
