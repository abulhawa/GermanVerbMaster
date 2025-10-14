import { eq } from 'drizzle-orm';
import './helpers/mock-auth';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { AggregatedWord } from '../scripts/etl/types';
import { buildGoldenBundles, upsertGoldenBundles } from '../scripts/etl/golden';
import { setupTestDatabase, type TestDatabaseContext } from './helpers/pg';
import { createApiInvoker } from './helpers/vercel';
import { seedLexemeInventoryForWords } from './helpers/task-fixtures';

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

describe('feature flags', () => {
  let invokeApi: ReturnType<typeof createApiInvoker>;
  let drizzleDb: typeof import('@db').db;
  let taskSpecsTable: typeof import('../db/schema.js').taskSpecs;
  let dbContext: TestDatabaseContext | undefined;

  async function bootstrapServer() {
    const schemaModule = await import('../db/schema.js');
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
        approved: true,
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
        approved: true,
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
        approved: true,
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

    await seedLexemeInventoryForWords(drizzleDb, sampleWords);
    const bundles = buildGoldenBundles(sampleWords);
    await upsertGoldenBundles(drizzleDb, bundles);

    const { createVercelApiHandler } = await import('../server/api/vercel-handler.js');
    const handler = createVercelApiHandler({ enableCors: false });
    invokeApi = createApiInvoker(handler);
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
    delete process.env.ENABLE_NOUNS_BETA;
    delete process.env.ENABLE_ADJECTIVES_BETA;
    if (dbContext) {
      await dbContext.cleanup();
      dbContext = undefined;
    }
  });

  it('filters disabled POS from the task feed', async () => {
    const response = await invokeApi('/api/tasks');

    expect(response.status).toBe(200);

    const flagHeader = response.headers.get('x-feature-flags') ?? '';
    expect(flagHeader).toMatch(/pos:noun=0/);
    expect(flagHeader).toMatch(/pos:adjective=0/);

    const body = response.bodyJson as { tasks?: Array<{ pos: string }> };
    expect(body?.tasks?.length ?? 0).toBeGreaterThan(0);
    expect(body?.tasks?.every((task) => task.pos === 'verb')).toBe(true);
  });

  it('rejects noun-only requests when the noun flag is disabled', async () => {
    const response = await invokeApi('/api/tasks?pos=noun');

    expect(response.status).toBe(403);
    expect(response.bodyJson && (response.bodyJson as any).code).toBe('POS_FEATURE_DISABLED');
    expect((response.headers.get('x-feature-flags') ?? '')).toMatch(/pos:noun=0/);
  });

  it('enables nouns when the beta flag is set', async () => {
    process.env.ENABLE_NOUNS_BETA = 'true';
    await bootstrapServer();

    const nounTasks = await invokeApi('/api/tasks?pos=noun');

    expect(nounTasks.status).toBe(200);
    expect(nounTasks.headers.get('x-feature-flags') ?? '').toMatch(/pos:noun=1/);

    const nounBody = nounTasks.bodyJson as { tasks?: Array<{ pos: string }> };
    expect(nounBody?.tasks?.length ?? 0).toBeGreaterThan(0);
    expect(nounBody?.tasks?.every((task) => task.pos === 'noun')).toBe(true);
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

    const submissionResponse = await invokeApi('/api/submission', {
      method: 'POST',
      body: {
        taskId: adjectiveTask[0]!.id,
        lexemeId: adjectiveTask[0]!.lexemeId,
        taskType: adjectiveTask[0]!.taskType,
        pos: 'adjective',
        renderer: adjectiveTask[0]!.renderer,
        deviceId: 'device-456',
        result: 'correct',
        timeSpentMs: 1500,
      },
    });

    expect(submissionResponse.status).toBe(403);
  });

  it('exposes a feature flag snapshot endpoint', async () => {
    const response = await invokeApi('/api/feature-flags');

    expect(response.status).toBe(200);
    expect(response.headers.get('x-feature-flags')).toBeTruthy();

    const body = response.bodyJson as any;
    expect(body.pos).toMatchObject({
      verb: expect.objectContaining({ enabled: true }),
      noun: expect.objectContaining({ enabled: false, stage: 'beta' }),
      adjective: expect.objectContaining({ enabled: false, stage: 'beta' }),
    });
    expect(typeof body.fetchedAt).toBe('string');
  });
});
