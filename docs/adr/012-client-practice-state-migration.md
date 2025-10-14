# ADR 012: Client Practice State Migration

- **Status:** Accepted
- **Date:** 2025-10-05
- **Related Tasks:** Parts of Speech Expansion Task 11c (Client State Store Migration)

## Context

Task 11c requires the client application to shed verb-only state stores so future parts-of-speech (POS) work can share a single
task-centric persistence layer. The existing implementation persisted multiple verb-focused slices in disparate keys:

- `focus-review-queue` contained an array of verb infinitive strings.
- `answerHistory` embedded full `GermanVerb` snapshots and practice mode values.
- `settings` and `progress` tracked verb-centric preferences and counters.
- IndexedDB database `german-verb-master` stored pending practice attempts tied to verb metadata.

To unlock mixed-POS queues we need deterministic task identifiers (`taskId`, `lexemeId`) and renderer hints. At the same time we
must preserve the verb-only experience during migration to avoid data loss.

## Decision

1. **Review queue storage**
   - Introduce `practice.tasks.queue` storing an ordered array of `PracticeTaskQueueItem` objects `{ taskId, lexemeId, taskType,
     pos, renderer, source, enqueuedAt, metadata }`.
   - On first access the client migrates any `focus-review-queue` payload, deduplicates verbs, wraps them in legacy
     `conjugate_form` queue items, and deletes the old key. Compatibility helpers (`peekReviewVerb`, `shiftReviewVerb`) surface
     verb infinitives for existing UI until Task 11d lands.

2. **Answer history**
   - Persist history under `practice.answerHistory` using `TaskAnswerHistoryItem` records keyed by `taskId`/`lexemeId`.
   - Provide a helper `createLegacyAnswerHistoryEntry` that produces task-centric entries from legacy verb answers. This keeps
     verb workflows functional while coexisting with future POS task descriptors.
   - Migration reads the former `answerHistory` payload, converts each entry to the new schema, and writes it back under the new
     key. Legacy-only fields (`verb`, `mode`, `prompt`) remain available during the transition but now sit alongside the task
     metadata.

3. **Practice settings**
   - Replace `settings` with `practice.settings`, capturing task defaults, renderer preferences, and CEFR levels per POS.
   - When migrating we seed defaults from the old verb settings and stamp a migration marker (`practice.settings.migrated`) to
     avoid repeated conversions.

4. **Progress tracker**
   - Persist progress under `practice.progress` as `PracticeProgressState`, aggregating counters and lexeme-level snapshots per
     task type.
   - Legacy verb progress is mapped to `conjugate_form` lexeme records keyed by `legacy:verb:<infinitive>`.

5. **Offline attempt queue**
   - Rename the Dexie database to `practice` and upgrade the schema so queued attempts store the new `TaskAttemptPayload` shape.
   - At database open we migrate the old `german-verb-master` data set, convert each `PracticeAttemptPayload` into a task
     payload, and delete the legacy database.
  - Submission logic now posts directly to `/api/submission`. The compatibility shim for `/api/practice-history` is no longer
    required.

6. **Session controller**
   - Add `practice.session` to coordinate queued task identifiers, the active task, and completion order. It is seeded empty and
     unaffected by legacy data but provides a consistent persistence surface for upcoming UI refactors.

## Migration & Failure Handling

- Every storage upgrader writes an idempotent migration marker (e.g., `practice.tasks.queue.migrated`). If parsing fails we log a
  warning, clear the invalid payload, and proceed with an empty state to prevent crashes.
- The Dexie upgrade guards against missing `indexedDB` support by catching errors when opening or migrating databases and
  emitting console warnings without blocking runtime behaviour.
- Legacy compatibility helpers ensure verb-only components continue to work: they synthesise legacy views (`peekReviewVerb`,
  `createLegacyAnswerHistoryEntry`) from the new structures until Task 11d rewires the UI.

## Consequences

- The client now persists task-centric identifiers everywhere, eliminating verb-only assumptions from storage.
- Existing users keep their review queues, answer history, settings, and offline attempts thanks to one-off migrations.
- Follow-on work (Task 11d) can focus on UI integration without reworking persistence again.
- New POS tasks can be enqueued and tracked without additional schema changes.
