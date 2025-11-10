import type { LexemePos } from '@shared/task-registry';

import { logStructured } from '../logger.js';
import { emitMetric } from '../metrics/emitter.js';

import {
  loadTaskSpecSyncCheckpoint,
  recordTaskSpecSyncHeartbeat,
  storeTaskSpecSyncCheckpoint,
  type TaskSpecSyncCheckpoint,
} from './task-sync-state.js';
import {
  deleteTaskSpecsById,
  fetchExistingTaskSpecRows,
  fetchInflectionRows,
  fetchLexemeRows,
  fetchUpdatedLexemeIds,
  upsertTaskSpecChunk,
} from './sync/persistence.js';
import {
  calculateTaskSyncPlan,
  type EnsureTaskSpecsResult,
  type TaskSyncPlan,
  type TaskSyncStats,
} from './sync/diff.js';
import {
  getActiveSyncPromise,
  getTaskSpecSyncMetadata as getTaskSpecSyncMetadataState,
  markSyncFailure,
  markSyncStart,
  markSyncSuccess,
  resetTaskSpecSync as resetTaskSpecSyncState,
  setActiveSyncPromise,
  type TaskSpecSyncMetadata,
} from './sync/state.js';
import { clearQueryCache } from '../cache/query-cache.js';
import { chunkArray, processChunksWithRetry } from './sync/utils.js';

const LOG_SOURCE = 'task-sync';
const METRIC_DURATION_NAME = 'task_sync_duration_ms';
const METRIC_ERROR_NAME = 'task_sync_error_total';

const SUPPORTED_POS: readonly LexemePos[] = ['verb', 'noun', 'adjective'];
const INSERT_CHUNK_SIZE = 500;
const DELETE_CHUNK_SIZE = 500;

export interface EnsureTaskSpecsOptions {
  since?: Date | null;
  checkpoint?: TaskSpecSyncCheckpoint | null;
}

interface SyncExecutionOptions {
  since?: Date;
  previousCheckpoint: TaskSpecSyncCheckpoint | null;
}

export async function ensureTaskSpecsSynced(
  options?: EnsureTaskSpecsOptions,
): Promise<EnsureTaskSpecsResult> {
  const active = getActiveSyncPromise();
  if (active) {
    return await active;
  }

  const syncPromise = (async () => {
    const providedCheckpoint = options?.checkpoint ?? null;
    const storedCheckpoint = providedCheckpoint ?? (await loadTaskSpecSyncCheckpoint());
    const since = options?.since ?? storedCheckpoint?.lastSyncedAt ?? null;
    const startedAt = process.hrtime.bigint();
    const startedAtDate = new Date();

    markSyncStart(startedAtDate);

    logStructured({
      source: LOG_SOURCE,
      event: 'task_sync.start',
      data: {
        since: since ? since.toISOString() : null,
        checkpointVersion: storedCheckpoint?.versionHash ?? null,
      },
    });

    try {
      const plan = await runTaskSpecSync({
        since: since ?? undefined,
        previousCheckpoint: storedCheckpoint ?? null,
      });

      const durationMs = Number(process.hrtime.bigint() - startedAt) / 1_000_000;

      emitMetric({
        name: METRIC_DURATION_NAME,
        value: durationMs,
        tags: { status: 'success' },
      });

      const checkpoint = plan.checkpoint ?? storedCheckpoint ?? null;
      const completedAtDate = new Date();

      await recordTaskSpecSyncHeartbeat({
        checkpoint,
        completedAt: completedAtDate,
      });

      markSyncSuccess(completedAtDate, checkpoint);

      logStructured({
        source: LOG_SOURCE,
        event: 'task_sync.finish',
        data: {
          since: since ? since.toISOString() : null,
          durationMs,
          latestTouchedAt: plan.latestTouchedAt ? plan.latestTouchedAt.toISOString() : null,
          stats: plan.stats,
          checkpointVersion: checkpoint?.versionHash ?? null,
        },
      });

      // Clear short-lived query cache so subsequent task list queries return fresh
      // results after the task-spec synchronisation has updated the DB.
      try {
        clearQueryCache();
      } catch (err) {
        // ignore cache clear errors
      }

      return {
        latestTouchedAt: plan.latestTouchedAt,
        stats: plan.stats,
        checkpoint,
      };
    } catch (error) {
      const durationMs = Number(process.hrtime.bigint() - startedAt) / 1_000_000;

      emitMetric({
        name: METRIC_DURATION_NAME,
        value: durationMs,
        tags: { status: 'error' },
      });

      emitMetric({
        name: METRIC_ERROR_NAME,
        value: 1,
        tags: { stage: 'sync' },
      });

      markSyncFailure();

      logStructured({
        source: LOG_SOURCE,
        level: 'error',
        event: 'task_sync.failure',
        message: 'Task spec synchronisation failed',
        data: {
          since: since ? since.toISOString() : null,
          durationMs,
        },
        error,
      });

      throw error;
    }
  })();

  setActiveSyncPromise(syncPromise);

  try {
    return await syncPromise;
  } finally {
    setActiveSyncPromise(null);
  }
}

