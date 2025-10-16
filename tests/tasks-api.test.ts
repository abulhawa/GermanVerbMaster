import './helpers/mock-auth';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { AggregatedWord } from '../scripts/etl/types';
import { setupTestDatabase, type TestDatabaseContext } from './helpers/pg';
import { createApiInvoker } from './helpers/vercel';

describe('tasks API', () => {
  let buildGoldenBundles: typeof import('../scripts/etl/golden').buildGoldenBundles;
  let upsertGoldenBundles: typeof import('../scripts/etl/golden').upsertGoldenBundles;
  let seedLexemeInventoryForWords: typeof import('./helpers/task-fixtures').seedLexemeInventoryForWords;
  let invokeApi: ReturnType<typeof createApiInvoker>;
  let createVercelApiHandler: typeof import('../server/api/vercel-handler.js').createVercelApiHandler;
  let practiceHistoryTable: typeof import('../db/schema.js').practiceHistory;
  let drizzleDb: typeof import('@db').db;
  let dbContext: TestDatabaseContext | undefined;
  beforeEach(async () => {
    const context = await setupTestDatabase();
    dbContext = context;
    context.mock();

    const schemaModule = await import('../db/schema.js');
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
        approved: true,
        complete: true,
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
      approved: true,
      complete: true,
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
      approved: true,
      complete: true,
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
      approved: true,
      complete: true,
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
    expect(submissionBody.taskId).toBe(task.taskId);
    expect(submissionBody.deviceId).toBe('device-123');
    expect(submissionBody.queueCap).toBeGreaterThan(0);

    const historyResult = await dbContext.pool.query(
      'select task_id, device_id, result, pos, task_type, hints_used, metadata from practice_history where task_id = $1',
      [task.taskId],
    );

    expect(historyResult.rows[0]).toBeDefined();
    expect(historyResult.rows[0]!.device_id).toBe('device-123');
    expect(historyResult.rows[0]!.result).toBe('correct');
    expect(historyResult.rows[0]!.pos).toBe(task.pos);
    expect(historyResult.rows[0]!.task_type).toBe(task.taskType);
    expect(historyResult.rows[0]!.hints_used).toBe(false);
    expect(historyResult.rows[0]!.metadata).toMatchObject({
      queueCap: submissionBody.queueCap,
    });
  });
});
