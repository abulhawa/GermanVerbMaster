import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AdaptiveQueueItem } from '@shared';

import { setupTestDatabase, type TestDatabaseContext } from './helpers/pg';

describe('verb queue shadow mode', () => {
  let db: typeof import('@db').db;
  let lexemesTable: typeof import('../db/schema.js').lexemes;
  let taskSpecsTable: typeof import('../db/schema.js').taskSpecs;
  let schedulingTable: typeof import('../db/schema.js').schedulingState;
  let buildVerbShadowQueue: typeof import('../server/tasks/shadow-mode.js').buildVerbShadowQueue;
  let runVerbQueueShadowComparison: typeof import('../server/tasks/shadow-mode.js').runVerbQueueShadowComparison;
  let computeQueueDivergence: typeof import('../server/tasks/shadow-mode.js').computeQueueDivergence;
  let taskRegistry: typeof import('../server/tasks/registry.js').taskRegistry;
  let dbContext: TestDatabaseContext | undefined;

  const baseTimestamp = new Date('2025-01-01T00:00:00.000Z');

  beforeEach(async () => {
    const context = await setupTestDatabase();
    dbContext = context;
    context.mock();

    ({ db } = await import('@db'));
    const schema = await import('../db/schema.js');
    lexemesTable = schema.lexemes;
    taskSpecsTable = schema.taskSpecs;
    schedulingTable = schema.schedulingState;

    ({ taskRegistry } = await import('../server/tasks/registry.js'));
    ({
      buildVerbShadowQueue,
      runVerbQueueShadowComparison,
      computeQueueDivergence,
    } = await import('../server/tasks/shadow-mode.js'));
  });

  afterEach(async () => {
    if (dbContext) {
      await dbContext.cleanup();
      dbContext = undefined;
    }
  });

  async function insertLexeme({
    id,
    lemma,
    metadata = {},
    frequencyRank = null,
  }: {
    id: string;
    lemma: string;
    metadata?: Record<string, unknown>;
    frequencyRank?: number | null;
  }) {
    await db.insert(lexemesTable).values({
      id,
      lemma,
      language: 'de',
      pos: 'verb',
      gender: null,
      metadata,
      frequencyRank,
      sourceIds: ['seed'],
      createdAt: baseTimestamp,
      updatedAt: baseTimestamp,
    });
  }

  async function insertTask({
    id,
    lexemeId,
    prompt,
    solution,
  }: {
    id: string;
    lexemeId: string;
    prompt: Record<string, unknown>;
    solution: Record<string, unknown>;
  }) {
    await db.insert(taskSpecsTable).values({
      id,
      lexemeId,
      pos: 'verb',
      taskType: 'conjugate_form',
      renderer: taskRegistry.conjugate_form.renderer,
      prompt,
      solution,
      revision: 1,
      sourcePack: 'test-pack',
      createdAt: baseTimestamp,
      updatedAt: baseTimestamp,
    });
  }

  async function insertScheduling({
    deviceId,
    taskId,
    priorityScore,
  }: {
    deviceId: string;
    taskId: string;
    priorityScore: number;
  }) {
    await db.insert(schedulingTable).values({
      deviceId,
      taskId,
      leitnerBox: 3,
      totalAttempts: 5,
      correctAttempts: 4,
      averageResponseMs: 1800,
      accuracyWeight: 0.7,
      latencyWeight: 0.6,
      stabilityWeight: 0.5,
      priorityScore,
      dueAt: baseTimestamp,
      lastResult: 'correct',
      lastPracticedAt: baseTimestamp,
      createdAt: baseTimestamp,
      updatedAt: baseTimestamp,
    });
  }

  it('prioritises scheduled tasks by priority score', async () => {
    await insertLexeme({ id: 'lex:de:verb:gehen', lemma: 'gehen', metadata: { english: 'to go' } });
    await insertLexeme({ id: 'lex:de:verb:kommen', lemma: 'kommen', metadata: { english: 'to come' } });

    await insertTask({
      id: 'task:de:verb:gehen:partizip',
      lexemeId: 'lex:de:verb:gehen',
      prompt: { lemma: 'gehen', requestedForm: 'participle' },
      solution: { form: 'gegangen' },
    });
    await insertTask({
      id: 'task:de:verb:kommen:partizip',
      lexemeId: 'lex:de:verb:kommen',
      prompt: { lemma: 'kommen', requestedForm: 'participle' },
      solution: { form: 'gekommen' },
    });

    await insertScheduling({ deviceId: 'device-priority', taskId: 'task:de:verb:gehen:partizip', priorityScore: 1.2 });
    await insertScheduling({ deviceId: 'device-priority', taskId: 'task:de:verb:kommen:partizip', priorityScore: 0.6 });

    const queue = await buildVerbShadowQueue('device-priority', 2);

    expect(queue.items).toHaveLength(2);
    expect(queue.items[0]?.lemma).toBe('gehen');
    expect(queue.items[0]?.source).toBe('scheduled');
    expect(queue.items[1]?.lemma).toBe('kommen');
  });

  it('fills fallback tasks when scheduling state missing', async () => {
    await insertLexeme({ id: 'lex:de:verb:sehen', lemma: 'sehen', metadata: { english: 'to see' } });
    await insertTask({
      id: 'task:de:verb:sehen:partizip',
      lexemeId: 'lex:de:verb:sehen',
      prompt: { lemma: 'sehen', requestedForm: 'participle' },
      solution: { form: 'gesehen' },
    });

    const queue = await buildVerbShadowQueue('device-fallback', 3);

    expect(queue.items).not.toHaveLength(0);
    expect(queue.items[0]?.lemma).toBe('sehen');
    expect(queue.items[0]?.source).toBe('fallback');
  });

  it('summarises divergence between legacy and shadow queues', () => {
    const legacy: import('../server/tasks/shadow-mode.js').LegacyVerbQueueSnapshot = {
      deviceId: 'device-compare',
      items: [
        {
          verb: 'gehen',
          priority: 1,
          dueAt: new Date('2025-01-03T00:00:00.000Z').toISOString(),
          leitnerBox: 2,
          accuracyWeight: 0.5,
          latencyWeight: 0.6,
          stabilityWeight: 0.4,
          predictedIntervalMinutes: 120,
        } satisfies AdaptiveQueueItem,
        {
          verb: 'lernen',
          priority: 0.8,
          dueAt: new Date('2025-01-04T00:00:00.000Z').toISOString(),
          leitnerBox: 1,
          accuracyWeight: 0.4,
          latencyWeight: 0.7,
          stabilityWeight: 0.3,
          predictedIntervalMinutes: 180,
        } satisfies AdaptiveQueueItem,
      ],
    };

    const shadow: import('../server/tasks/shadow-mode.js').VerbShadowQueueSnapshot = {
      generatedAt: new Date('2025-01-05T00:00:00.000Z'),
      generationDurationMs: 12,
      items: [
        {
          taskId: 'task:de:verb:kommen:partizip',
          lexemeId: 'lex:de:verb:kommen',
          lemma: 'kommen',
          priorityScore: 1.1,
          dueAt: new Date('2025-01-02T00:00:00.000Z'),
          leitnerBox: 2,
          accuracyWeight: 0.6,
          latencyWeight: 0.7,
          stabilityWeight: 0.5,
          source: 'scheduled',
        },
      ],
    };

    const report = computeQueueDivergence(legacy, shadow);

    expect(report.missingInShadow).toEqual(['gehen', 'lernen']);
    expect(report.missingInLegacy).toEqual(['kommen']);
    expect(report.orderMismatches).toHaveLength(1);
    expect(report.orderMismatches[0]).toMatchObject({ index: 0, legacyVerb: 'gehen', shadowLemma: 'kommen' });
  });

  it('logs a warning when queues diverge', async () => {
    await insertLexeme({ id: 'lex:de:verb:kommen', lemma: 'kommen', metadata: { english: 'to come' } });
    await insertTask({
      id: 'task:de:verb:kommen:partizip',
      lexemeId: 'lex:de:verb:kommen',
      prompt: { lemma: 'kommen', requestedForm: 'participle' },
      solution: { form: 'gekommen' },
    });

    const legacyQueue = {
      deviceId: 'device-warn',
      items: [
        {
          verb: 'gehen',
          priority: 1,
          dueAt: new Date().toISOString(),
          leitnerBox: 2,
          accuracyWeight: 0.5,
          latencyWeight: 0.6,
          stabilityWeight: 0.4,
          predictedIntervalMinutes: 90,
        } satisfies AdaptiveQueueItem,
      ],
    } satisfies import('../server/tasks/shadow-mode.js').LegacyVerbQueueSnapshot;

    const logger = {
      info: vi.fn(),
      warn: vi.fn(),
    };

    await runVerbQueueShadowComparison({ deviceId: 'device-warn', legacyQueue, limit: 1, logger });

    expect(logger.warn).toHaveBeenCalledTimes(1);
    expect(logger.info).not.toHaveBeenCalled();
  });

  it('logs parity information when queues align', async () => {
    await insertLexeme({ id: 'lex:de:verb:gehen', lemma: 'gehen', metadata: { english: 'to go' } });
    await insertTask({
      id: 'task:de:verb:gehen:partizip',
      lexemeId: 'lex:de:verb:gehen',
      prompt: { lemma: 'gehen', requestedForm: 'participle' },
      solution: { form: 'gegangen' },
    });

    const legacyQueue = {
      deviceId: 'device-info',
      items: [
        {
          verb: 'gehen',
          priority: 1,
          dueAt: new Date().toISOString(),
          leitnerBox: 2,
          accuracyWeight: 0.5,
          latencyWeight: 0.6,
          stabilityWeight: 0.4,
          predictedIntervalMinutes: 90,
        } satisfies AdaptiveQueueItem,
      ],
    } satisfies import('../server/tasks/shadow-mode.js').LegacyVerbQueueSnapshot;

    const logger = {
      info: vi.fn(),
      warn: vi.fn(),
    };

    await runVerbQueueShadowComparison({ deviceId: 'device-info', legacyQueue, limit: 1, logger });

    expect(logger.info).toHaveBeenCalledTimes(1);
    expect(logger.warn).not.toHaveBeenCalled();
  });
});
