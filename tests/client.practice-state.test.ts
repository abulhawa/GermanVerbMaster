import { beforeEach, describe, expect, it } from 'vitest';
import { loadAnswerHistory, saveAnswerHistory, createAnswerHistoryEntry } from '@/lib/answer-history';
import { getReviewQueue, enqueueReviewTasks, clearReviewQueue, peekReviewVerb, shiftReviewVerb } from '@/lib/review-queue';
import { loadPracticeProgress, recordTaskResult, createEmptyProgressState } from '@/lib/practice-progress';
import {
  loadPracticeSettings,
  savePracticeSettings,
  updateCefrLevel,
  updatePreferredTaskTypes,
  updateRendererPreferences,
  createDefaultSettings,
} from '@/lib/practice-settings';
import { enqueueTasks, loadPracticeSession, resetSession, savePracticeSession } from '@/lib/practice-session';
import type { PracticeTask, PracticeTaskQueueItem } from '@/lib/tasks';

const legacyVerb = {
  infinitive: 'gehen',
  english: 'to go',
  präteritum: 'ging',
  partizipII: 'gegangen',
  auxiliary: 'sein',
  level: 'A1',
  präteritumExample: 'ich ging',
  partizipIIExample: 'ich bin gegangen',
  source: { name: 'Duden', levelReference: 'A1' },
  pattern: null,
  praesensIch: 'gehe',
  praesensEr: 'geht',
  perfekt: 'ist gegangen',
  separable: null,
} as const;

const practiceTask: PracticeTask = {
  taskId: 'task-1',
  lexemeId: 'lex-1',
  taskType: 'conjugate_form',
  pos: 'verb',
  renderer: 'conjugate_form',
  prompt: {
    lemma: 'gehen',
    pos: 'verb',
    requestedForm: { tense: 'participle' },
    instructions: 'Partizip II angeben',
  },
  expectedSolution: { form: 'gegangen' },
  queueCap: 30,
  lexeme: { id: 'lex-1', lemma: 'gehen', metadata: { level: 'A1' } },
  pack: null,
  assignedAt: new Date().toISOString(),
  source: 'scheduler',
};

const queueItem: PracticeTaskQueueItem = {
  taskId: 'task-1',
  lexemeId: 'lex-1',
  taskType: 'conjugate_form',
  pos: 'verb',
  renderer: 'conjugate_form',
  source: 'review',
  enqueuedAt: new Date().toISOString(),
  metadata: { lemma: 'gehen', legacyVerbInfinitive: 'gehen' },
};

describe('practice state migrations', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('migrates legacy answer history entries', () => {
    const legacyEntry = {
      id: '1',
      verb: legacyVerb,
      mode: 'präteritum',
      result: 'correct',
      attemptedAnswer: 'ging',
      correctAnswer: 'ging',
      prompt: 'Präteritum von gehen',
      timeSpent: 1200,
      answeredAt: new Date().toISOString(),
      level: 'A1',
    };
    localStorage.setItem('answerHistory', JSON.stringify([legacyEntry]));

    const history = loadAnswerHistory();
    expect(history).toHaveLength(1);
    expect(history[0]?.taskId).toBe('legacy:verb:gehen');
    expect(history[0]?.legacyVerb?.verb.infinitive).toBe('gehen');
  });

  it('stores and reloads answer history entries', () => {
    const entry = createAnswerHistoryEntry({
      task: practiceTask,
      result: 'correct',
      submittedResponse: 'gegangen',
      expectedResponse: 'gegangen',
      promptSummary: 'Partizip II von gehen',
      timeSpentMs: 900,
    });

    saveAnswerHistory([entry]);
    const history = loadAnswerHistory();
    expect(history).toHaveLength(1);
    expect(history[0]?.taskId).toBe('task-1');
  });

  it('migrates review queue entries from verbs', () => {
    localStorage.setItem('focus-review-queue', JSON.stringify(['gehen', 'gehen', 'sein']));

    const queue = getReviewQueue();
    expect(queue).toHaveLength(2);
    expect(peekReviewVerb()).toBe('gehen');
    expect(shiftReviewVerb()).toBe('gehen');
  });

  it('enqueues task-based review items', () => {
    clearReviewQueue();
    enqueueReviewTasks([queueItem]);

    const queue = getReviewQueue();
    expect(queue).toHaveLength(1);
    expect(queue[0]?.taskId).toBe('task-1');
  });

  it('migrates legacy progress', () => {
    const legacyProgress = {
      correct: 5,
      total: 6,
      lastPracticed: new Date().toISOString(),
      streak: 3,
      practicedVerbs: { A1: ['gehen'] },
    };
    localStorage.setItem('progress', JSON.stringify(legacyProgress));

    const progress = loadPracticeProgress();
    expect(progress.totals.conjugate_form?.correctAttempts).toBe(5);
    expect(progress.totals.conjugate_form?.lexemes['legacy:verb:gehen']).toBeTruthy();
  });

  it('records task results into progress state', () => {
    const state = createEmptyProgressState();
    const next = recordTaskResult(state, {
      taskId: practiceTask.taskId,
      lexemeId: practiceTask.lexemeId,
      taskType: practiceTask.taskType,
      result: 'correct',
      cefrLevel: 'A1',
    });

    expect(next.totals.conjugate_form?.correctAttempts).toBe(1);
    expect(next.totals.conjugate_form?.lexemes[practiceTask.lexemeId]?.correctAttempts).toBe(1);
  });

  it('migrates legacy settings', () => {
    const legacySettings = { level: 'B1', showHints: false, showExamples: true };
    localStorage.setItem('settings', JSON.stringify(legacySettings));

    const settings = loadPracticeSettings();
    expect(settings.cefrLevelByPos.verb).toBe('B1');
    expect(settings.rendererPreferences.conjugate_form.showHints).toBe(false);
  });

  it('updates settings helpers', () => {
    let settings = createDefaultSettings();
    settings = updateCefrLevel(settings, { pos: 'verb', level: 'B2' });
    settings = updatePreferredTaskTypes(settings, ['conjugate_form']);
    settings = updateRendererPreferences(settings, {
      taskType: 'conjugate_form',
      preferences: { showHints: false },
    });

    savePracticeSettings(settings);
    const loaded = loadPracticeSettings();
    expect(loaded.cefrLevelByPos.verb).toBe('B2');
    expect(loaded.rendererPreferences.conjugate_form.showHints).toBe(false);
  });

  it('persists practice session state', () => {
    const initial = loadPracticeSession();
    expect(initial.queue).toHaveLength(0);

    const queued = enqueueTasks(initial, [practiceTask]);
    savePracticeSession(queued);

    const reloaded = loadPracticeSession();
    expect(reloaded.queue).toContain('task-1');

    const reset = resetSession();
    expect(reset.queue).toHaveLength(0);
  });
});
