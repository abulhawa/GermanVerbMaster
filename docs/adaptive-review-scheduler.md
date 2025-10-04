# Adaptive review scheduler

_Last updated: 2025-10-02_

This document captures the full architecture for the adaptive spaced-repetition system (SRS) that now powers `/api/review-queue`. It walks through the persistence model, scheduling heuristics, feature toggles, and the server/client hand-off so future contributors can confidently extend the feature after a long break.

## High-level goals

- Persist per-device Leitner box state so the backend can make spaced-repetition decisions without depending on client storage.
- Generate ranked review queues that are time-bound (`validUntil`) and reproducible via `version` identifiers.
- Keep the engine guarded behind an explicit feature flag while we harden analytics and UX.
- Expose a simple HTTP contract for clients and partners to consume queues without leaking implementation detail.

## Data model

The migration [`migrations/0004_create_srs_tables.sql`](../migrations/0004_create_srs_tables.sql) and the Drizzle schema [`db/schema.ts`](../db/schema.ts) introduce two new tables:

| Table | Purpose | Key fields |
| --- | --- | --- |
| `verb_scheduling_state` | One row per `(deviceId, verb)` pair tracking Leitner box position, attempt counts, moving averages, and cached priority scores. | `leitner_box`, `total_attempts`, `correct_attempts`, `average_response_ms`, `accuracy_weight`, `latency_weight`, `stability_weight`, `priority_score`, `due_at`, `last_result`. |
| `verb_review_queues` | Stores the last generated queue snapshot per device along with timing metadata. | `version`, `generated_at`, `valid_until`, `generation_duration_ms`, `item_count`, `items` (JSON payload of queue entries). |

Both tables optionally link to a `user_id` when an authenticated session is available so we can reconcile across devices later. Unique indexes enforce a single active state row per verb/device and a single queue snapshot per device.

## Scheduling heuristics

Core scoring utilities live in [`server/srs/priority.ts`](../server/srs/priority.ts):

- `BOX_INTERVALS_MS` implements a five-box Leitner cadence (12h → 24h → 72h → 7d).
- `computeAccuracyWeight`, `computeLatencyWeight`, and `computeStabilityWeight` transform recent practice stats into bounded weights.
- `computePriorityScore` blends accuracy, latency, stability, and due-urgency into a normalized value (0–1.5) used to rank queue items.
- `computeNextDueDate` and `computePredictedIntervalMinutes` expose consistent scheduling hints to both the DB layer and the API response.

## Engine lifecycle

The orchestrator lives in [`server/srs/engine.ts`](../server/srs/engine.ts) and is re-exported via [`server/srs/index.ts`](../server/srs/index.ts).

1. **Feature flag** – The engine is gated by `FEATURE_ADAPTIVE_QUEUE`. The helper `isEnabled()` parses common truthy values ("true", "1", "yes", etc.).
2. **Practice ingestion** – `recordPracticeAttempt()` is invoked from the existing `/api/practice` route after a submission is stored. The method:
   - Upserts a `verb_scheduling_state` row for the `(deviceId, verb)` pair.
   - Recomputes Leitner box, weights, due date, and priority score.
   - Ensures each device has at least `ADAPTIVE_QUEUE_MIN_SIZE` verbs populated by seeding missing canonical verbs at the caller's CEFR level.
   - Invalidates any cached queue for the device by expiring `valid_until`.
3. **Queue generation** – `generateQueueForDevice()` wraps `regenerateForDevice()` and persists snapshots via `storeQueue()`:
   - Gathers all state rows for a device and recomputes priority scores (`buildQueueItems`).
   - Sorts descending by priority, caps the list at `ADAPTIVE_QUEUE_MAX_ITEMS`, and records the work duration and TTL (`ADAPTIVE_QUEUE_TTL_MS`).
   - Assigns a UUID `version` per regeneration so clients can detect staleness.
4. **External regeneration** – `regenerateQueuesOnce()` iterates the known devices and rebuilds queues. Deployments trigger it explicitly (for example via the `/api/jobs/regenerate-queues` endpoint wired for Vercel Cron) so serverless hosts can stay idle between runs.
5. **Staleness detection** – `isQueueStale()` compares `validUntil` to `Date.now()` and allows the API layer to regenerate on demand.

