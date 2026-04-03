import './helpers/mock-auth';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { eq } from 'drizzle-orm';

import { MANUAL_ADMIN_SOURCE } from '@shared/content-sources';

import { setupTestDatabase, type TestDatabaseContext } from './helpers/pg';
import { createApiInvoker } from './helpers/vercel';

describe('admin word mutations integration', () => {
  let dbContext: TestDatabaseContext | undefined;

  async function createTestInvoker() {
    const { createVercelApiHandler } = await import('../server/api/vercel-handler.js');
    return createApiInvoker(createVercelApiHandler({ enableCors: false }));
  }

  beforeEach(async () => {
    const context = await setupTestDatabase();
    dbContext = context;
    context.mock();
    vi.stubEnv('ADMIN_API_TOKEN', 'secret');
  });

  afterEach(async () => {
    vi.resetModules();
    vi.clearAllMocks();
    vi.unstubAllEnvs();

    if (dbContext) {
      await dbContext.cleanup();
      dbContext = undefined;
    }
  });

  it('creates a manual admin word and rebuilds derived lexeme/task content', async () => {
    if (!dbContext) {
      throw new Error('test database not initialised');
    }

    const invokeApi = await createTestInvoker();
    const response = await invokeApi('/api/words', {
      method: 'POST',
      headers: {
        'x-admin-token': 'secret',
      },
      body: {
        lemma: 'tanzen',
        pos: 'V',
        level: 'A1',
        english: 'to dance',
        exampleDe: 'Wir tanzen heute Abend.',
        exampleEn: 'We are dancing this evening.',
        aux: 'haben',
        praesensIch: 'tanze',
        praesensEr: 'tanzt',
        praeteritum: 'tanzte',
        partizipIi: 'getanzt',
        perfekt: 'hat getanzt',
        approved: true,
      },
    });

    expect(response.status).toBe(201);
    expect(response.bodyJson).toMatchObject({
      lemma: 'tanzen',
      pos: 'V',
      english: 'to dance',
      complete: true,
    });

    const schema = await import('../db/schema.js');
    const createdWord = await dbContext.db.query.words.findFirst({
      where: eq(schema.words.lemma, 'tanzen'),
    });
    expect(createdWord?.sourcesCsv).toBe(MANUAL_ADMIN_SOURCE);

    const lexemeRows = await dbContext.pool.query(
      'select lemma from lexemes where lemma = $1',
      ['tanzen'],
    );
    expect(lexemeRows.rowCount).toBe(1);

    const taskRows = await dbContext.pool.query(
      `
        select count(*)::int as count
        from task_specs
        where lexeme_id in (
          select id from lexemes where lemma = $1
        )
      `,
      ['tanzen'],
    );
    expect(taskRows.rows[0]?.count).toBeGreaterThan(0);
  }, 15000);

  it('enriches an existing word with Groq and rebuilds derived content', async () => {
    if (!dbContext) {
      throw new Error('test database not initialised');
    }

    vi.stubEnv('GROQ_API_KEY', 'test-groq-key');
    const createCompletionMock = vi.fn().mockResolvedValue({
      choices: [
        {
          message: {
            content: JSON.stringify({
              english: 'knife',
              exampleDe: 'Das Messer liegt auf dem Tisch.',
              exampleEn: 'The knife is lying on the table.',
              gender: 'das',
              plural: 'Messer',
            }),
          },
        },
      ],
    });

    vi.doMock('groq-sdk', () => {
      class GroqMock {
        chat = {
          completions: {
            create: createCompletionMock,
          },
        };
      }

      return { default: GroqMock };
    });

    const schema = await import('../db/schema.js');
    const [word] = await dbContext.db
      .insert(schema.words)
      .values({
        lemma: 'Messer',
        pos: 'N',
        level: 'A1',
        approved: false,
        complete: false,
        sourcesCsv: MANUAL_ADMIN_SOURCE,
        sourceNotes: 'Created via integration test',
      })
      .returning();

    const invokeApi = await createTestInvoker();
    const response = await invokeApi(`/api/words/${word.id}/enrich`, {
      method: 'POST',
      headers: {
        'x-admin-token': 'secret',
      },
      body: {},
    });

    expect(response.status).toBe(200);
    expect(response.bodyJson).toMatchObject({
      id: word.id,
      lemma: 'Messer',
      english: 'knife',
      gender: 'das',
      plural: 'Messer',
      enrichmentMethod: 'manual_api',
    });
    expect(createCompletionMock).toHaveBeenCalledTimes(1);

    const lexemeRows = await dbContext.pool.query(
      'select lemma from lexemes where lemma = $1',
      ['Messer'],
    );
    expect(lexemeRows.rowCount).toBe(1);

    const taskRows = await dbContext.pool.query(
      `
        select count(*)::int as count
        from task_specs
        where lexeme_id in (
          select id from lexemes where lemma = $1
        )
      `,
      ['Messer'],
    );
    expect(taskRows.rows[0]?.count).toBeGreaterThan(0);
  });

  it('runs batch enrichment for filtered pending incomplete words', async () => {
    if (!dbContext) {
      throw new Error('test database not initialised');
    }

    vi.stubEnv('GROQ_API_KEY', 'test-groq-key');
    const createCompletionMock = vi
      .fn()
      .mockResolvedValueOnce({
        choices: [
          {
            message: {
              content: JSON.stringify({
                english: 'branch office',
                exampleDe: 'Die Filiale schließt um 18 Uhr.',
                exampleEn: 'The branch office closes at 6 p.m.',
                gender: 'die',
                plural: 'Filialen',
              }),
            },
          },
        ],
      })
      .mockResolvedValueOnce({
        choices: [
          {
            message: {
              content: JSON.stringify({
                english: 'founding date',
                exampleDe: 'Das Gründungsdatum steht im Register.',
                exampleEn: 'The founding date is listed in the register.',
                gender: 'das',
                plural: 'Gründungsdaten',
              }),
            },
          },
        ],
      });

    vi.doMock('groq-sdk', () => {
      class GroqMock {
        chat = {
          completions: {
            create: createCompletionMock,
          },
        };
      }

      return { default: GroqMock };
    });

    const schema = await import('../db/schema.js');
    await dbContext.db.insert(schema.words).values([
      {
        lemma: 'Filiale',
        pos: 'N',
        level: 'B2',
        approved: false,
        complete: false,
        sourcesCsv: MANUAL_ADMIN_SOURCE,
        sourceNotes: 'Created via integration test',
      },
      {
        lemma: 'Gründungsdatum',
        pos: 'N',
        level: 'B2',
        approved: false,
        complete: false,
        sourcesCsv: MANUAL_ADMIN_SOURCE,
        sourceNotes: 'Created via integration test',
      },
      {
        lemma: 'Arbeitsmarkt',
        pos: 'N',
        level: 'B1',
        approved: false,
        complete: false,
        sourcesCsv: MANUAL_ADMIN_SOURCE,
        sourceNotes: 'Filtered out by level',
      },
    ]);

    const invokeApi = await createTestInvoker();
    const response = await invokeApi('/api/admin/enrichment/run', {
      method: 'POST',
      headers: {
        'x-admin-token': 'secret',
      },
      body: {
        limit: 10,
        mode: 'pending',
        onlyIncomplete: true,
        pos: 'N',
        level: 'B2',
      },
    });

    expect(response.status).toBe(200);
    expect(response.bodyJson).toMatchObject({
      scanned: 2,
      updated: 2,
      words: expect.arrayContaining([
        expect.objectContaining({
          lemma: 'Filiale',
          updated: true,
          fields: expect.arrayContaining(['english', 'exampleDe', 'exampleEn', 'gender', 'plural']),
        }),
        expect.objectContaining({
          lemma: 'Gründungsdatum',
          updated: true,
          fields: expect.arrayContaining(['english', 'exampleDe', 'exampleEn', 'gender', 'plural']),
        }),
      ]),
    });
    expect(createCompletionMock).toHaveBeenCalledTimes(2);

    const filiale = await dbContext.db.query.words.findFirst({
      where: eq(schema.words.lemma, 'Filiale'),
    });
    const gruendungsdatum = await dbContext.db.query.words.findFirst({
      where: eq(schema.words.lemma, 'Gründungsdatum'),
    });
    const arbeitsmarkt = await dbContext.db.query.words.findFirst({
      where: eq(schema.words.lemma, 'Arbeitsmarkt'),
    });

    expect(filiale).toMatchObject({
      english: 'branch office',
      gender: 'die',
      plural: 'Filialen',
      complete: true,
      enrichmentMethod: 'manual_api',
    });
    expect(gruendungsdatum).toMatchObject({
      english: 'founding date',
      gender: 'das',
      plural: 'Gründungsdaten',
      complete: true,
      enrichmentMethod: 'manual_api',
    });
    expect(arbeitsmarkt).toMatchObject({
      english: null,
      gender: null,
      plural: null,
      complete: false,
    });

    const lexemeRows = await dbContext.pool.query(
      'select count(*)::int as count from lexemes where lemma in ($1, $2)',
      ['Filiale', 'Gründungsdatum'],
    );
    expect(lexemeRows.rows[0]?.count).toBe(2);

    const taskRows = await dbContext.pool.query(
      `
        select count(*)::int as count
        from task_specs
        where lexeme_id in (
          select id from lexemes where lemma in ($1, $2)
        )
      `,
      ['Filiale', 'Gründungsdatum'],
    );
    expect(taskRows.rows[0]?.count).toBeGreaterThan(0);
  });
});
