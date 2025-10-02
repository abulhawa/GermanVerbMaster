# Parts of Speech Expansion – Sequential Task Plan

This execution plan translates the high-level roadmap in [`parts-of-speech-expansion-plan.md`](./parts-of-speech-expansion-plan.md) into a set of sequential, production-ready tasks. Each task is scoped to deliver a reviewable increment that keeps the application releasable while progressively unlocking new parts-of-speech (POS) capabilities.

| # | Task | Description & Deliverables | Key Artifacts | Dependencies |
|---|------|----------------------------|---------------|---------------|
| 1 | **Verb-Only Assumption Audit** | Inventory API routes, client hooks, database schema, and scripts that assume `pos = 'verb'`. Capture findings plus required generalisations in a shared doc. | Audit report, ticket backlog | None |
| 2 | **Content Source Research** | Identify candidate datasets for each POS, noting licensing and required metadata (noun gender, adjective degrees, etc.). Decide short-list of sources per POS. | Content source matrix | Task 1 |
| 3 | **UX Flow Drafts** | Produce wireframes for POS selection (home screen, filters, review queues) and validate navigation updates with stakeholders. | Wireframes, UX approval notes | Task 1 |
| 4 | **Schema & Identifier RFC** | Draft an RFC describing the proposed `lexemes`, `inflections`, `task_specs`, deterministic IDs, and scheduling/telemetry tables. | Schema RFC | Tasks 1–3 |
| 5 | **Migration Implementation** | Apply drizzle migrations for `lexemes`, `inflections`, `task_specs`, `scheduling_state`, `content_packs`, `pack_lexeme_map`, `telemetry_priorities`. Include rollback notes. | Migration PR, migration docs | Task 4 |
| 6 | **Seeder/ETL Refactor** | Update ETL scripts to emit lexeme+inflection+task bundles with deterministic IDs and POS validators. Generate golden packs for verbs, nouns, adjectives. | Updated ETL scripts, sample packs | Task 5 |
| 7 | **Task Policy Documentation** | Document per-POS task templates, queue caps, and enforcement rules to guide API and client behaviour. | Task policy doc | Task 6 (may start parallel once pack fields known) |
| 8 | **Initial Task Type Wiring** | Implement server task registry and seed three representative task types: `conjugate_form`, `noun_case_declension`, `adj_ending`. Ensure migrations produce these seeds. | Task registry module, seeded data | Tasks 5–7 |
| 9 | **API Surface Overhaul** | Introduce `GET /api/tasks` and `POST /api/submission`, exposing task queues and submission logging. Maintain verb-only aliases with deprecation notice. | Updated API routes, OpenAPI notes | Task 8 |
|10 | **Scheduler & Analytics Alignment** | Update scheduling logic to use `scheduling_state`, record review snapshots, compute blended priority, and persist telemetry entries. | Scheduler updates, telemetry tables populated | Tasks 5, 8, 9 |
|11 | **Client State Refactor** | Refactor client stores/hooks to request tasks by POS/task type, add client task registry parity test, and preserve verb-only preset. | Updated stores, registry tests | Tasks 8–10 |
|12 | **UI Mode Switcher & Renderers** | Implement practice mode switcher (All/Verbs/Nouns/Adjectives/Custom) and renderers for the three initial task types with accessibility checks. | UI components, accessibility checklist | Task 11 |
|13 | **Offline & PWA Update** | Extend offline cache/service worker/export-import flows to handle lexeme-oriented queues and packs. Validate mixed-mode offline behaviour. | Service worker updates, offline tests | Tasks 8, 11 |
|14 | **packs:lint Tooling** | Ship `packs:lint` command validating POS-required fields, duplicates, license presence, and metadata integrity. | Lint script, CI integration | Task 6 |
|15 | **Automated Test Suite Expansion** | Add unit, integration, and Playwright coverage for new scheduler behaviour, noun acceptance (`den Kindern`), registry parity, and offline queues. | New test specs, CI green | Tasks 8–13 (tests may start earlier where feasible) |
|16 | **Migration Shadow Mode** | Implement dual-read path comparing legacy verb queues with new task system, logging divergences. Include rollback toggle `ENABLE_LEXEME_SCHEMA`. | Shadow mode instrumentation | Tasks 8–10 |
|17 | **Feature Flag Rollout** | Introduce feature flags to gate each POS (nouns beta, adjectives beta) and implement monitoring/killswitch hooks. | Feature flag config, monitoring dashboards | Tasks 9–13, 16 |
|18 | **Documentation & Training Update** | Refresh README, admin docs, onboarding guides, and author `packs:lint` usage notes. Prepare training deck for content editors. | Updated docs, training materials | Tasks 6–17 |
|19 | **Post-Launch Analytics & Iteration Loop** | Ship dashboards aggregating usage per POS/task type, schedule follow-up tuning of scheduler weights, and create backlog for future enhancements (audio, sentences, etc.). | Analytics dashboards, iteration backlog | Tasks 10, 17 |

## Usage Notes
- Tasks are ordered to minimise rework while maintaining a shippable product after each milestone. Where practical, long-running documentation work (Tasks 7 and 18) can progress concurrently once prerequisites are met.
- Tests should be added alongside feature work (Tasks 8–13) to satisfy regression expectations. Task 15 consolidates any remaining coverage gaps before rollout.
- Deliverables from earlier tasks (especially audits, RFCs, and policies) should be stored in the repository under `docs/` to maintain shared visibility.
