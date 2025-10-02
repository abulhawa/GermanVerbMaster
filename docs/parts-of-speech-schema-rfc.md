# RFC: Lexeme-Centric Schema and Identifiers

- **Status**: Draft for review 2025-02-06
- **Authors**: Platform Team
- **Related Tasks**: Parts-of-speech expansion tasks 1–5

## 1. Context

The verb-only audit highlighted tight coupling between practice flows and verb-specific tables (`verbs`, `verb_practice_history`, `verb_scheduling_state`). To unlock noun and adjective training without regressing the existing experience, we need a lexeme-first schema that:

1. Encodes deterministic identifiers so packs, telemetry, and scheduling can refer to the same task without collisions.
2. Supports heterogeneous inflectional data while keeping storage efficient.
3. Tracks scheduling and telemetry separately from content so restricted data (frequency corpora) never leaves the platform.
4. Keeps a migration path that allows legacy verb APIs to remain operational until client parity lands.

## 2. Goals

- Introduce shared tables for `lexemes`, `inflections`, and `task_specs` that capture all POS.
- Separate content bundles (`content_packs`) from device-specific scheduling state.
- Provide join tables that connect packs to lexemes, enabling curated experiences and licensing controls.
- Capture telemetry weights that will feed the blended priority logic planned for later tasks.
- Maintain deterministic IDs built from source + lemma + revision to support reproducible ETL runs.

## 3. Non-Goals

- Removing legacy verb tables (handled after shadow mode tasks).
- Shipping client-facing APIs (`/api/tasks`) or registries (future tasks).
- Implementing ETL; this RFC only defines storage contracts ETL must honour.

## 4. Proposed Schema

### 4.1 Lexemes

| Column | Type | Notes |
| --- | --- | --- |
| `id` | TEXT PRIMARY KEY | Deterministic ID: `de:{pos}:{lemma}:{source_hash}`. Stored lowercase. |
| `lemma` | TEXT NOT NULL | Canonical dictionary form. |
| `language` | TEXT NOT NULL DEFAULT `de` | Future-proof for additional locales. |
| `pos` | TEXT NOT NULL | `verb`, `noun`, `adjective`, etc. |
| `gender` | TEXT | ISO gender codes (`m`, `f`, `n`). |
| `metadata` | JSON | Bag for POS-specific traits (e.g., separable prefix, noun class). |
| `frequency_rank` | INTEGER | Optional; not exported in packs. |
| `source_ids` | JSON NOT NULL DEFAULT `[]` | Unique identifiers from upstream datasets. |
| `created_at` / `updated_at` | INTEGER | `unixepoch` timestamps maintained via triggers or ETL.

### 4.2 Inflections

| Column | Type | Notes |
| --- | --- | --- |
| `id` | TEXT PRIMARY KEY | Deterministic: `inf:{lexeme_id}:{feature_hash}`. |
| `lexeme_id` | TEXT NOT NULL REFERENCES `lexemes(id)` ON DELETE CASCADE | |
| `form` | TEXT NOT NULL | Orthographic form. |
| `features` | JSON NOT NULL | Structured bundle (case, number, tense, person, degree, etc.). |
| `audio_asset` | TEXT | Optional pointer to audio file. |
| `source_revision` | TEXT | E.g., Wiktextract dump revision. |
| `checksum` | TEXT | Hash for QA/regression diffs. |
| `created_at` / `updated_at` | INTEGER | Standard timestamps.

Unique index: `(lexeme_id, features_hash)` to prevent duplicates (features hash stored inside JSON metadata for ETL).

### 4.3 Task Specs

| Column | Type | Notes |
| --- | --- | --- |
| `id` | TEXT PRIMARY KEY | Deterministic: `task:{lexeme_id}:{task_type}:{rev}`. |
| `lexeme_id` | TEXT NOT NULL REFERENCES `lexemes(id)` ON DELETE CASCADE | |
| `pos` | TEXT NOT NULL | Mirrors lexeme POS for faster filtering. |
| `task_type` | TEXT NOT NULL | E.g., `conjugate_form`, `noun_case_declension`. |
| `renderer` | TEXT NOT NULL | Client renderer key. |
| `prompt` | JSON NOT NULL | Render payload. |
| `solution` | JSON NOT NULL | Answer payload. |
| `hints` | JSON | Optional hints array. |
| `metadata` | JSON | e.g., difficulty, audio_id. |
| `revision` | INTEGER NOT NULL DEFAULT 1 | Increment when prompt/solution changes. |
| `source_pack` | TEXT | Optional default pack slug. |
| `created_at` / `updated_at` | INTEGER | Standard timestamps.

Unique index: `(lexeme_id, task_type, revision)`.

### 4.4 Scheduling State

