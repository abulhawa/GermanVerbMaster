import express from 'express';
import request from 'supertest';
import { eq } from 'drizzle-orm';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type * as schema from '../db/schema';

import type { AggregatedWord } from '../scripts/etl/golden';
import { buildGoldenBundles, upsertGoldenBundles } from '../scripts/etl/golden';

vi.mock('../server/srs', () => ({
  srsEngine: {
    startQueueRegenerator: vi.fn(() => ({ stop: vi.fn() })),
    recordPracticeAttempt: vi.fn(),
    fetchQueueForDevice: vi.fn(),
    generateQueueForDevice: vi.fn(),
    isEnabled: vi.fn(() => false),
    isQueueStale: vi.fn(() => false),
  },
}));

describe('tasks API', () => {
  let server: import('http').Server;
  let agent: request.SuperTest<request.Test>;
  let schedulingStateTable: typeof import('../db/schema').schedulingState;
  let telemetryTable: typeof import('../db/schema').telemetryPriorities;
  let drizzleDb: typeof import('../db/index').db;

  beforeEach(async () => {
    process.env.DATABASE_FILE = ':memory:';
    vi.resetModules();

    const schemaModule = await import('../db/schema');
    schedulingStateTable = schemaModule.schedulingState;
    telemetryTable = schemaModule.telemetryPriorities;
    const dbModule = await import('../db/index');
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
    await upsertGoldenBundles(
      drizzleDb as unknown as BetterSQLite3Database<typeof schema>,
      bundles,
    );

    const { registerRoutes } = await import('../server/routes');
    const app = express();
    app.use(express.json());
    server = registerRoutes(app);
    agent = request(app);
  });

  afterEach(() => {
    server.close();
    delete process.env.DATABASE_FILE;
  });

  it('returns seeded tasks with metadata', async () => {
    const response = await agent.get('/api/tasks').expect(200);
    expect(Array.isArray(response.body.tasks)).toBe(true);
    expect(response.body.tasks.length).toBeGreaterThan(0);

    const verbTasks = await agent.get('/api/tasks?pos=verb').expect(200);
    expect(verbTasks.body.tasks.every((task: any) => task.pos === 'verb')).toBe(true);
  });

  it('records submissions and updates scheduling state', async () => {
    const taskResponse = await agent.get('/api/tasks?pos=verb&limit=1').expect(200);
    const task = taskResponse.body.tasks[0];
    expect(task).toBeDefined();

    const submission = await agent
      .post('/api/submission')
      .send({
        taskId: task.id,
        deviceId: 'device-123',
        result: 'correct',
        responseMs: 1500,
      })
      .expect(200);

    expect(submission.body.status).toBe('recorded');
    expect(submission.body.leitnerBox).toBeGreaterThanOrEqual(1);
    expect(submission.body.queueCap).toBeGreaterThan(0);
    expect(submission.body.coverageScore).toBeGreaterThanOrEqual(0);

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
    expect(telemetryRows[0]?.priorityScore).toBeCloseTo(submission.body.priorityScore, 5);
    expect(telemetryRows[0]?.metadata).toMatchObject({
      posAssignments: 1,
      queueCap: submission.body.queueCap,
    });
  });
});
