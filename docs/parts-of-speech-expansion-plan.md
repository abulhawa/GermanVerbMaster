# Parts of Speech (POS) Expansion Plan

## Vision
Extend GermanVerbMaster from a verb-only trainer into a comprehensive German vocabulary coach that covers all major parts of speech (POS) while preserving a dedicated verb-only practice mode. The expanded experience should allow learners to drill nouns, adjectives, adverbs, pronouns, prepositions, conjunctions, and determiners with the same depth currently available for verbs.

## Guiding Principles
- Maintain backward compatibility for existing verb drills and offline behaviour.
- Keep the spaced-repetition and analytics pipelines POS-aware without duplicating logic.
- Ensure new dataset ingestion and admin tooling workflows remain ergonomic for content editors.
- Ship incremental, testable slices that always leave the app in a working state.

---

## Phase 1 – Foundation and Research
1. **Audit Current Verb-Only Assumptions**
   - Inventory API routes, client hooks, database schema, and seed scripts that assume `pos = 'verb'`.
   - Document required generalisations (naming, enums, filtering) to support multiple POS.
2. **Content Strategy**
   - Identify data sources for each POS (existing CSVs, external corpora, manual curation).
   - Define metadata required per POS (gender for nouns, comparative forms for adjectives, etc.).
3. **Design UX for POS Selection**
   - Draft UX flows for selecting practice categories (POS-level and mixed-mode).
   - Validate navigation adjustments (home screen, filters, review queues) with stakeholders.

---

## Phase 2 – Data Model and Infrastructure
4. **Introduce Lexeme-Centric Schema**
   - Replace the verb-specific `words` table with a three-table model: `lexemes`, `inflections`, and `task_specs`.
   - Store POS, tags, and metadata on `lexemes`; keep morphological features (tense, case, degree, etc.) inside the `inflections.features` JSON payload.
   - Capture drill configuration inside `task_specs` with `task_type`, `task_type_version`, `payload`, and `difficulty`, enabling task reuse across POS.
   - Generate deterministic identifiers (e.g., UUIDv5) for `lexeme_id` and `inflection_id` derived from `(lemma, pos, features)` so re-ingesting content preserves user progress and prevents duplicates.

5. **Scheduling and Analytics Alignment**
   - Create a `scheduling_state` table that tracks one SRS timeline per lexeme (EF, interval, due date, streak) plus aggregated weakness per task type.
   - Store review history snapshots for analytics (`review_snapshots` with task breakdowns) to support future tuning.
   - Update priority scoring utilities to combine SRS due dates with `weakness_by_task_type` and `coverage_balance` metrics, logging their contributions for observability.
   - Persist per-task priority telemetry in a dedicated `telemetry_priorities` table capturing `{snapshot_id, task_id, pos, due_score, weakness_score, coverage_score, total_priority, created_at}` to enable evidence-based tuning.

