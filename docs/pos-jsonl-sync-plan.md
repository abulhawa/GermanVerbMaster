# POS JSONL Sync (DB ⇄ JSONL) – Updated Implementation Plan

This document finalises the sync plan after reconciling it with the existing Drizzle schema, admin flows, and seeding utilities in this repo. Key adjustments focus on limiting schema churn, clarifying how the current `words` records map to export JSON, and enumerating concrete follow-up changes across the API, CLI, and infrastructure pieces.

## Context & Goals

* **DB remains the source of truth.** JSONL snapshots/updates mirror approved content so that a wiped database can be restored.
* **Snapshots + updates are both published.** Snapshots are compressed Brotli archives; updates stay as newline-delimited JSON for easy append/replay.
* **Manifest-driven seeding.** A manifest tells a seeding tool which snapshot to load and which update stream to replay.
* **Admin workflows stay in the current `words` UI.** We extend the API to surface dirty/export status while keeping the editing UX unchanged.

## Schema & Migration Work

1. **Add `exported_at` (nullable) to `words`.** `updated_at` already exists; we keep it and rely on existing server code paths that set `updates.updatedAt = sql\`now()\``. Migration steps:
   * Add `exported_at TIMESTAMPTZ NULL DEFAULT NULL`.
   * Backfill: leave `exported_at` `NULL` so that the first "Export all" run after deployment pushes a full update set.
   * Create an index (partial or computed) on `(pos, exported_at)` to speed up dirty queries; alternatively, add a materialised view for reporting, but begin with a database-level index to keep migrations simple.
2. **Introduce a stable export identifier.** `words.id` is serial and unsuitable for cross-environment replay. Add `export_uid UUID NOT NULL DEFAULT gen_random_uuid()` with a unique index. Expose it in Drizzle and treat it as the `word_id` in exported objects. Existing rows auto-populate via default.
3. **Optional view for dirty tracking.** Define a SQL view `words_export_queue` exposing `{ id, export_uid, pos, updated_at, exported_at, needs_export BOOLEAN }` where `needs_export` is computed as `exported_at IS NULL OR exported_at < updated_at`. This keeps reporting logic server-side while allowing the API to join against the view.
4. **Update Drizzle schema + Zod models** in `db/schema.ts` / `types` so that new columns are available and validated everywhere.

## Data Normalisation & Serialization Rules

1. **Export payload (`ExportWord`).**
   * `word_id` comes from `export_uid`.
   * `lemma`, `approved`, `last_updated` map to the corresponding DB fields.
   * `forms` is derived from `posAttributes` when present; for verbs, include conjugation slots; for nouns/adjectives/adverbs fall back to the legacy column fields (`plural`, `comparative`, `superlative`, etc.) so we do not silently drop data.
   * `translations` merges the legacy `english` column, `translations` JSON array, and any enrichment-sourced translations into a `Record<string, string>` keyed by ISO code.
   * `examples` come from `examples` JSON plus enrichment history. Normalisation rules:
     - Deduplicate via `example.id` when present, otherwise by `(sentence.de, translation lang, translation text)`.
     - Apply NFC normalisation + trim.
     - Emit the `Example` shape with multi-language support (`sentence.de`, optional `sentence.<lang>` fields, `translations`, `source`, `approved`).
     - Sort examples deterministically (stable locale compare on `sentence.de`, then translation language/code).
   * Always include `schema: "1.0.0"`.
   * `op` is omitted for snapshots and set to `"upsert"`/`"delete"` in update lines.
2. **Unicode helpers.** Add shared utilities (likely under `shared/`) for NFC conversion, whitespace trimming, and dedupe key generation so the CLI and API reuse the same logic.

## File Layouts

```
data/
  sync/
    manifest.json                   # latest local manifest mirror (dev only)
    <pos>.updates.jsonl             # append-only updates (dev)
    <pos>.snapshot.jsonl            # most recent snapshot (dev)
  enrichment/<pos>/<provider>.json  # unchanged existing files
```

```
<bucket>/exports/
  latest/
    manifest.json
    updates/<pos>.updates.jsonl             # composed append object (preferred)
    updates/events/<ts>-<uid>.jsonl         # fallback when compose unsupported
  versions/<YYYY-MM-DD_HHMMSS>/
    <pos>.snapshot.jsonl.br
    manifest.json
```

* Snapshots in `versions/` are immutable. Each version directory carries its own manifest for reproducibility.
* `latest/manifest.json` points to the newest version and to the active updates feed for every POS.
* Local development mirrors the `latest` manifest so that seeding CLI can operate without a bucket.

## API & Admin Updates