| Column | Type | Notes |
| --- | --- | --- |
| `id` | INTEGER PRIMARY KEY AUTOINCREMENT | |
| `user_id` | INTEGER REFERENCES `users(id)` | Optional (null for anonymous). |
| `device_id` | TEXT NOT NULL | Maintains device-scoped queues. |
| `task_id` | TEXT NOT NULL REFERENCES `task_specs(id)` ON DELETE CASCADE | |
| `leitner_box` | INTEGER NOT NULL DEFAULT 1 | |
| `total_attempts` | INTEGER NOT NULL DEFAULT 0 | |
| `correct_attempts` | INTEGER NOT NULL DEFAULT 0 | |
| `average_response_ms` | INTEGER NOT NULL DEFAULT 0 | |
| `accuracy_weight` / `latency_weight` / `stability_weight` | REAL NOT NULL DEFAULT 0 | Blended priority components. |
| `priority_score` | REAL NOT NULL DEFAULT 0 | Cached scheduler score. |
| `due_at` | INTEGER | Next due timestamp. |
| `last_result` | TEXT NOT NULL DEFAULT `correct` | Enum matches practice result. |
| `last_practiced_at` | INTEGER | Timestamp. |
| `created_at` / `updated_at` | INTEGER | Standard timestamps.

Unique index: `(device_id, task_id)` ensures one scheduling row per device/task.

### 4.5 Content Packs

| Column | Type | Notes |
| --- | --- | --- |
| `id` | TEXT PRIMARY KEY | Deterministic: `pack:{slug}:{version}`. |
| `slug` | TEXT NOT NULL UNIQUE | Human-friendly identifier. |
| `name` | TEXT NOT NULL | Display name. |
| `description` | TEXT | |
| `language` | TEXT NOT NULL DEFAULT `de` | |
| `pos_scope` | TEXT NOT NULL | `verb`, `noun`, `mixed`, etc. |
| `license` | TEXT NOT NULL | SPDX identifier or short text. |
| `license_notes` | TEXT | Attribution text. |
| `version` | INTEGER NOT NULL DEFAULT 1 | |
| `checksum` | TEXT | Hash of serialized pack for diffing. |
| `metadata` | JSON | Additional tags (difficulty, tier). |
| `created_at` / `updated_at` | INTEGER | Standard timestamps.

### 4.6 Pack ↔ Lexeme Map

| Column | Type | Notes |
| --- | --- | --- |
| `pack_id` | TEXT NOT NULL REFERENCES `content_packs(id)` ON DELETE CASCADE | |
| `lexeme_id` | TEXT NOT NULL REFERENCES `lexemes(id)` ON DELETE CASCADE | |
| `primary_task_id` | TEXT REFERENCES `task_specs(id)` | Highlights default renderer. |
| `position` | INTEGER | Sort order inside pack. |
| `notes` | TEXT | Pack-specific annotations. |

Composite primary key: `(pack_id, lexeme_id)`.

### 4.7 Telemetry Priorities

| Column | Type | Notes |
| --- | --- | --- |
| `id` | INTEGER PRIMARY KEY AUTOINCREMENT | |
| `task_id` | TEXT NOT NULL REFERENCES `task_specs(id)` ON DELETE CASCADE | |
| `sampled_at` | INTEGER NOT NULL DEFAULT `unixepoch('now')` | |
| `priority_score` | REAL NOT NULL | Observed blended score. |
| `accuracy_weight` / `latency_weight` / `stability_weight` | REAL NOT NULL DEFAULT 0 | Mirrors scheduler components. |
| `frequency_rank` | INTEGER | Optional reference to corpora data. |
| `metadata` | JSON | ETL revision, corpus source, etc.

### 4.8 Deterministic ID Contracts

- **Lexeme IDs**: `lowercase(normalise(lemma))` combined with canonical POS and upstream dataset identifier hashed via SHA1 to 8 hex chars. Example: `de:noun:kind:wx3af912`.
- **Inflection IDs**: `inf:{lexeme_id}:{sha1(features + form)[0:10]}`.
- **Task IDs**: `task:{lexeme_id}:{task_type}:{revision}`.
- **Pack IDs**: `pack:{slug}:{version}` (slug validated to `[a-z0-9-]+`).

ETL must produce the same IDs on re-run to guarantee referential integrity and deduplicate telemetry.

## 5. Migration Strategy

1. Add new tables alongside existing verb tables. No data moves yet; migrations only create structures and indexes.  
2. Seed deterministic IDs later via ETL refactor task (Task 6).  
3. Update Drizzle schema to export new tables for TypeScript consumers.  
4. Document rollback: dropping new tables does not affect legacy flows; run `DROP TABLE` in reverse order (`telemetry_priorities`, `pack_lexeme_map`, `content_packs`, `scheduling_state`, `task_specs`, `inflections`, `lexemes`).

## 6. Open Questions

- Should `task_specs` include localisation fields (`prompt_translations`)? Proposed to defer until multi-language UI.  
- Do we require multi-tenant `organisation_id` columns now? Not until partner integration requirements firm up.  
- How will we store audio assets (filesystem vs. S3)? Placeholder `audio_asset` column unblocks schema without final decision.  
- Should `frequency_rank` live in a separate restricted table? Chosen approach keeps it nullable in `lexemes` but we may move it later if licensing demands.

## 7. Approvals

- **Design**: Pending (requires confirmation that renderer mapping covers initial UI flows).  
- **Content Ops**: 👍 Received 2025-02-05 regarding pack licensing columns.  
- **Engineering**: Pending architecture review.