6. **Seeder and ETL Enhancements**
   - ✅ Refactored ETL scripts to emit lexeme + inflection + task bundles for each POS, generating paradigms for verbs, nouns, adjectives, adverbs, and governed prepositions inside `scripts/etl/golden.ts`.
   - ✅ POS-specific validators now enforce required fields (noun gender/plural, verb principal parts, adjective degrees, governed case for prepositions) and surface warnings for incomplete enrichment payloads.
   - ✅ Attribution bundler collates `sources_csv` entries into deterministic pack metadata so CC BY-SA obligations follow each export.
   - ✅ Use the enrichment pipeline `POS_FILTERS` toggle to validate Kaikki-driven noun and adjective payloads before wiring full ETL loops. The pipeline now parses `POS_FILTERS` from the environment, honours aliases, and is covered by `tests/enrichment/pipeline-config.test.ts` so noun/adjective-only dry runs are safe before widening ETL coverage.
   - ✅ Fold the new `words.pos_attributes` enrichment output (Kaikki tags, governed cases, usage notes) into lexeme metadata so separability/reflexivity requirements are already staged when the lexeme schema lands. `scripts/enrichment/pipeline.ts` merges provider suggestions into `words.pos_attributes`, with regression coverage in `tests/enrichment/pipeline-pos-attributes.test.ts` and rollout notes in the README.
   - ✅ Export deterministic “packs” per POS (e.g., `packs/nouns.de.json`) with checksums to guarantee idempotent updates and offline parity. The generated files under `data/packs/*.json` now carry stable pack IDs, checksums, and scoped lexeme/task bundles per POS.
   - ✅ Attach pack metadata (`pack_id`, `pack_version`, `source`, `license`, `checksum`) to each pack header and persist installations in a `content_packs` table plus a `pack_lexeme_map` join table for safe rollbacks and provenance tracking. The drizzle schema and migrations define both tables, and pack headers embed the provenance fields consumed by the practice pack installation helpers.
   - ✅ Ship a `packs:lint` command that validates POS-required fields, flags unreachable or duplicate tasks, checks license presence, and verifies pack metadata before publishing. The `npm run packs:lint` script (backed by `scripts/packs-lint.ts`) enforces these constraints and ships with dedicated Vitest coverage.
   - ✅ Introduce minimal DDL additions for `content_packs`, `pack_lexeme_map`, and `telemetry_priorities` to back the new provenance and analytics flows. Drizzle migrations and `db/schema.ts` expose the tables, and analytics consumers log priority calculations into `telemetry_priorities` for future tuning.

7. **Task Generation Policy**
   - Document per-POS task templates, including queue caps (e.g., “max 2 adjective-ending tasks per lexeme per queue”) and article/case permutations, to keep the scheduler predictable.
   - Capture these policies alongside task definitions so the API and clients can enforce consistent variety and workload.

8. **Initial Task Seeding Milestone**
   - After the schema lands, immediately seed and wire three representative task types end-to-end: `conjugate_form` (verbs), `noun_case_declension` (nouns), and `adj_ending` (adjectives).
   - Stand up the task registry across API, client, and offline layers using these types before onboarding broader content, de-risking integration work early.

9. **API Layer Updates**
   - Serve tasks rather than POS-specific pages: implement endpoints that filter and return task queues (e.g., `GET /api/tasks?pos[]=noun&taskType[]=noun_case_declension&limit=20`).
   - Support submissions via `POST /api/submission` with task metadata and latency capture; expose review queue summaries and snapshots.
   - Maintain verb-only aliases (e.g., `/api/review-queue/verbs`) during migration and document deprecation timelines.

---

## Phase 3 – Client Application
10. **State Management and Hooks**
   - Refactor client stores/hooks to request tasks by type and POS filters, keeping verb-only mode as a preset.
   - Add a task-type registry on the client mirroring the server (e.g., `'conjugate_form' | 'noun_case_declension' | 'adj_ending' | 'prep_case_choice'`).
   - Add a parity unit test that asserts the client renderer registry matches server task types, preventing runtime “unsupported task type” errors.
   - Update priority display logic to surface why an item was selected (due date, weakness, coverage).

11. **UI Enhancements**
   - Implement a practice mode switcher (All / Verbs / Nouns / Adjectives / Custom…) with persistence across sessions.
   - Render task UIs per task type with contextual hints (“Dativ Plural (mit Artikel)”) and an accessibility checklist covering focus order, labels, keyboard completion, and ARIA live regions for feedback.
   - Expose settings that preview upcoming queue distribution by POS/task type so learners can fine-tune their mix.

12. **Offline & PWA Support**
   - Store review queues locally as arrays of tasks; ensure sync updates operate on `lexeme_id` and append per-task history for analytics.
   - Extend service worker caching to cover new task endpoints and POS packs, validating mixed-mode behaviour offline.
   - Update export/import flows to include lexemes, inflections, scheduling state, and compact task history records.

---

