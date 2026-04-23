import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ANDROID_B2_BERUF_SOURCE, ANDROID_B2_BERUF_VERSION } from '@shared/content-sources';

import { setupTestDatabase, type TestDatabaseContext } from './helpers/pg';
import { createApiInvoker } from './helpers/vercel';

describe('wortschatz API', () => {
  let dbContext: TestDatabaseContext | undefined;
  let invokeApi: ReturnType<typeof createApiInvoker>;

  beforeEach(async () => {
    const context = await setupTestDatabase();
    dbContext = context;
    context.mock();

    const schema = await import('../db/schema.js');
    await context.db.insert(schema.words).values([
      {
        lemma: 'Projekt',
        pos: 'N',
        level: 'B2',
        english: 'project',
        exampleDe: 'Das Projekt braucht einen klaren Zeitplan.',
        exampleEn: 'The project needs a clear timeline.',
        gender: 'das',
        plural: 'Projekte',
        approved: true,
        complete: true,
        sourcesCsv: ANDROID_B2_BERUF_SOURCE,
        sourceNotes: ANDROID_B2_BERUF_VERSION,
      },
      {
        lemma: 'bewerben',
        pos: 'V',
        level: 'B2',
        english: 'to apply',
        exampleDe: 'Sie bewirbt sich auf die Stelle.',
        exampleEn: 'She is applying for the position.',
        approved: true,
        complete: true,
        sourcesCsv: `manual;${ANDROID_B2_BERUF_SOURCE}`,
        sourceNotes: ANDROID_B2_BERUF_VERSION,
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
        approved: true,
        complete: true,
        sourcesCsv: 'manual',
        sourceNotes: 'manual',
      },
    ]);

    const { createVercelApiHandler } = await import('../server/api/vercel-handler.js');
    invokeApi = createApiInvoker(createVercelApiHandler({ enableCors: false }));
  });

  afterEach(async () => {
    vi.resetModules();
    vi.clearAllMocks();

    if (dbContext) {
      await dbContext.cleanup();
      dbContext = undefined;
    }
  });

  it('returns only source-tagged words in the public response shape', async () => {
    const response = await invokeApi('/api/wortschatz/words');

    expect(response.status).toBe(200);
    expect(response.headers.get('x-wortschatz-dataset-version')).toBe(ANDROID_B2_BERUF_VERSION);

    const body = response.bodyJson as Array<Record<string, unknown>>;
    expect(body).toEqual([
      {
        id: expect.any(Number),
        lemma: 'bewerben',
        pos: 'V',
        level: 'B2',
        english: 'to apply',
        exampleDe: 'Sie bewirbt sich auf die Stelle.',
        exampleEn: 'She is applying for the position.',
        gender: null,
        plural: null,
      },
      {
        id: expect.any(Number),
        lemma: 'Projekt',
        pos: 'N',
        level: 'B2',
        english: 'project',
        exampleDe: 'Das Projekt braucht einen klaren Zeitplan.',
        exampleEn: 'The project needs a clear timeline.',
        gender: 'das',
        plural: 'Projekte',
      },
    ]);

    expect(body).toHaveLength(2);
    expect(body[0]).not.toHaveProperty('sourcesCsv');
    expect(body[0]).not.toHaveProperty('sourceNotes');
  });
});
