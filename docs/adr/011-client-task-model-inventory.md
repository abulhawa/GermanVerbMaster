# ADR 011: Client Task Model Inventory & Task Descriptor Plan

- **Status:** Accepted
- **Date:** 2025-10-03
- **Related Tasks:** Parts of Speech Expansion Task 11a (Client Task Model Inventory)

## Context

The verb-only audit highlighted that the client application still depends on verb-centric helpers, storage keys, and component contracts, even though the server tasks (Tasks 8–10) now expose a POS-agnostic registry and `/api/tasks` feed. Task 11a needs to catalogue those dependencies and describe the neutral task descriptor that the refactor will adopt so later subtasks (11b–11e) can execute against a consistent contract.

## Findings: Verb-Only Dependencies in the Client

| Area | File(s) | Verb-only behaviour | Refactor notes |
| --- | --- | --- | --- |
| Verb data helpers | _Removed (`client/src/lib/verbs.ts`)_ | Formerly fetched `/api/quiz/verbs`, cached verb seed bundles, and normalised results into `GermanVerb`. All downstream callers expected verb fields like `infinitive`, `präteritum`, `partizipII`, and the `auxiliary` flag. | Fully replaced by the task fetch module that loads `/api/tasks`, validates payloads with the shared registry, and exposes verb tasks as `PracticeTask` entries so new POS task types share the same entry point. |
| Review queue cache | `client/src/lib/review-queue.ts` | Persists local storage queue entries as verb infinitive strings under `focus-review-queue` and only dequeues raw strings. | Replace with a structured queue keyed by `{ taskId, lexemeId, taskType, pos }` plus renderer hints so mixed-POS queues can be cached. |
| Answer history persistence | `client/src/lib/answer-history.ts` | Stores `AnsweredQuestion` objects that embed full `GermanVerb` payloads and reference practice modes tied to verb conjugation. | Introduce a task-centric history entry referencing `{ taskId, lexemeId, taskType }` plus resolved prompt metadata; ensure storage migrations drop embedded verb snapshots after the upgrade. |
| Home practice flow | `client/src/pages/home.tsx` | Loads verbs via `getRandomVerb` / `getVerbByInfinitive`, stores settings & progress keyed to verbs, and displays verb-only practice modes. | Rebuild around a session controller that requests `PracticeTask` items, routes them to renderer-specific hooks, and persists progress keyed by task metadata rather than verb infinitives. |
| Practice card & UI components | `client/src/components/practice-card.tsx` and dependants | Accept `GermanVerb` props, build prompts/validation around verb fields, and submit verb-oriented analytics payloads. | Move to renderer-specific components that accept prompt/solution data derived from the registry; verb renderers become one implementation among many. |
| Tests & fixtures | `client/src/pages/__tests__/home-navigation.test.tsx` | Mocks `GermanVerb` responses and asserts behaviour of verb-only helpers. | Update tests to use `PracticeTask` fixtures generated from shared registry schemas, maintaining verb parity coverage while enabling mixed POS cases. |
| Practice analytics payloads | `client/src/lib/api.ts`, `client/src/lib/db.ts` | Queue and submit practice attempts that include verb infinitives & modes. | Expand payloads to `{ taskId, lexemeId, taskType, pos }` with optional renderer hints so the server scheduler can compute mixed-POS telemetry. |

## Decision: Neutral Practice Task Contract

Adopt the following task descriptor interfaces, sourced from the shared registry so the client and server remain in lock-step:

```ts
import type { TaskType, LexemePos, taskTypeRegistry } from "@shared/task-registry";
import type { CEFRLevel } from "@shared";
import type { z } from "zod";

type TaskPrompt<T extends TaskType = TaskType> = z.infer<(typeof taskTypeRegistry)[T]["promptSchema"]>;
type TaskSolution<T extends TaskType = TaskType> = z.infer<(typeof taskTypeRegistry)[T]["solutionSchema"]>;

interface PracticeTask<T extends TaskType = TaskType> {
  taskId: string;
  lexemeId: string;
  taskType: T;
  pos: LexemePos;
  renderer: (typeof taskTypeRegistry)[T]["renderer"];
  prompt: TaskPrompt<T>;
  expectedSolution?: TaskSolution<T>;
  cefrLevel?: CEFRLevel;
  packId?: string;
  assignedAt: string;
  source: "scheduler" | "seed" | "review";
}
```

- `TaskPrompt` and `TaskSolution` alias the shared Zod schemas so `PracticeTask` always mirrors the server registry without duplicating literal types.
- `PracticeTask` carries both scheduling metadata (`assignedAt`, `source`) and renderer hints; renderers can derive localisation, accessibility text, and evaluation rules directly from the prompt.
- Verb-only helpers become adapter utilities that transform existing verb queues into `PracticeTask<'conjugate_form'>` entries during the transition period.

## Decision: Storage & State Keys

| Legacy concern | Current key/table | Replacement key/table | Migration notes |
| --- | --- | --- | --- |
| Review queue cache | Local storage `focus-review-queue` | Local storage `practice.tasks.queue` containing serialised `PracticeTaskQueueItem` records `{ taskId, lexemeId, taskType, pos, renderer }`. | Migrate by reading legacy verbs, resolving them to registry-backed verb tasks, and enqueueing them under the new structure before clearing the old key. |
| Answer history | Local storage `answerHistory` storing `AnsweredQuestion` | Local storage `practice.answerHistory` storing `TaskAnswerHistoryItem` keyed by `{ taskId, lexemeId }`. | Run an upgrade script on first load: convert entries into task descriptors (verb tasks map to `conjugate_form`) and discard unresolvable verbs with a console warning. |
| Practice settings | Local storage `settings` | Local storage `practice.settings` with renderer preferences & mode presets keyed by task type. | Default verb-only settings (`showHints`, `showExamples`, `level`) map to `conjugate_form` preferences; additional POS defaults append without clobbering stored values. |
| Progress tracker | Local storage `progress` | Local storage `practice.progress` with `{ totals: Record<TaskType, ProgressStats>, lastPracticedTaskId }`. | Consolidate practiced verb arrays into task progress entries keyed by `{ taskType, lexemeId }`; persist a migration marker to avoid re-running. |
| Offline attempt queue | IndexedDB `german-verb-master.pendingAttempts` storing `PracticeAttemptPayload` with verb metadata | IndexedDB `practice.pendingAttempts` storing `TaskAttemptPayload` referencing task ids & registry metadata. | Introduce Dexie v2 schema upgrade that renames the database, replays pending verb attempts into task submissions (mapping to verb task ids), and removes legacy verb-only payload fields. |

## Consequences & Follow-Up

- Subtask 11b will implement the `client/src/lib/tasks.ts` module that fetches `/api/tasks`, validates via `taskTypeRegistry`, and emits `PracticeTask` instances.
- Subtask 11c will migrate the session and persistence layers to the new storage keys, using the migration strategies defined above.
- Subtask 11d will refactor UI components to accept `PracticeTask` descriptors and defer renderer-specific logic to POS-aware adapters.
- Subtask 11e will add tests that assert registry parity, migration success, and verb preset compatibility using the shared task schemas.

Document owners: Client platform team.