## Phase 4 – Testing and Quality Assurance
13. **Automated Test Coverage**
   - Add acceptance tests for representative tasks (e.g., `noun_case_declension` verifying “den Kindern” for Dativ plural with article).
   - Extend scheduler tests to confirm priority ordering when `weakness_by_task_type` or `coverage_balance` changes, and protect verb-only regression scenarios.
   - Expand e2e coverage to exercise POS filters, offline sync, submission logging, and basic accessibility smoke checks via Playwright.
   - Ensure offline bundles (verbs + nouns + adjectives) pass export/import round-trip tests with network disabled.

14. **Content QA**
   - Create review checklists per POS (accuracy, morphological completeness, audio/pronunciation if applicable).
   - Run pilot sessions with representative learners to gather feedback and adjust difficulty tuning.

15. **Migration Safety**
   - Build a one-time migration script that backfills verbs into the new lexeme/inflection schema while keeping shadow reads against the legacy tables during rollout.
   - Instrument the shadow mode to log divergences between old and new queues and block the cutover until parity criteria are met.
   - Document a rollback: set `ENABLE_LEXEME_SCHEMA=false` to re-enable legacy endpoints.

---

## Phase 5 – Deployment and Rollout
16. **Feature Flagged Release**
   - Introduce feature flags to stage POS types incrementally (e.g., nouns beta, adjectives beta).
   - Monitor telemetry and error logs for POS-specific issues before full launch. Add a kill switch per task type.

17. **Documentation and Training**
   - Update README, admin guides, and onboarding docs to explain new workflows.
   - Train content editors on updated admin dashboard filters and data entry requirements, including ETL validation steps.

18. **Post-Launch Iterations**
   - Collect analytics on usage per POS/task type and adjust scheduler weights accordingly.
   - Prioritise backlog improvements (audio clips, example sentences) for newly added POS and refine coverage quotas.

---

## Acceptance Targets and Regression Guards
- **Verb parity**: Verb-only mode produces the same queue as before (allowing tie-break noise) during and after migration.
- **Noun check**: `noun_case_declension` for *Kind* (Dativ plural, definite article) accepts “den Kindern”.
- **Priority behaviour**: Lower 7-day accuracy on adjective endings surfaces `adj_ending` tasks above verbs with equal due pressure.
- **Offline bundle**: Mixed queues (verbs + nouns + adjectives) operate offline, and export/import round-trips state plus installed packs.
- **Task registry parity**: Server task types and client renderers remain in sync.

---

## Last‑Mile Policies
- **Answer normalization**: Enforce German orthography rules (capitalized nouns, `ß` vs `ss`, umlaut normalization) and maintain an accepted-variants list.
- **Performance budgets**: Queue build < **50 ms** P50 / < **150 ms** P95 on dev hardware; snapshot write < **10 ms**. Alert if breached.
- **Licensing guard**: CI fails packs without explicit `license`/`source` fields.

---

## Definition of Done (per phase)
- **Phase 2 DoD**: migrations applied; 3 task types seeded; `GET /api/tasks` returns mixed queues; telemetry rows written; `packs:lint` passes on golden packs.
- **Phase 3 DoD**: client registry parity test green; mode switcher works; offline mixed queue works; export/import round-trips.
- **Phase 4 DoD**: acceptance tests pass (Kind → “den Kindern”); verb parity test passes; Playwright offline test passes.
- **Phase 5 DoD**: feature flags per POS; “nouns beta” behind flag; rollback switch documented.

---

## Two‑Week Green‑Path Sprint
- Migrations: `lexemes`, `inflections`, `task_specs`, `scheduling_state`, `content_packs`, `pack_lexeme_map`, `telemetry_priorities`.
- Seed golden packs + implement 3 task types end-to-end.
- API: `GET /api/tasks`, `POST /api/submission`; keep `/api/review-queue/verbs`.
- Client: task registry + 3 renderers, mode switcher, offline cache.
- Tests: engine/priority, parity, noun acceptance, Playwright offline.
- Docs: README updates + `packs:lint` usage.
