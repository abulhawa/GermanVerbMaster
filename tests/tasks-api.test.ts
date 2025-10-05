import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { AggregatedWord } from '../scripts/etl/golden';
import { buildGoldenBundles, upsertGoldenBundles } from '../scripts/etl/golden';
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
  let invokeApi: ReturnType<typeof createApiInvoker>;
  let createVercelApiHandler: typeof import('../server/api/vercel-handler.js').createVercelApiHandler;
  let schedulingStateTable: typeof import('../db/schema.js').schedulingState;
  let telemetryTable: typeof import('../db/schema.js').telemetryPriorities;
  let practiceHistoryTable: typeof import('../db/schema.js').practiceHistory;
  let drizzleDb: typeof import('@db').db;
  let dbContext: TestDatabaseContext | undefined;

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
      },
    ];

    const bundles = buildGoldenBundles(sampleWords);
    await upsertGoldenBundles(drizzleDb, bundles);

    ({ createVercelApiHandler } = await import('../server/api/vercel-handler.js'));
    const handler = createVercelApiHandler({ enableCors: false });
    invokeApi = createApiInvoker(handler);
  });

  afterEach(async () => {
    if (dbContext) {
      await dbContext.cleanup();
      dbContext = undefined;
    }
  });

  it('returns seeded tasks with metadata', async () => {
    const response = await invokeApi('/api/tasks');
    expect(response.status).toBe(200);
    const body = response.bodyJson as { tasks: any[] };
    expect(Array.isArray(body.tasks)).toBe(true);
    expect(body.tasks.length).toBeGreaterThan(0);

    const verbTasks = await invokeApi('/api/tasks?pos=verb');
    expect(verbTasks.status).toBe(200);
    const verbBody = verbTasks.bodyJson as { tasks: any[] };
    expect(verbBody.tasks.every((task: any) => task.pos === 'verb')).toBe(true);
  });

  it('records submissions and updates scheduling state', async () => {
    const taskResponse = await invokeApi('/api/tasks?pos=verb&limit=1');
    expect(taskResponse.status).toBe(200);
    const task = (taskResponse.bodyJson as any).tasks[0];
    expect(task).toBeDefined();

    const submission = await invokeApi('/api/submission', {
      method: 'POST',
      body: {
        taskId: task.id,
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

    const rows = await drizzleDb
      .select({
        totalAttempts: schedulingStateTable.totalAttempts,
        correctAttempts: schedulingStateTable.correctAttempts,
      })
      .from(schedulingStateTable)
      .where(eq(schedulingStateTable.taskId, task.id));

    expect(rows[0]?.totalAttempts).toBeGreaterThan(0);
    expect(rows[0]?.correctAttempts).toBeGreaterThan(0);

    const telemetryRows = await drizzleDb
      .select({
        priorityScore: telemetryTable.priorityScore,
        metadata: telemetryTable.metadata,
      })
      .from(telemetryTable)
      .where(eq(telemetryTable.taskId, task.id));

    expect(telemetryRows.length).toBe(1);
    expect(telemetryRows[0]?.priorityScore).toBeCloseTo(submissionBody.priorityScore, 5);
    expect(telemetryRows[0]?.metadata).toMatchObject({
      posAssignments: 1,
      queueCap: submissionBody.queueCap,
    });

    const historyRows = await drizzleDb
      .select({
        taskId: practiceHistoryTable.taskId,
        deviceId: practiceHistoryTable.deviceId,
        result: practiceHistoryTable.result,
        pos: practiceHistoryTable.pos,
        taskType: practiceHistoryTable.taskType,
        hintsUsed: practiceHistoryTable.hintsUsed,
        featureFlags: practiceHistoryTable.featureFlags,
        metadata: practiceHistoryTable.metadata,
      })
      .from(practiceHistoryTable)
      .where(eq(practiceHistoryTable.taskId, task.id));

    expect(historyRows[0]).toBeDefined();
    expect(historyRows[0]!.deviceId).toBe('device-123');
    expect(historyRows[0]!.result).toBe('correct');
    expect(historyRows[0]!.pos).toBe(task.pos);
    expect(historyRows[0]!.taskType).toBe(task.taskType);
    expect(historyRows[0]!.hintsUsed).toBe(false);
    expect(historyRows[0]!.featureFlags).toBeDefined();
    expect(historyRows[0]!.metadata).toMatchObject({
      queueCap: submissionBody.queueCap,
      leitnerBox: submissionBody.leitnerBox,
    });
  });
});
