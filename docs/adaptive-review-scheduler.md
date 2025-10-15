# Adaptive practice scheduler

_Last updated: 2025-10-18_

The verb-only spaced-repetition (SRS) feature that previously powered `/api/review-queue` has been retired. The dedicated tables
`verb_analytics`, `verb_practice_history`, `verb_scheduling_state`, and `verb_review_queues` no longer exist; their responsibiliti
es now live inside the shared practice and scheduling models that serve every part of speech. This document captures the current
architecture so future contributors understand how adaptive ordering still works across `/api/tasks` without the legacy verb-only
pipeline.

## Current data model

| Table | Purpose | Key fields |
| --- | --- | --- |
| `practice_history` | Stores every submitted task across POS, including timing and feature-flag metadata used for analytics. | `task_id`, `device_id`, `user_id`, `pos`, `task_type`, `result`, `response_ms`, `submitted_at`, `cefr_level`, `feature_flags`, `metadata`. |
| `scheduling_state` | Maintains the active Leitner-box snapshot per `(deviceId, taskId)` so the system can prioritise follow-up tasks. | `leitner_box`, `total_attempts`, `correct_attempts`, `average_response_ms`, `accuracy_weight`, `latency_weight`, `stability_weight`, `priority_score`, `due_at`, `last_result`. |
| `telemetry_priorities` | Records the raw priority computations for later analysis, including queue coverage statistics. | `task_id`, `priority_score`, `metadata`. |

All three tables are defined in [`db/schema.ts`](../db/schema.ts) and share the same auth/cleanup behaviour as the rest of the le
xeme system.

## Scheduling flow

1. **Submission ingestion** – `/api/submission` calls `processTaskSubmission()` in [`server/tasks/scheduler.ts`](../server/tasks/
scheduler.ts) after a task is graded. The helper:
   - Loads the existing `scheduling_state` snapshot for the `(deviceId, taskId)` pair.
   - Recomputes Leitner box placement, moving averages, and due dates using the shared scoring utilities from [`server/srs/pri
ority.ts`](../server/srs/priority.ts).
   - Writes the updated snapshot back to `scheduling_state` and records telemetry rows for diagnostics.
   - Inserts an entry into `practice_history` with the raw submission metadata (response time, feature flags, pack information,
 etc.).
2. **Task ordering** – When `/api/tasks` is invoked with a `deviceId`, the route loads the relevant `scheduling_state` rows, hydr
ates any missing task metadata, and sorts the merged task list using `computeFallbackPriorityScore()` (defined in `server/routes.
ts`). Tasks that are overdue or carry a higher blended priority surface first; remaining tasks fall back to recency ordering.
3. **Analytics** – Scripts such as [`scripts/baseline-kpis.ts`](../scripts/baseline-kpis.ts) operate exclusively on `practice_his
tory`, so historical analytics now cover every part of speech instead of the verb subset.

There is no longer a pre-generated queue or regeneration job; prioritisation happens on demand from the shared state tables. The
previous `FEATURE_ADAPTIVE_QUEUE` toggle has been removed, and `/api/tasks` automatically blends adaptive ordering whenever a dev
ice identifier is supplied.

## Legacy reference

For posterity, the following tables and endpoints have been removed from the schema and codebase:

- `verb_analytics`
- `verb_practice_history`
- `verb_review_queues`
- `verb_scheduling_state`
- `/api/review-queue`
- `/api/jobs/regenerate-queues`

The scoring utilities in [`server/srs/priority.ts`](../server/srs/priority.ts) remain in use and are exercised by [`tests/adaptiv
e-priority.test.ts`](../tests/adaptive-priority.test.ts). When tuning Leitner behaviour or debugging device-specific queues, start
with `processTaskSubmission()` and the related tests; no additional feature flags or regeneration cron jobs are required.
