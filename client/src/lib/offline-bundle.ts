import type {
  PracticeTaskQueueItem,
  PracticeTaskQueueItemMetadata,
  TaskAnswerHistoryItem,
  TaskAttemptPayload,
  PracticeProgressState,
  PracticeSettingsState,
} from '@shared';
import { getReviewQueue, enqueueReviewTasks, clearReviewQueue } from '@/lib/review-queue';
import { getPendingAttempts } from '@/lib/api';
import { practiceDb, practiceDbReady } from '@/lib/db';
import { loadPracticeSettings, savePracticeSettings } from '@/lib/practice-settings';
import { loadPracticeProgress, savePracticeProgress } from '@/lib/practice-progress';
import { loadAnswerHistory, saveAnswerHistory } from '@/lib/answer-history';
import {
  extractPacksFromQueue,
  loadInstalledPacks,
  mergeInstalledPacks,
  recordInstalledPacks,
  type InstalledPack,
} from '@/lib/practice-packs';

const BUNDLE_VERSION = 2;

export interface PendingAttemptSnapshot {
  payload: TaskAttemptPayload;
  createdAt: number;
  retryCount?: number;
  lastTriedAt?: number;
}

export interface PracticeExportBundle {
  version: number;
  exportedAt: string;
  queue: PracticeTaskQueueItem[];
  pendingAttempts: PendingAttemptSnapshot[];
  answerHistory: TaskAnswerHistoryItem[];
  progress: PracticeProgressState;
  settings: PracticeSettingsState;
  installedPacks: InstalledPack[];
}

export interface ImportBundleOptions {
  mergeQueue?: boolean;
}

function normaliseIsoDate(value: unknown): string {
  if (typeof value === 'string' && value.trim()) {
    const parsed = Date.parse(value);
    if (!Number.isNaN(parsed)) {
      return new Date(parsed).toISOString();
    }
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    return new Date(value).toISOString();
  }
  return new Date().toISOString();
}

function cloneMetadata(metadata: PracticeTaskQueueItemMetadata | undefined): PracticeTaskQueueItemMetadata | undefined {
  if (!metadata) {
    return undefined;
  }
  const clone: PracticeTaskQueueItemMetadata = { ...metadata };
  return clone;
}

function sanitiseQueue(queue: unknown): PracticeTaskQueueItem[] {
  if (!Array.isArray(queue)) {
    return [];
  }

  const seen = new Set<string>();
  const result: PracticeTaskQueueItem[] = [];

  for (const entry of queue) {
    if (!entry || typeof entry !== 'object') {
      continue;
    }
    const raw = entry as PracticeTaskQueueItem;
    const taskId = typeof raw.taskId === 'string' ? raw.taskId.trim() : '';
    const lexemeId = typeof raw.lexemeId === 'string' ? raw.lexemeId.trim() : '';
    const taskType = raw.taskType;
    const pos = raw.pos;
    const renderer = raw.renderer;
    const source = raw.source ?? 'review';

    if (!taskId || !lexemeId || !taskType || !pos || !renderer) {
      continue;
    }

    if (seen.has(taskId)) {
      continue;
    }

    const enqueuedAt = normaliseIsoDate(raw.enqueuedAt);

    result.push({
      taskId,
      lexemeId,
      taskType,
      pos,
      renderer,
      source,
      enqueuedAt,
      metadata: cloneMetadata(raw.metadata),
    });
    seen.add(taskId);
  }

  return result;
}

function sanitisePendingAttempts(attempts: unknown): PendingAttemptSnapshot[] {
  if (!Array.isArray(attempts)) {
    return [];
  }

  const result: PendingAttemptSnapshot[] = [];
  for (const entry of attempts) {
    if (!entry || typeof entry !== 'object') {
      continue;
    }
    const raw = entry as PendingAttemptSnapshot;
    if (!raw.payload || typeof raw.payload !== 'object') {
      continue;
    }
    if (!raw.payload.taskId || !raw.payload.lexemeId) {
      continue;
    }
    const retryCount = typeof raw.retryCount === 'number' && raw.retryCount >= 0 ? raw.retryCount : 0;
    const lastTriedAt =
      typeof raw.lastTriedAt === 'number' && Number.isFinite(raw.lastTriedAt) ? raw.lastTriedAt : undefined;
    result.push({
      payload: raw.payload,
      createdAt: typeof raw.createdAt === 'number' && Number.isFinite(raw.createdAt)
        ? raw.createdAt
        : Date.now(),
      retryCount,
      lastTriedAt,
    });
  }
  return result;
}

