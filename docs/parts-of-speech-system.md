# Parts of Speech System Overview

This guide replaces the historical expansion plans with a concise snapshot of the lexeme-centric practice stack now running in GermanVerbMaster. Use it to understand how verbs, nouns, and adjectives move from source data into learner queues, what toggles control availability, and which supporting docs to consult for operational details.

## Current scope
- `shared/task-registry.ts` exposes three production task types: `conjugate_form` (verbs), `noun_case_declension` (nouns), and `adj_ending` (adjectives). Each entry carries the POS, renderer key, prompt/solution schemas, and a default queue cap so server and client stay aligned.
- The Express API mounts `GET /api/tasks` as the canonical feed. Requests can filter by part of speech and task type while returning deterministic IDs and metadata for every task.
- Practice clients ship with a mode switcher that lets learners blend all task types or focus on a single POS, while a custom preset stores any combination of task types for power users.

## Rollout controls
| Flag | Default | Scope | Notes |
| --- | --- | --- | --- |
| `ENABLE_LEXEME_SCHEMA` | `true` | Server + scripts | Enables the lexeme tables, task registry, and `/api/tasks` endpoints. Turning it off reverts the legacy verb-only stack. |

## Data model
The lexeme schema sits alongside the legacy verb tables so we can run both systems in parallel. Key tables include:

- **`lexemes`** – canonical lemma rows keyed by deterministic IDs with POS, gender, metadata, frequency, and source identifiers (`pos_jsonl:<slug>` for per-POS JSONL seeds plus optional `enrichment:<method>` tags).
- **`inflections`** – surface forms plus a JSON `features` bundle (case, number, tense, etc.) linked back to `lexemes`.
- **`task_specs`** – prompt/solution payloads per lexeme and task type, including renderer, revision, and hints metadata.
- **`practice_history`** – append-only attempt log with POS, task type, latency, hint usage, and CEFR metadata for downstream analytics.

Refer to `db/schema.ts` for column-level details, indices, and relationships.

## Task registry & evaluation
- The shared registry enforces prompt and solution contracts with Zod schemas, ensuring ETL and API payloads stay valid.
- Server entries wrap the shared definitions with evaluation metadata. All current tasks use normalised string equality; adjust the evaluation object when introducing fuzzy matching or multi-answer support.

## API flow
- `/api/tasks` honours POS and task-type filters and returns deterministic metadata for each task.
- Requests simply read from `task_specs` and emit the freshest content; adaptive queue regeneration is no longer required.
- Practice submissions route through `/api/submission`, writing rows to `practice_history` so later analytics can attribute performance.

## Client experience
- The practice mode switcher component exposes presets for “All tasks”, “Verbs”, “Nouns”, “Adjectives”, and “Custom”. Custom mode stores explicit task-type selections, while the other presets hydrate from the registry’s `supportedPos` definitions.
- `client/src/pages/home.tsx` fetches batches per active task type, merges them into a single queue, and persists progress, session state, and answer history keyed by deterministic `taskId`/`lexemeId` pairs.
- Renderers resolve by task type; adding a new type requires updating the shared registry, server registry, and client renderer map in the same pull request to maintain parity.

## Content pipeline & QA
- `npm run seed` hydrates the lexeme tables and regenerates deterministic task snapshots directly in the database via the task template registry. Pass `--reset` (`npm run seed -- --reset`) when you need to wipe previously seeded `words`, `lexemes`, `inflections`, and `task_specs` rows before re-importing updated POS JSONL files.
- Keep attribution notes and source tracking up to date in lexeme metadata; automated ETL checks surface missing license information during import.

## Analytics
- `practice_history` tracks every attempt with POS, task type, renderer, latency, and CEFR level so dashboards can segment adoption and quality metrics.

## Related references
- [`docs/parts-of-speech-onboarding-guide.md`](./parts-of-speech-onboarding-guide.md) – step-by-step environment setup and QA checklist.
- [`docs/parts-of-speech-content-training.md`](./parts-of-speech-content-training.md) – slide outline for onboarding content editors.
- [`docs/parts-of-speech-content-sources.md`](./parts-of-speech-content-sources.md) – source matrix covering licensing and enrichment notes for each POS.
