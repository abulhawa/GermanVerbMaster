import './helpers/mock-auth';
import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { AggregatedWord } from '../scripts/etl/types';
import { setupTestDatabase, type TestDatabaseContext } from './helpers/pg';
import { createApiInvoker } from './helpers/vercel';

vi.mock('../server/srs/index.js', () => ({
  srsEngine: {
    regenerateQueuesOnce: vi.fn(),
    recordPracticeAttempt: vi.fn(),
    fetchQueueForDevice: vi.fn(),
    generateQueueForDevice: vi.fn(),
    isEnabled: vi.fn(() => false),
    isQueueStale: vi.fn(() => false),
  },
}));

describe('tasks API', () => {
  let buildGoldenBundles: typeof import('../scripts/etl/golden').buildGoldenBundles;
  let upsertGoldenBundles: typeof import('../scripts/etl/golden').upsertGoldenBundles;
  let seedLexemeInventoryForWords: typeof import('./helpers/task-fixtures').seedLexemeInventoryForWords;
  let invokeApi: ReturnType<typeof createApiInvoker>;
  let createVercelApiHandler: typeof import('../server/api/vercel-handler.js').createVercelApiHandler;
  let schedulingStateTable: typeof import('../db/schema.js').schedulingState;
  let telemetryTable: typeof import('../db/schema.js').telemetryPriorities;
  let practiceHistoryTable: typeof import('../db/schema.js').practiceHistory;
  let drizzleDb: typeof import('@db').db;
  let dbContext: TestDatabaseContext | undefined;
  let mockedSrsEngine: any;

  beforeEach(async () => {
    const context = await setupTestDatabase();
    dbContext = context;
    context.mock();

    const schemaModule = await import('../db/schema.js');
    schedulingStateTable = schemaModule.schedulingState;
    telemetryTable = schemaModule.telemetryPriorities;
    practiceHistoryTable = schemaModule.practiceHistory;
    const dbModule = await import('@db');
    drizzleDb = dbModule.db;

  const sampleWords: AggregatedWord[] = [
    {
      lemma: 'gehen',
      pos: 'V',
      level: 'A1',
        english: 'to go',
        exampleDe: 'Wir gehen nach Hause.',
        exampleEn: 'We go home.',
        gender: null,
        plural: null,
        separable: false,
        aux: 'sein',
        praesensIch: 'gehe',
        praesensEr: 'geht',
        praeteritum: 'ging',
        partizipIi: 'gegangen',
        perfekt: 'ist gegangen',
        comparative: null,
        superlative: null,
        canonical: true,
        complete: true,
        sourcesCsv: 'test-source',
        sourceNotes: null,
      },
      {
        lemma: 'kommen',
        pos: 'V',
        level: 'A1',
        english: 'to come',
        exampleDe: 'Sie kommen später.',
        exampleEn: 'They come later.',
        gender: null,
        plural: null,
        separable: false,
        aux: 'sein',
        praesensIch: 'komme',
        praesensEr: 'kommt',
        praeteritum: 'kam',
        partizipIi: 'gekommen',
        perfekt: 'ist gekommen',
        comparative: null,
      superlative: null,
      canonical: true,
      complete: true,
      sourcesCsv: 'test-source',
      sourceNotes: null,
      translations: null,
      examples: null,
      posAttributes: null,
      enrichmentAppliedAt: null,
      enrichmentMethod: null,
    },
    {
      lemma: 'Haus',
      pos: 'N',
        level: 'A1',
        english: 'house',
        exampleDe: 'Das Haus ist groß.',
        exampleEn: 'The house is big.',
        gender: 'das',
        plural: 'Häuser',
        separable: null,
        aux: null,
        praesensIch: null,
        praesensEr: null,
        praeteritum: null,
        partizipIi: null,
        perfekt: null,
        comparative: null,
      superlative: null,
      canonical: true,
      complete: true,
      sourcesCsv: 'test-source',
      sourceNotes: null,
      translations: null,
      examples: null,
      posAttributes: null,
      enrichmentAppliedAt: null,
      enrichmentMethod: null,
    },
    {
      lemma: 'schnell',
      pos: 'Adj',
        level: 'A1',
        english: 'fast',
        exampleDe: 'Ein schneller Zug.',
        exampleEn: 'A fast train.',
        gender: null,
        plural: null,
        separable: null,
        aux: null,
        praesensIch: null,
        praesensEr: null,
        praeteritum: null,
        partizipIi: null,
        perfekt: null,
        comparative: 'schneller',
      superlative: 'am schnellsten',
      canonical: true,
      complete: true,
      sourcesCsv: 'test-source',
      sourceNotes: null,
      translations: null,
      examples: null,
      posAttributes: null,
      enrichmentAppliedAt: null,
      enrichmentMethod: null,
    },
  ];

    ({ buildGoldenBundles, upsertGoldenBundles } = await import('../scripts/etl/golden'));
    ({ seedLexemeInventoryForWords } = await import('./helpers/task-fixtures'));

    await seedLexemeInventoryForWords(drizzleDb, sampleWords);
    const bundles = buildGoldenBundles(sampleWords);
    await upsertGoldenBundles(drizzleDb, bundles);

    ({ createVercelApiHandler } = await import('../server/api/vercel-handler.js'));
    const handler = createVercelApiHandler({ enableCors: false });
    invokeApi = createApiInvoker(handler);

    mockedSrsEngine = (await import('../server/srs/index.js')).srsEngine as any;
    if (mockedSrsEngine) {
      Object.values(mockedSrsEngine).forEach((fn: any) => {
        if (typeof fn?.mockReset === 'function') {
          fn.mockReset();
        }
      });
      if (typeof mockedSrsEngine.isEnabled?.mockReturnValue === 'function') {
        mockedSrsEngine.isEnabled.mockReturnValue(false);
      }
      if (typeof mockedSrsEngine.isQueueStale?.mockReturnValue === 'function') {
        mockedSrsEngine.isQueueStale.mockReturnValue(false);
      }
    }
  });

  afterEach(async () => {
    if (dbContext) {
      await dbContext.cleanup();
      dbContext = undefined;
    }
  });

  it('responds with an error when the task registry is misconfigured', async () => {
    if (!dbContext) {
      throw new Error('test database not initialised');
    }

    const taskLookup = await dbContext.pool.query(
      'select id from task_specs order by updated_at desc limit 1',
    );
    const taskId = taskLookup.rows[0]?.id;
    expect(taskId).toBeDefined();

    await dbContext.pool.query(
      'update task_specs set task_type = $1 where id = $2',
      ['unsupported_task_type', taskId],
    );

    const response = await invokeApi('/api/tasks');
    expect(response.status).toBe(500);

    const body = (response.bodyJson ?? JSON.parse(response.bodyText)) as { error?: string };
    expect(body?.error).toContain('Unknown task type');
  });

  it('records submissions and updates scheduling state', async () => {
    const taskResponse = await invokeApi('/api/tasks?pos=verb&limit=1');
    expect(taskResponse.status).toBe(200);
    const task = (taskResponse.bodyJson as any).tasks[0];
    expect(task).toBeDefined();

    const submission = await invokeApi('/api/submission', {
      method: 'POST',
      body: {
        taskId: task.taskId,
        lexemeId: task.lexeme.id,
        taskType: task.taskType,
        pos: task.pos,
        renderer: task.renderer,
        deviceId: 'device-123',
        result: 'correct',
        timeSpentMs: 1500,
        answeredAt: new Date('2025-01-01T12:00:00.000Z').toISOString(),
      },
    });

    expect(submission.status).toBe(200);
    const submissionBody = submission.bodyJson as any;
    expect(submissionBody.status).toBe('recorded');
    expect(submissionBody.leitnerBox).toBeGreaterThanOrEqual(1);
    expect(submissionBody.queueCap).toBeGreaterThan(0);
    expect(submissionBody.coverageScore).toBeGreaterThanOrEqual(0);

    const schedulingResult = await dbContext.pool.query(
      'select total_attempts, correct_attempts from scheduling_state where task_id = $1',
      [task.taskId],
    );

    expect(schedulingResult.rows[0]?.total_attempts).toBeGreaterThan(0);
    expect(schedulingResult.rows[0]?.correct_attempts).toBeGreaterThan(0);

    const telemetryResult = await dbContext.pool.query(
      'select priority_score, metadata from telemetry_priorities where task_id = $1',
      [task.taskId],
    );

    expect(telemetryResult.rowCount).toBe(1);
    expect(telemetryResult.rows[0]?.priority_score).toBeCloseTo(submissionBody.priorityScore, 5);
    expect(telemetryResult.rows[0]?.metadata).toMatchObject({
      posAssignments: 1,
      queueCap: submissionBody.queueCap,
    });

    const historyResult = await dbContext.pool.query(
      'select task_id, device_id, result, pos, task_type, hints_used, feature_flags, metadata from practice_history where task_id = $1',
      [task.taskId],
    );

    expect(historyResult.rows[0]).toBeDefined();
    expect(historyResult.rows[0]!.device_id).toBe('device-123');
    expect(historyResult.rows[0]!.result).toBe('correct');
    expect(historyResult.rows[0]!.pos).toBe(task.pos);
    expect(historyResult.rows[0]!.task_type).toBe(task.taskType);
    expect(historyResult.rows[0]!.hints_used).toBe(false);
    expect(historyResult.rows[0]!.feature_flags).toBeDefined();
    expect(historyResult.rows[0]!.metadata).toMatchObject({
      queueCap: submissionBody.queueCap,
      leitnerBox: submissionBody.leitnerBox,
    });
  });

  it('prioritizes verbs surfaced by the adaptive queue when enabled', async () => {
    if (!mockedSrsEngine) {
      throw new Error('srsEngine mock not initialised');
    }

    mockedSrsEngine.isEnabled.mockReturnValue(true);
    mockedSrsEngine.fetchQueueForDevice.mockResolvedValue({
      deviceId: 'device-123',
      version: 'v1',
      generatedAt: new Date(),
      validUntil: new Date(Date.now() + 60_000),
      generationDurationMs: 5,
      itemCount: 2,
      items: [
        {
          verb: 'kommen',
          priority: 1,
          dueAt: new Date().toISOString(),
          leitnerBox: 2,
          accuracyWeight: 0.6,
          latencyWeight: 0.7,
          stabilityWeight: 0.4,
          predictedIntervalMinutes: 180,
        },
        {
          verb: 'gehen',
          priority: 0.8,
          dueAt: new Date().toISOString(),
          leitnerBox: 1,
          accuracyWeight: 0.5,
          latencyWeight: 0.6,
          stabilityWeight: 0.3,
          predictedIntervalMinutes: 120,
        },
      ],
    });

    const response = await invokeApi('/api/tasks?pos=verb&limit=2&deviceId=device-123&level=A1');
    expect(response.status).toBe(200);
    const payload = response.bodyJson as { tasks: any[] };
    expect(payload.tasks).toHaveLength(2);
    expect(payload.tasks[0]?.lexeme?.lemma).toBe('kommen');
    expect(payload.tasks[1]?.lexeme?.lemma).toBeDefined();
    expect(mockedSrsEngine.fetchQueueForDevice).toHaveBeenCalledWith('device-123');
    expect(mockedSrsEngine.generateQueueForDevice).not.toHaveBeenCalled();
  });

  it('reorders fallback tasks using scheduling state when adaptive queue is disabled', async () => {
    const deviceId = 'device-priority';
    const initialResponse = await invokeApi(`/api/tasks?pos=verb&limit=2&deviceId=${deviceId}`);
    expect(initialResponse.status).toBe(200);
    const initialTasks = (initialResponse.bodyJson as any).tasks as Array<{ taskId: string }>;
    expect(initialTasks.length).toBeGreaterThanOrEqual(2);

    const [firstTask, secondTask] = initialTasks;
    expect(firstTask).toBeDefined();
    expect(secondTask).toBeDefined();

    await drizzleDb.delete(schedulingStateTable).where(eq(schedulingStateTable.deviceId, deviceId));

    const now = new Date('2025-01-01T12:00:00.000Z');
    const incorrectDueAt = new Date(now.getTime() - 10 * 60 * 1000);
    const farFuture = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

    await drizzleDb.insert(schedulingStateTable).values([
      {
        deviceId,
        taskId: firstTask.taskId,
        leitnerBox: 3,
        totalAttempts: 4,
        correctAttempts: 4,
        averageResponseMs: 1800,
        accuracyWeight: 0.9,
        latencyWeight: 0.85,
        stabilityWeight: 0.65,
        priorityScore: 0.1,
        dueAt: farFuture,
        lastResult: 'correct',
        lastPracticedAt: now,
        createdAt: now,
        updatedAt: now,
      },
      {
        deviceId,
        taskId: secondTask.taskId,
        leitnerBox: 1,
        totalAttempts: 3,
        correctAttempts: 1,
        averageResponseMs: 4200,
        accuracyWeight: 0.4,
        latencyWeight: 0.5,
        stabilityWeight: 0.25,
        priorityScore: 1.35,
        dueAt: incorrectDueAt,
        lastResult: 'incorrect',
        lastPracticedAt: incorrectDueAt,
        createdAt: incorrectDueAt,
        updatedAt: incorrectDueAt,
      },
    ]);

    const prioritizedResponse = await invokeApi(`/api/tasks?pos=verb&limit=2&deviceId=${deviceId}`);
    expect(prioritizedResponse.status).toBe(200);
    const prioritizedTasks = (prioritizedResponse.bodyJson as any).tasks as Array<{ taskId: string }>;
    expect(prioritizedTasks).toHaveLength(2);
    expect(prioritizedTasks[0]?.taskId).toBe(secondTask.taskId);
    expect(prioritizedTasks[0]?.taskId).not.toBe(firstTask.taskId);
  });
});
