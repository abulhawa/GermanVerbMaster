# Verb-Only Assumption Audit

## Overview
This audit identifies server, client, database, and tooling surfaces that still assume GermanVerbMaster only trains verbs. Each finding lists the hard-coded verb dependency and the generalisation work required to support additional parts of speech.

## API Routes
| Endpoint | File | Verb-only assumption | Generalisation requirement |
| --- | --- | --- | --- |
| `GET /api/quiz/verbs` | `server/routes.ts` | Filters `words` with `pos = "V"` and maps results to the verb-only payload returned to the client. | Replace with a POS-aware task feed (e.g., `GET /api/tasks`) that can emit task descriptors for any POS while keeping `/api/quiz/verbs` as a legacy alias during migration. |
| `POST /api/practice-history` | `server/routes.ts` | Persists attempts into `verb_practice_history`, updates `verb_analytics`, and only forwards verb identifiers to the SRS engine. | Introduce generic practice logging that records `{lexeme_id, task_type, pos}` and routes to a POS-agnostic scheduler before deprecating the verb tables. |
| `GET /api/practice-history` & `GET /api/analytics` | `server/routes.ts` | Reads from `verb_practice_history` / `verb_analytics`, returning verb-scoped records. | Create unified history and analytics views that aggregate by POS and task type so the UI can request mixed queues. |
| `GET /api/review-queue` | `server/routes.ts` | Delegates entirely to the verb-focused SRS engine and returns verb queue items. | Replace queue generation with the upcoming task registry and scheduler so queues can contain heterogeneous POS tasks. |
| `GET /api/partner/drills` | `server/routes.ts` | Limits partner exports to canonical verbs (`pos = "V"`) and returns only conjugation prompts. | Expose partner drill exports that accept POS filters and emit prompt bundles for nouns/adjectives alongside verbs. |

## Client Hooks & Utilities
| Area | File | Verb-only assumption | Generalisation requirement |
| --- | --- | --- | --- |
| Verb fetching helpers | `client/src/lib/verbs.ts` | Fetches `/api/quiz/verbs`, caches verb seeds, and normalises responses into `GermanVerb`. | Replace with a task registry client that loads task metadata per POS and exposes selectors for mixed practice queues. |
| Answer history | `client/src/lib/answer-history.ts` | Persists answers keyed by `GermanVerb`, practice mode, and verb-focused prompts. | Expand history entries to reference generic `taskId`/`lexemeId` pairs so progress can be tracked across POS. |
| Home practice flow | `client/src/pages/home.tsx` | All state (settings, progress, history) is keyed by verbs and calls `getRandomVerb`/`getVerbByInfinitive`. | Introduce a POS-aware practice controller that can switch renderers based on task type while maintaining verb-only defaults. |
| Review queue local cache | `client/src/lib/review-queue.ts` | Stores queues as verb infinitives and only dequeues verb strings. | Update to store task descriptors (task id, pos, renderer) so mixed queues can be enqueued locally. |

## Database & Persistence
| Component | File | Verb-only assumption | Generalisation requirement |
| --- | --- | --- | --- |
| Scheduling state | `db/schema.ts` (`verb_scheduling_state`, `verb_review_queues`) | Device scheduling rows and cached queues are keyed by verb infinitive. | Replace with POS-neutral `scheduling_state`/`task_queue` tables that store task ids, POS, and renderer hints. |
| Practice history & analytics | `db/schema.ts` (`verb_practice_history`, `verb_analytics`) | Tables only support verbs and lack fields for POS/task metadata. | Create consolidated practice/analytics tables keyed by lexeme and task identifiers so accuracy/latency metrics work for every POS. |
| Verb catalog | `db/schema.ts` (`verbs` table) | Separate verb table powers legacy exports and QA bundles. | Transition to a shared `lexemes` table with inflection bundles so verbs, nouns, and adjectives share one canonical catalog. |

## Scripts & Tooling
| Script | File | Verb-only assumption | Generalisation requirement |
| --- | --- | --- | --- |
| Seed pipeline | `scripts/seed.mjs` | Generates QA bundles under `client/public/verbs` and only snapshots `pos = 'V'` entries for practice seeding. | Emit deterministic `lexeme`/`inflection` payloads for every POS and generate per-POS QA fixtures. |
| Verb artifact builder | `scripts/build-verbs.mjs` | Produces `verbs.seed.json` plus level bundles derived from verb-only CSVs. | Supersede with a pack builder that emits per-POS task bundles (e.g., noun declension drills). |
| External verb importers | `scripts/fetch-verbs.ts`, `scripts/import_verbs.ts`, `scripts/fetch-reverso-verbs.ts` | Crawl or import only verb sources and load them into verb tables. | Extend ETL to ingest noun/adjective datasets, validate required metadata, and write into shared lexeme/task tables. |
| Analytics baseline | `scripts/baseline-kpis.ts` | Computes KPIs from `verb_practice_history` exclusively. | Update metrics scripts to query the unified practice tables and provide POS filters. |

## Proposed Backlog Items
- Draft the POS-agnostic task API (`GET /api/tasks`, `POST /api/submission`) and plan the deprecation of `/api/quiz/verbs`.
- Design `lexemes`, `inflections`, `task_specs`, and scheduling tables to replace verb-specific schema.
- Replace client verb helpers with a task registry that maps POS/task type to renderers and storage keys.
- Refactor ETL scripts to emit deterministic task bundles for nouns/adjectives alongside verbs, including QA fixtures.
- Update analytics and partner export tooling to consume the new task tables and surface POS filters.
