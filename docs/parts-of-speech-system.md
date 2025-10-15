# Parts of Speech System Overview

This guide replaces the historical expansion plans with a concise snapshot of the lexeme-centric practice stack now running in GermanVerbMaster. Use it to understand how verbs, nouns, and adjectives move from source data into learner queues, what toggles control availability, and which supporting docs to consult for operational details.

## Current scope
- `shared/task-registry.ts` exposes three production task types: `conjugate_form` (verbs), `noun_case_declension` (nouns), and `adj_ending` (adjectives). Each entry carries the POS, renderer key, prompt/solution schemas, and a default queue cap so server and client stay aligned.
- The Express API mounts `GET /api/tasks` as the canonical feed. Requests can filter by part of speech, task type, and pack slug while returning deterministic IDs and metadata for every task.
- Practice clients ship with a mode switcher that lets learners blend all task types or focus on a single POS, while a custom preset stores any combination of task types for power users.

## Feature flags and rollout controls
| Flag | Default | Scope | Notes |
| --- | --- | --- | --- |
| `ENABLE_LEXEME_SCHEMA` | `true` | Server + scripts | Enables the lexeme tables, task registry, and `/api/tasks` endpoints. Turning it off reverts the legacy verb-only stack. |
| `ENABLE_NOUNS_BETA` | `false` | Server | Gates noun tasks. When disabled, `/api/tasks` rejects noun filters and the client hides noun presets. |
| `ENABLE_ADJECTIVES_BETA` | `false` | Server | Gates adjective tasks with the same behaviour as nouns. |
| Other POS flags | `false` | Server | Flags exist for future parts of speech (adverb, pronoun, etc.) but remain disabled until we add task templates. |

The feature flag helper normalises environment variables, emits an `X-Feature-Flags` response header, and throws descriptive errors when callers request a disabled POS. Subscribe to the listener hooks when you need telemetry or logging around blocked requests.

## Data model
The lexeme schema sits alongside the legacy verb tables so we can run both systems in parallel. Key tables include:

- **`lexemes`** – canonical lemma rows keyed by deterministic IDs with POS, gender, metadata, frequency, and source identifiers (`pos_jsonl:<slug>` for per-POS JSONL seeds plus optional `enrichment:<method>` tags).
- **`inflections`** – surface forms plus a JSON `features` bundle (case, number, tense, etc.) linked back to `lexemes`.
- **`task_specs`** – prompt/solution payloads per lexeme and task type, including renderer, revision, hints, and default pack attribution.
- **`scheduling_state`** – per-device Leitner progress, cached priority scores, and attempt counters keyed by `task_id`.
- **`content_packs`** + **`pack_lexeme_map`** – bundle metadata (license, checksum, version) and lexeme membership so offline packs remain auditable.
- **`telemetry_priorities`** + **`practice_history`** – persisted scheduler snapshots and attempt logs with POS, task type, latency, hint usage, and pack context.

Refer to `db/schema.ts` for column-level details, indices, and relationships.

## Task registry & evaluation
- The shared registry enforces prompt and solution contracts with Zod schemas, ensuring ETL and API payloads stay valid.
- Server entries wrap the shared definitions with evaluation metadata. All current tasks use normalised string equality; adjust the evaluation object when introducing fuzzy matching or multi-answer support.
- Registry helpers power `npm run packs:lint`, rejecting any pack JSON that references unsupported task types, missing licenses, or inconsistent renderer keys before the files reach `content_packs`.

## API and scheduler flow
- `/api/tasks` honours POS and task-type filters, verifies feature flags, and adds pack metadata when the task originated from a curated bundle.
- When callers provide a `deviceId` and request verb-only queues, the endpoint samples the adaptive scheduler and interleaves those verbs ahead of the fallback content query. Stale queues trigger regeneration automatically.
- Practice submissions route through `/api/submission`, updating `scheduling_state` rows and queue caches so the next `/api/tasks` call reflects the new priorities.

## Client experience
- The practice mode switcher component exposes presets for “All tasks”, “Verbs”, “Nouns”, “Adjectives”, and “Custom”. Custom mode stores explicit task-type selections, while the other presets hydrate from the registry’s `supportedPos` definitions.
- `client/src/pages/home.tsx` fetches batches per active task type, merges them into a single queue, and persists progress, session state, and answer history keyed by deterministic `taskId`/`lexemeId` pairs.
- Renderers resolve by task type; adding a new type requires updating the shared registry, server registry, client renderer map, and `packs:lint` validation in the same pull request to maintain parity.

## Content pipeline & QA
- `npm run seed` hydrates the lexeme tables and regenerates deterministic pack JSON under `data/packs/`. Copy the updated packs to `client/public/packs/` before building so offline clients stay in sync. Pass `--reset` (`npm run seed -- --reset`) when you need to wipe previously seeded `words`, `lexemes`, `inflections`, `task_specs`, `content_packs`, and `pack_lexeme_map` rows before re-importing updated POS JSONL files.
- `npm run packs:lint` (backed by `scripts/packs-lint.ts`) validates pack headers, license fields, lexeme membership, and task payloads against the shared registry. The command exits non-zero on any issue, making it safe to wire into CI.
- Keep attribution notes and source tracking up to date in pack metadata; the lint script enforces license presence and highlights missing `packLexemeMap` entries.

## Telemetry & analytics
- `practice_history` tracks every attempt with POS, task type, renderer, latency, CEFR level, pack, and feature flag snapshot so dashboards can segment adoption and quality metrics.
- `telemetry_priorities` records scheduled priority weights per task. Export these rows when tuning scheduler coefficients or comparing queue health across releases.
- Because feature flags are included in both API responses and practice history metadata, analysts can measure noun/adjective rollout impact without guessing which cohorts were exposed.

## Related references
- [`docs/parts-of-speech-onboarding-guide.md`](./parts-of-speech-onboarding-guide.md) – step-by-step environment setup and QA checklist.
- [`docs/parts-of-speech-content-training.md`](./parts-of-speech-content-training.md) – slide outline for onboarding content editors.
- [`docs/parts-of-speech-content-sources.md`](./parts-of-speech-content-sources.md) – source matrix covering licensing and enrichment notes for each POS.