1. **Per-word export endpoint** `POST /admin/words/:id/save-to-files`:
   * Wrap in a transaction: lock the row (`FOR UPDATE SKIP LOCKED`), load `words_export_queue` metadata, and construct `ExportWord` with `op: "upsert"`.
   * Append to local `data/sync/<pos>.updates.jsonl` if `JSONL_LOCAL_DIR` exists, using atomic append (temp file + rename).
   * Write to bucket: prefer compose API; fallback to single-line event objects.
   * On success, set `exported_at = now()` for the row (same transaction). On failure, roll back and return a structured error.
   * When a word is soft-deleted (approved toggled off + removed from UI), emit `op: "delete"` with minimal payload and mark `exported_at` once the delete line is written.
2. **Bulk export endpoint** `POST /admin/export/bulk`:
   * Accept filters `{ pos?: string, limit?: number }`.
   * Iterate dirty rows (view + `needs_export`) in batches (e.g., 250-500) with `FOR UPDATE SKIP LOCKED` to avoid conflicts with per-word exports.
   * Reuse the same append/write helpers as the per-word path.
   * Update `exported_at` individually on success; collect and report failures without aborting the whole batch.
   * Response shape `{ attempted, succeeded, failed, errors: Array<{ wordId, message }> }`.
3. **Status endpoint** `GET /admin/export/status`:
   * Read from the export queue view to compute total dirty counts and per-POS breakdown.
   * Include `oldest_dirty_updated_at` to surface stale data in the UI.
4. **Admin UI tweaks** (React client):
   * Banner showing `Unsaved changes: X` plus "Export all" button wired to the bulk endpoint.
   * Table row badges: `Dirty`, `Exported {relative time}`, `Export failed`. Keep to existing design guidelines in `docs/ui-ux-guidelines.md`.
   * Toast messaging for per-word export success/failure.

## CLI & Background Jobs

1. **Compaction CLI** `npm run export:compact -- --pos <pos> --out versions/<ts>`:
   * Query all approved words for the POS with the same normaliser used by the API.
   * Emit snapshot JSONL (no `op`). Compress to Brotli when `COMPRESS_SNAPSHOTS=true`.
   * Upload to `exports/versions/<ts>/<pos>.snapshot.jsonl(.br)`.
   * Rotate updates: archive current updates object (or leave event objects untouched), create a fresh empty updates file, and reset local append files in development.
   * Write `exports/versions/<ts>/manifest.json`, then atomically replace `exports/latest/manifest.json`. Mirror the manifest locally when `JSONL_LOCAL_DIR` is configured.
2. **Seeding CLI** `npm run seed:jsonl -- --pos <pos> [--source bucket|local] [--snapshot-only]`:
   * Load `manifest.json` (local or bucket) and resolve snapshot/updates URIs.
   * Stream snapshot lines, applying upserts keyed by `export_uid` (insert new or update existing `words` rows). Maintain a lookup to link exports back to `lexemes` if needed.
   * Replay updates newer than the snapshot timestamp; apply `upsert`/`delete` semantics (delete by `export_uid`). Track the max `last_updated` per word.
   * Set `updated_at` to the payload timestamp; leave `exported_at` `NULL` so the export queue remains accurate after restore.
   * Support `--snapshot-only` flag to skip updates.
3. **Shared helpers** for:
   * Atomic local append (`write temp → fsync → append` or `rename`).
   * S3/GCS writes with compose fallback.
   * Manifest read/write with temp object + atomic replace.
   * Unicode normalisation, dedupe, and deterministic sorting.

## Error Handling & Observability

* Wrap bucket writes and local appends in try/catch; propagate structured errors back to the admin UI.
* Log failures with `word_id`, POS, and operation type for traceability.
* Consider metrics (e.g., statsd counter) for export success/failure rates if existing telemetry pipeline allows.
* Bulk export should partially succeed; maintain `export_errors` table or in-memory list returned to the caller.

## Testing Strategy

1. **Unit tests** for normalisation, dedupe, and JSONL serialization (both snapshots and updates) using Vitest.
2. **Integration tests** in `tests/admin-verbs-route.test.ts` (or new suite):
   * Editing a word marks it dirty (`needs_export=true`).
   * Per-word export endpoint clears the dirty flag and appends a line locally (mock FS).
   * Bulk export processes batches, handles failures, and updates `exported_at`.
3. **CLI tests** (Node scripts) using temporary directories/buckets mocks for compaction + seeding round-trips.
4. **E2E test**: wipe DB → run seeding CLI → verify admin `/api/words` returns the restored data.

## Deployment & Operational Notes

* Feature flag the new export endpoints until the first manifest is published.
* Document the bucket layout and credentials in `docs/content-admin-guide.md`.
* Run the compaction CLI once post-deploy to generate the inaugural snapshot and manifest.
* Ensure CI runs `npm test`, `npm run check`, and new CLI smoke tests before publishing updates.
