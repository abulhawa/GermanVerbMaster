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

## Task 11 Detailed Breakdown – Client State Refactor

| # | Subtask | Description & Deliverables | Dependencies |
|---|---------|----------------------------|---------------|
| 11a | **Client Task Model Inventory** | Catalogue the client modules that still depend on verb primitives (`client/src/lib/verbs.ts`, `client/src/lib/review-queue.ts`, `client/src/lib/answer-history.ts`, `client/src/pages/home.tsx`, verb-specific components). Define the target task descriptor shape that mirrors the server registry introduced in Tasks 8–10 (`shared/task-registry.ts`). Produce an ADR documenting renamed types (`PracticeTask`, `TaskPrompt`, `TaskSolution`) and storage keys. | Tasks 1–10 (audit context, server task registry) |
| 11b | **Task Feed & Registry Wiring** | Implement a POS-agnostic fetch layer that calls `GET /api/tasks` with filters, validates payloads against `shared/task-registry.ts`, and exposes task registry metadata to the client. Preserve `/api/quiz/verbs` as a fallback path while parity is validated. Deliverables: `client/src/lib/tasks.ts`, shared registry import glue, telemetry for deprecation headers. | Subtask 11a, Tasks 8–10 |
| 11c | **State Store Migration** | Replace verb-centric state stores with task-centric equivalents: session controller, progress tracker, answer history, and review queue persistence. Migrate local storage keys to namespaced task IDs (`taskId`, `lexemeId`) with upgrade scripts that ingest existing verb data. Document migration strategy and failure handling. | Subtasks 11a–11b |
| 11d | **UI Integration & Presets** | Update practice flows (`home`, practice card, progress display) to consume the new task store, switch renderers by `taskType`, and expose a “Verbs only” preset that maps to the task registry verb queue. Ensure accessibility, loading states, and offline cache hooks remain functional. Deliverables: updated components plus Storybook/visual acceptance notes. | Subtasks 11a–11c |
| 11e | **Parity & Regression Tests** | Add Vitest coverage that cross-checks the client registry against the shared registry, verifies local storage migrations, and ensures the verb-only preset still queues tasks identical to the legacy path. Include Playwright smoke targeting mixed POS sessions once UI renderers land. | Subtasks 11a–11d |

> **Task 11a Deliverable:** See [`docs/adr/011-client-task-model-inventory.md`](./adr/011-client-task-model-inventory.md) for the approved client task model inventory and descriptor plan.

### Acceptance Considerations
- **Data Contracts**: The client must reuse the schemas defined in `shared/task-registry.ts` to validate prompts/solutions returned from the API, preventing drift between server Task 8 wiring and client usage.
- **Backwards Compatibility**: Existing verb-only saves, review queues, and analytics pings must continue functioning via migration scripts until Task 16 shadow mode validates full parity.
- **Observability**: Capture metrics or console warnings when the fallback `/api/quiz/verbs` path is exercised so remaining dependencies can be identified before enabling additional POS cohorts.

### Open Questions for Implementation
1. How should task renderer lookup behave when a renderer is missing locally (e.g., feature flag disabled)? Consider a graceful fallback that surfaces a maintenance card instead of throwing.
2. Do we promote task presets (All/Verbs/Nouns/Adjectives) in Task 11 or defer to Task 12’s UI mode switcher? Proposed approach: keep presets internal in Task 11, expose toggles visually in Task 12.
3. What migration window is acceptable for local storage upgrades? Decide whether to keep dual-write logic for one release or rely on an immediate migration script.
