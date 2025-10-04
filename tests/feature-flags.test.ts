import express from 'express';
import request from 'supertest';
import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { AggregatedWord } from '../scripts/etl/golden';
import { buildGoldenBundles, upsertGoldenBundles } from '../scripts/etl/golden';
import { setupTestDatabase, type TestDatabaseContext } from './helpers/pg';

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

describe('feature flags', () => {
  let server: import('http').Server | undefined;
  let agent: request.SuperTest<request.Test>;
  let drizzleDb: typeof import('@db').db;
  let taskSpecsTable: typeof import('../db/schema').taskSpecs;
  let dbContext: TestDatabaseContext | undefined;

  async function bootstrapServer() {
    const schemaModule = await import('../db/schema');
    taskSpecsTable = schemaModule.taskSpecs;
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

    const { registerRoutes } = await import('../server/routes');
    const app = express();
    app.use(express.json());
    server = registerRoutes(app);
    agent = request(app);
  }

  beforeEach(async () => {
    delete process.env.ENABLE_NOUNS_BETA;
    delete process.env.ENABLE_ADJECTIVES_BETA;
    const context = await setupTestDatabase();
    dbContext = context;
    context.mock();
    await bootstrapServer();
  });

  afterEach(async () => {
    server?.close();
    server = undefined;
    delete process.env.ENABLE_NOUNS_BETA;
    delete process.env.ENABLE_ADJECTIVES_BETA;
    if (dbContext) {
      await dbContext.cleanup();
      dbContext = undefined;
    }
  });

  it('filters disabled POS from the task feed', async () => {
    const response = await agent.get('/api/tasks').expect(200);
    expect(response.headers['x-feature-flags']).toMatch(/pos:noun=0/);
    expect(response.headers['x-feature-flags']).toMatch(/pos:adjective=0/);
    expect(response.body.tasks.length).toBeGreaterThan(0);
    expect(response.body.tasks.every((task: any) => task.pos === 'verb')).toBe(true);
  });

  it('rejects noun-only requests when the noun flag is disabled', async () => {
    const response = await agent.get('/api/tasks?pos=noun').expect(403);
    expect(response.body.code).toBe('POS_FEATURE_DISABLED');
    expect(response.headers['x-feature-flags']).toMatch(/pos:noun=0/);
  });

  it('enables nouns when the beta flag is set', async () => {
    server?.close();
    server = undefined;
    process.env.ENABLE_NOUNS_BETA = 'true';
    await bootstrapServer();

    const nounTasks = await agent.get('/api/tasks?pos=noun').expect(200);
    expect(nounTasks.headers['x-feature-flags']).toMatch(/pos:noun=1/);
    expect(nounTasks.body.tasks.length).toBeGreaterThan(0);
    expect(nounTasks.body.tasks.every((task: any) => task.pos === 'noun')).toBe(true);
  });

  it('blocks adjective submissions when the flag is disabled', async () => {
    const adjectiveTask = await drizzleDb
      .select({
        id: taskSpecsTable.id,
        lexemeId: taskSpecsTable.lexemeId,
        taskType: taskSpecsTable.taskType,
        renderer: taskSpecsTable.renderer,
      })
      .from(taskSpecsTable)
      .where(eq(taskSpecsTable.pos, 'adjective'))
      .limit(1);

    expect(adjectiveTask[0]).toBeDefined();

    await agent
      .post('/api/submission')
      .send({
        taskId: adjectiveTask[0]!.id,
        lexemeId: adjectiveTask[0]!.lexemeId,
        taskType: adjectiveTask[0]!.taskType,
        pos: 'adjective',
        renderer: adjectiveTask[0]!.renderer,
        deviceId: 'device-456',
        result: 'correct',
        timeSpentMs: 1500,
      })
      .expect(403);
  });

  it('exposes a feature flag snapshot endpoint', async () => {
    const response = await agent.get('/api/feature-flags').expect(200);
    expect(response.headers['x-feature-flags']).toBeDefined();
    expect(response.body.pos).toMatchObject({
      verb: expect.objectContaining({ enabled: true }),
      noun: expect.objectContaining({ enabled: false, stage: 'beta' }),
      adjective: expect.objectContaining({ enabled: false, stage: 'beta' }),
    });
    expect(typeof response.body.fetchedAt).toBe('string');
  });
});
