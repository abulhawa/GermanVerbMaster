import type { TaskSpecSyncCheckpoint } from '../task-sync-state.js';
import type { EnsureTaskSpecsResult } from './diff.js';

interface TaskSpecSyncMetadataInternal {
  inProgress: boolean;
  lastRunStartedAt: Date | null;
  lastRunCompletedAt: Date | null;
  lastCheckpoint: TaskSpecSyncCheckpoint | null;
}

const syncMetadata: TaskSpecSyncMetadataInternal = {
  inProgress: false,
  lastRunStartedAt: null,
  lastRunCompletedAt: null,
  lastCheckpoint: null,
};

let syncPromise: Promise<EnsureTaskSpecsResult> | null = null;

export interface TaskSpecSyncMetadata {
  inProgress: boolean;
  lastRunStartedAt: Date | null;
  lastRunCompletedAt: Date | null;
  lastCheckpoint: TaskSpecSyncCheckpoint | null;
}

export function getTaskSpecSyncMetadata(): TaskSpecSyncMetadata {
  return {
    inProgress: syncMetadata.inProgress,
    lastRunStartedAt: syncMetadata.lastRunStartedAt
      ? new Date(syncMetadata.lastRunStartedAt)
      : null,
    lastRunCompletedAt: syncMetadata.lastRunCompletedAt
      ? new Date(syncMetadata.lastRunCompletedAt)
      : null,
    lastCheckpoint: syncMetadata.lastCheckpoint
      ? {
          lastSyncedAt: new Date(syncMetadata.lastCheckpoint.lastSyncedAt),
          versionHash: syncMetadata.lastCheckpoint.versionHash,
        }
      : null,
  };
}

export function getActiveSyncPromise(): Promise<EnsureTaskSpecsResult> | null {
  return syncPromise;
}

export function setActiveSyncPromise(promise: Promise<EnsureTaskSpecsResult> | null): void {
  syncPromise = promise;
}

export function markSyncStart(startedAt: Date): void {
  syncMetadata.inProgress = true;
  syncMetadata.lastRunStartedAt = startedAt;
}

export function markSyncSuccess(
  completedAt: Date,
  checkpoint: TaskSpecSyncCheckpoint | null,
): void {
  syncMetadata.inProgress = false;
  syncMetadata.lastRunCompletedAt = completedAt;
  syncMetadata.lastCheckpoint = checkpoint;
}

export function markSyncFailure(): void {
  syncMetadata.inProgress = false;
}

export function resetTaskSpecSync(): void {
  syncPromise = null;
  syncMetadata.inProgress = false;
  syncMetadata.lastRunStartedAt = null;
  syncMetadata.lastRunCompletedAt = null;
  syncMetadata.lastCheckpoint = null;
}