## Configuration reference

| Environment variable | Default | Notes |
| --- | --- | --- |
| `FEATURE_ADAPTIVE_QUEUE` | `false` | Must be truthy to surface `/api/review-queue`. Keep disabled in production until analytics are ready. |
| `ADAPTIVE_QUEUE_MIN_SIZE` | `20` | Minimum number of `verb_scheduling_state` rows the engine maintains per device. Values above 200 are clamped. |
| `ADAPTIVE_QUEUE_MAX_ITEMS` | `50` | Maximum queue length returned to clients. Values above 200 are clamped. |
| `ADAPTIVE_QUEUE_TTL_MS` | `900000` (15 minutes) | Determines `validUntil` timestamps for stored queue snapshots. |
All helpers defensively parse environment variables and fall back to defaults if values are missing or invalid.【F:server/srs/engine.ts†L21-L74】【F:server/srs/engine.ts†L179-L218】

## API contract

Route implementation: [`server/routes.ts`](../server/routes.ts) at `/api/review-queue`.

- **Method**: `GET`
- **Query params**:
  - `deviceId` (required) – persistent identifier stored in `localStorage` by the client.
  - `level` (optional) – CEFR level hint used when seeding new verbs.
- **Responses**:
  - `200 OK` with payload:
    ```json
    {
      "deviceId": "abc-123",
      "version": "1f3b...",
      "generatedAt": "2024-11-24T23:59:59.123Z",
      "validUntil": "2024-11-25T00:14:59.123Z",
      "featureEnabled": true,
      "items": [
        {
          "verb": "gehen",
          "priority": 0.92,
          "dueAt": "2024-11-25T08:00:00.000Z",
          "leitnerBox": 3,
          "accuracyWeight": 0.64,
          "latencyWeight": 0.81,
          "stabilityWeight": 0.43,
          "predictedIntervalMinutes": 4320
        }
      ],
      "metrics": {
        "queueLength": 20,
        "generationDurationMs": 37
      }
    }
    ```
  - `400 Bad Request` if `deviceId` is missing.
  - `404 Not Found` if the feature flag is disabled.
  - `500 Internal Server Error` for unexpected failures.

The handler marks responses as `Cache-Control: no-store` and regenerates queues whenever the stored snapshot is stale.【F:server/routes.ts†L612-L675】

Unit coverage for the endpoint and scoring lives in [`tests/review-queue-route.test.ts`](../tests/review-queue-route.test.ts) and [`tests/adaptive-priority.test.ts`](../tests/adaptive-priority.test.ts). These suites are the best starting point when adjusting scoring weights or TTL behavior.

## Client integration

The current client queue helper (`client/src/lib/review-queue.ts`) still relies on `localStorage`. To integrate the adaptive backend:

1. Fetch `/api/review-queue?deviceId=<uuid>&level=<CEFR>` when the home screen mounts or after each practice submission.
2. Replace the local `focus-review-queue` storage with the server-provided `items` array, using the `version` to avoid redundant updates.
3. When practicing verbs, send the `queuedAt` timestamp alongside attempts so latency analytics can compare predicted vs actual intervals.
4. If the API returns an empty list, fall back to the client-maintained queue to preserve the existing experience.
5. Respect `validUntil`; schedule a refresh slightly before expiry to keep the queue warm while the device stays online.

Once the integration is complete, `enqueueReviewVerbs` can become a thin wrapper that merges bespoke study lists with the adaptive queue response.

## Operational checklist

- Run `npm run db:push` after pulling the migration to create the new tables locally.
- Seed verb data (`npm run seed`) before testing so `ensureMinimumDeviceStates` can backfill state rows.
- Start the server with `FEATURE_ADAPTIVE_QUEUE=true` in `.env` or the shell to enable the route.
- Configure an external trigger (for example, a Vercel Cron job hitting `/api/jobs/regenerate-queues`) to keep queues fresh without relying on in-process intervals.
- Execute `npm test` to cover the API and scoring utilities before shipping changes.

Keeping these steps documented will make it straightforward to resume work on the adaptive scheduler months later without re-reading the entire codebase.