async function runTaskSpecSync(options: SyncExecutionOptions): Promise<TaskSyncPlan> {
  const since = options.since ?? null;
  const fetchedAllLexemes = !since;
  const baseStats = createEmptyStats();

  let lexemeFilter: Iterable<string> | undefined;

  if (since) {
    const { lexemeIds } = await fetchUpdatedLexemeIds(since, SUPPORTED_POS);
    if (lexemeIds.size === 0) {
      logStructured({
        source: LOG_SOURCE,
        event: 'task_sync.no_candidates',
        data: {
          since: since.toISOString(),
          stats: baseStats,
        },
      });

      return {
        inserts: [],
        staleTaskIds: [],
        latestTouchedAt: null,
        stats: baseStats,
        checkpoint: null,
        checkpointChanged: false,
      };
    }

    lexemeFilter = lexemeIds;
  }

  const lexemeRows = await fetchLexemeRows(SUPPORTED_POS, lexemeFilter);
  return await executeSyncPlan({
    previousCheckpoint: options.previousCheckpoint,
    lexemeRows,
    since,
    fetchedAllLexemes,
  });
}

interface ExecuteSyncPlanOptions {
  previousCheckpoint: TaskSpecSyncCheckpoint | null;
  lexemeRows: Awaited<ReturnType<typeof fetchLexemeRows>>;
  since: Date | null;
  fetchedAllLexemes: boolean;
}

async function executeSyncPlan(options: ExecuteSyncPlanOptions): Promise<TaskSyncPlan> {
  const { lexemeRows, since, fetchedAllLexemes, previousCheckpoint } = options;
  const statsForLogging = createEmptyStats({ lexemesConsidered: lexemeRows.length });

  logStructured({
    source: LOG_SOURCE,
    event: 'task_sync.lexeme_scan',
    data: {
      since: since ? since.toISOString() : null,
      lexemesConsidered: lexemeRows.length,
    },
  });

  if (lexemeRows.length === 0) {
    logStructured({
      source: LOG_SOURCE,
      event: 'task_sync.generation_summary',
      data: {
        lexemesConsidered: statsForLogging.lexemesConsidered,
        lexemesProcessed: statsForLogging.lexemesProcessed,
        lexemesSkipped: statsForLogging.lexemesSkipped,
        taskSpecsProcessed: statsForLogging.taskSpecsProcessed,
        taskSpecsSkipped: statsForLogging.taskSpecsSkipped,
      },
    });

    return {
      inserts: [],
      staleTaskIds: [],
      latestTouchedAt: null,
      stats: statsForLogging,
      checkpoint: null,
      checkpointChanged: false,
    };
  }

  const lexemeIdList = lexemeRows.map((row) => row.id);
  const inflectionRows = await fetchInflectionRows(lexemeIdList);
  const existingTasks = await fetchExistingTaskSpecRows(fetchedAllLexemes ? null : lexemeIdList);

  const plan = calculateTaskSyncPlan({
    lexemeRows,
    inflectionRows,
    existingTasks,
    supportedPos: SUPPORTED_POS,
    previousCheckpoint,
    fetchedAllLexemes,
  });

  logStructured({
    source: LOG_SOURCE,
    event: 'task_sync.generation_summary',
    data: {
      lexemesConsidered: plan.stats.lexemesConsidered,
      lexemesProcessed: plan.stats.lexemesProcessed,
      lexemesSkipped: plan.stats.lexemesSkipped,
      taskSpecsProcessed: plan.stats.taskSpecsProcessed,
      taskSpecsSkipped: plan.stats.taskSpecsSkipped,
    },
  });

  const insertChunks = plan.inserts.length > 0 ? chunkArray(plan.inserts, INSERT_CHUNK_SIZE) : [];
  if (insertChunks.length > 0) {
    await processChunksWithRetry(
      insertChunks,
      async (chunk) => {
        await upsertTaskSpecChunk(chunk);
      },
      { operation: 'task_sync.insert' },
    );
  }

  const deleteChunks = plan.staleTaskIds.length > 0 ? chunkArray(plan.staleTaskIds, DELETE_CHUNK_SIZE) : [];
  if (deleteChunks.length > 0) {
    await processChunksWithRetry(
      deleteChunks,
      async (chunk) => {
        await deleteTaskSpecsById(chunk);
      },
      { operation: 'task_sync.delete' },
    );
  }

  logStructured({
    source: LOG_SOURCE,
    event: 'task_sync.cleanup_summary',
    data: {
      chunksAttempted: deleteChunks.length,
      taskSpecsDeleted: plan.stats.taskSpecsDeleted,
    },
  });

  if (plan.checkpointChanged && plan.checkpoint) {
    await storeTaskSpecSyncCheckpoint(plan.checkpoint);
    logStructured({
      source: LOG_SOURCE,
      event: 'task_sync.checkpoint_updated',
      data: {
        lastSyncedAt: plan.checkpoint.lastSyncedAt.toISOString(),
        versionHash: plan.checkpoint.versionHash,
      },
    });
  }

  return plan;
}

function createEmptyStats(overrides?: Partial<TaskSyncStats>): TaskSyncStats {
  return {
    lexemesConsidered: 0,
    lexemesProcessed: 0,
    lexemesSkipped: 0,
    taskSpecsProcessed: 0,
    taskSpecsSkipped: 0,
    taskSpecsInserted: 0,
    taskSpecsUpdated: 0,
    taskSpecsDeleted: 0,
    ...overrides,
  };
}

export const getTaskSpecSyncMetadata = getTaskSpecSyncMetadataState;
export const resetTaskSpecSync = resetTaskSpecSyncState;

export type { TaskSpecSyncMetadata } from './sync/state.js';
export type { TaskSyncStats, EnsureTaskSpecsResult } from './sync/diff.js';
export { __TEST_ONLY__, normaliseGenderValue } from './sync/diff.js';
