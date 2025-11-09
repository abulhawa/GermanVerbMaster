# Task Synchronizer Observability

The task specification synchronizer (`server/tasks/synchronizer.ts`) now emits
structured logs and lightweight metrics to make it easier for operators to
understand each run and react to failures.

## Structured log events

Logs are emitted via `logStructured` and appear as JSON objects with
`timestamp`, `level`, `source`, `event`, and optional `data` fields. The
`source` is `"task-sync"` unless stated otherwise.

| Event | When it fires | Notable fields in `data` |
| --- | --- | --- |
| `task_sync.start` | A sync run begins. | `since` (ISO timestamp or `null`). |
| `task_sync.no_candidates` | Incremental run found no updated lexemes. | `since`, `stats` (all counters zero). |
| `task_sync.lexeme_scan` | Lexeme rows fetched from the database. | `since`, `lexemesConsidered`. |
| `task_sync.generation_summary` | After task templates are generated. | `lexemesConsidered`, `lexemesProcessed`, `lexemesSkipped`, `taskSpecsProcessed`, `taskSpecsSkipped`. |
| `task_sync.upsert_summary` | After insert/update chunks complete. | `chunksAttempted`, `taskSpecsInserted`, `taskSpecsUpdated`. |
| `task_sync.cleanup_summary` | After stale task deletions finish. | `chunksAttempted`, `taskSpecsDeleted`. |
| `task_sync.finish` | The run completed successfully. | `since`, `durationMs`, `latestTouchedAt`, `stats` (all counters). |
| `task_sync.failure` | The run failed. | `since`, `durationMs`; `error` contains a normalized stack trace. |

`stats.taskSpecsSkipped` counts lexemes that were skipped because no task
templates could be generated (e.g., unsupported part of speech or missing
inflection data). Existing task specs tied to those lexemes are still cleaned
up when appropriate.

Chunk retries (`task_sync.upsert` and `task_sync.delete`) emit `warn`-level
events named `task_sync.upsert.retry` or `task_sync.delete.retry` with the
attempt number and chunk size. These logs indicate transient failures that were
automatically retried.

## Metrics

Metrics are dispatched through the lightweight emitter at
`server/metrics/emitter.ts`:

| Metric name | Description | Tags |
| --- | --- | --- |
| `task_sync_duration_ms` | Duration of the most recent run in milliseconds. | `status` = `success` or `error`. |
| `task_sync_error_total` | Counter incremented when a run fails. | `stage` = `sync`. |

### Registering a handler

The emitter is a simple observer. Downstream systems can register handlers to
ship metrics to StatsD, Prometheus, etc.:

```ts
import { emitMetric, registerMetricHandler } from "../server/metrics/emitter.js";

const unregister = registerMetricHandler((metric) => {
  statsdClient.send(metric.name, metric.value ?? 1, metric.tags);
});

// Later, when the handler is no longer needed:
unregister();
```

Handlers are wrapped in a try/catch so a faulty integration does not crash the
sync. Failures appear in the logs under the `metrics` source as
`metrics.handler_failure` events.

## Operational guidance

1. Watch for `task_sync.start`/`task_sync.finish` pairs. Missing `finish`
   events usually indicate a crash; check for a `task_sync.failure` entry.
2. Use the summary logs to validate that insert, update, and delete counts are
   within expected ranges.
3. A spike in `task_sync.upsert.retry` or `task_sync.delete.retry` logs means
   the database is flaking but retries succeeded. Follow up if retries become
   frequent.
4. Alert on `task_sync_error_total` or an absence of recent
   `task_sync_duration_ms{status="success"}` samples to detect sustained
   failures.
