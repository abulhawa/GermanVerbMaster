import { beforeEach, describe, expect, it } from 'vitest';
import { exportPracticeBundle, importPracticeBundle } from '@/lib/offline-bundle';
import { enqueueReviewTasks, getReviewQueue, clearReviewQueue } from '@/lib/review-queue';
import { practiceDb, practiceDbReady } from '@/lib/db';
import { savePracticeSettings, createDefaultSettings, loadPracticeSettings } from '@/lib/practice-settings';
import {
  savePracticeProgress,
  createEmptyProgressState,
  loadPracticeProgress,
} from '@/lib/practice-progress';
import {
  saveAnswerHistory,
  loadAnswerHistory,
  createAnswerHistoryEntry,
} from '@/lib/answer-history';
import { getPendingAttempts } from '@/lib/api';
import {
  recordInstalledPacks,
  loadInstalledPacks,
  mergeInstalledPacks,
  type InstalledPack,
} from '@/lib/practice-packs';
import type { PracticeTaskQueueItem, TaskAttemptPayload, PracticeTaskQueueItemMetadata } from '@shared';
import type { PracticeExportBundle } from '@/lib/offline-bundle';

const baseQueueItem: PracticeTaskQueueItem = {
  taskId: 'task:de:noun:haus:queue-test',
  lexemeId: 'lex:de:noun:haus',
  taskType: 'noun_case_declension',
  pos: 'noun',
  renderer: 'noun_case_declension',
  source: 'scheduler',
  enqueuedAt: new Date().toISOString(),
  metadata: {
    lemma: 'Haus',
    cefrLevel: 'A2',
  } satisfies PracticeTaskQueueItemMetadata,
};

const pendingPayload: TaskAttemptPayload = {
  taskId: baseQueueItem.taskId,
  lexemeId: baseQueueItem.lexemeId,
  taskType: baseQueueItem.taskType,
  pos: baseQueueItem.pos,
  renderer: baseQueueItem.renderer,
  result: 'correct',
  submittedResponse: 'das Haus',
  expectedResponse: 'das Haus',
  timeSpentMs: 1200,
  answeredAt: new Date().toISOString(),
  deviceId: 'device-test',
  queuedAt: new Date().toISOString(),
  cefrLevel: 'A2',
};

async function resetState() {
  localStorage.clear();
  clearReviewQueue();
  await practiceDbReady;
  await practiceDb.pendingAttempts.clear();
}

describe('offline practice bundle', () => {
  beforeEach(async () => {
    await resetState();
  });

  it('exports queue, attempts, and installed packs', async () => {
    enqueueReviewTasks([baseQueueItem], { replace: true });

    await practiceDbReady;
    await practiceDb.pendingAttempts.add({ payload: pendingPayload, createdAt: 1_700_000_000_000 });

    const settings = createDefaultSettings();
    settings.cefrLevelByPos.noun = 'A2';
    savePracticeSettings(settings);

    const progress = createEmptyProgressState();
    progress.totals.noun_case_declension = {
      correctAttempts: 2,
      incorrectAttempts: 1,
      streak: 2,
      lastPracticedAt: new Date().toISOString(),
      lexemes: {},
    };
    savePracticeProgress(progress);

    const answerEntry = createAnswerHistoryEntry({
      task: {
        ...baseQueueItem,
        prompt: { lemma: 'Haus', pos: 'noun', requestedCase: 'dative', requestedNumber: 'singular', instructions: 'Dativ' },
        expectedSolution: { form: 'dem Haus' },
        queueCap: 10,
        lexeme: { id: baseQueueItem.lexemeId, lemma: 'Haus', metadata: { level: 'A2' } },
        assignedAt: new Date().toISOString(),
      },
      result: 'correct',
      submittedResponse: 'dem Haus',
      expectedResponse: 'dem Haus',
      promptSummary: 'Dativ von Haus',
      timeSpentMs: 800,
    });
    saveAnswerHistory([answerEntry]);

    const installedPack: InstalledPack = {
      id: 'pack:nouns-foundation:1',
      slug: 'nouns-foundation',
      name: 'Nouns Foundation',
      installedAt: new Date().toISOString(),
    };
    recordInstalledPacks([installedPack]);

    const bundle = await exportPracticeBundle();

    expect(bundle.version).toBeGreaterThanOrEqual(2);
    expect(bundle.queue).toHaveLength(1);
    expect(bundle.queue[0]?.metadata?.lemma).toBe('Haus');
    expect(bundle.pendingAttempts).toHaveLength(1);
    expect(bundle.pendingAttempts[0]?.payload.taskId).toBe(baseQueueItem.taskId);
    expect(bundle.installedPacks.some((pack) => pack.slug === 'nouns-foundation')).toBe(true);

    const storedProgress = loadPracticeProgress();
    expect(storedProgress.totals.noun_case_declension?.correctAttempts).toBe(2);
  });

  it('imports bundle data into local caches', async () => {
    const importedQueue: PracticeTaskQueueItem[] = [
      { ...baseQueueItem, enqueuedAt: new Date(Date.now() - 1_000).toISOString() },
    ];

    const bundle: PracticeExportBundle = {
      version: 2,
      exportedAt: new Date().toISOString(),
      queue: importedQueue,
      pendingAttempts: [
        {
          payload: pendingPayload,
          createdAt: 1_700_000_010_000,
        },
      ],
      answerHistory: [
        {
          id: 'history-1',
          taskId: baseQueueItem.taskId,
          lexemeId: baseQueueItem.lexemeId,
          taskType: baseQueueItem.taskType,
          pos: baseQueueItem.pos,
          renderer: baseQueueItem.renderer,
          result: 'correct',
          submittedResponse: 'dem Haus',
          expectedResponse: 'dem Haus',
          promptSummary: 'Dativ von Haus',
          answeredAt: new Date().toISOString(),
          timeSpentMs: 900,
          timeSpent: 0,
          cefrLevel: 'A2',
          packId: null,
        },
      ],
      progress: createEmptyProgressState(),
      settings: createDefaultSettings(),
      installedPacks: [
        {
          id: 'pack:nouns-foundation:1',
          slug: 'nouns-foundation',
          name: 'Nouns Foundation',
          installedAt: new Date().toISOString(),
        },
      ],
    };

    await importPracticeBundle(bundle);

    const queue = getReviewQueue();
    expect(queue).toHaveLength(1);
    expect(queue[0]?.metadata?.lemma).toBe('Haus');

    const attempts = await getPendingAttempts();
    expect(attempts).toHaveLength(1);
    expect(attempts[0]?.payload.packId).toBeUndefined();

    const settings = loadPracticeSettings();
    expect(settings.defaultTaskType).toBe('conjugate_form');

    const history = loadAnswerHistory();
    expect(history).toHaveLength(1);
    expect(history[0]?.taskId).toBe(baseQueueItem.taskId);

    const packs = loadInstalledPacks();
    expect(packs).toEqual(
      mergeInstalledPacks([], [
        {
          id: 'pack:nouns-foundation:1',
          slug: 'nouns-foundation',
          name: 'Nouns Foundation',
          installedAt: packs[0]?.installedAt ?? expect.any(String),
        },
      ]),
    );

    const progress = loadPracticeProgress();
    expect(progress.totals.conjugate_form).toBeDefined();
  });
});