function sanitiseAnswerHistory(history: unknown): TaskAnswerHistoryItem[] {
  if (!Array.isArray(history)) {
    return [];
  }
  return history.filter((item): item is TaskAnswerHistoryItem => Boolean(item && typeof item === 'object'));
}

export async function exportPracticeBundle(): Promise<PracticeExportBundle> {
  const [queue, attempts, settings, progress, answerHistory, installedPacks] = await Promise.all([
    Promise.resolve(getReviewQueue()),
    getPendingAttempts(),
    Promise.resolve(loadPracticeSettings()),
    Promise.resolve(loadPracticeProgress()),
    Promise.resolve(loadAnswerHistory()),
    Promise.resolve(loadInstalledPacks()),
  ]);

  const pendingAttempts: PendingAttemptSnapshot[] = attempts.map((attempt) => ({
    payload: attempt.payload,
    createdAt: attempt.createdAt,
    retryCount: attempt.retryCount,
    lastTriedAt: attempt.lastTriedAt,
  }));

  const queuePacks = extractPacksFromQueue(queue);
  const combinedPacks = mergeInstalledPacks(installedPacks, queuePacks);

  return {
    version: BUNDLE_VERSION,
    exportedAt: new Date().toISOString(),
    queue,
    pendingAttempts,
    answerHistory,
    progress,
    settings,
    installedPacks: combinedPacks,
  } satisfies PracticeExportBundle;
}

export async function importPracticeBundle(
  bundle: PracticeExportBundle,
  options: ImportBundleOptions = {},
): Promise<void> {
  if (!bundle || typeof bundle !== 'object') {
    throw new Error('Invalid practice bundle provided');
  }

  if (typeof bundle.version !== 'number' || bundle.version > BUNDLE_VERSION) {
    throw new Error(`Unsupported practice bundle version: ${bundle.version}`);
  }

  const sanitisedQueue = sanitiseQueue(bundle.queue);
  const sanitisedAttempts = sanitisePendingAttempts(bundle.pendingAttempts);
  const sanitisedHistory = sanitiseAnswerHistory(bundle.answerHistory);

  if (options.mergeQueue) {
    enqueueReviewTasks(sanitisedQueue, { replace: false });
  } else {
    clearReviewQueue();
    enqueueReviewTasks(sanitisedQueue, { replace: true });
  }

  await practiceDbReady;
  await practiceDb.transaction('rw', practiceDb.pendingAttempts, async () => {
    await practiceDb.pendingAttempts.clear();
    for (const attempt of sanitisedAttempts) {
      await practiceDb.pendingAttempts.add({
        payload: attempt.payload,
        createdAt: attempt.createdAt,
        retryCount: attempt.retryCount ?? 0,
        lastTriedAt: attempt.lastTriedAt,
      });
    }
  });

  if (bundle.settings) {
    savePracticeSettings(bundle.settings);
  }

  if (bundle.progress) {
    savePracticeProgress(bundle.progress);
  }

  saveAnswerHistory(sanitisedHistory);

  const queuePacks = extractPacksFromQueue(getReviewQueue());
  const incomingPacks = mergeInstalledPacks(bundle.installedPacks ?? [], queuePacks);
  recordInstalledPacks(incomingPacks);
}

export async function getPendingAttemptSnapshots(): Promise<PendingAttemptSnapshot[]> {
  const attempts = await getPendingAttempts();
  return attempts.map((attempt) => ({
    payload: attempt.payload,
    createdAt: attempt.createdAt,
    retryCount: attempt.retryCount,
    lastTriedAt: attempt.lastTriedAt,
  }));
}

export async function clearPendingAttempts(): Promise<void> {
  await practiceDbReady;
  await practiceDb.transaction('rw', practiceDb.pendingAttempts, async () => {
    await practiceDb.pendingAttempts.clear();
  });
}
