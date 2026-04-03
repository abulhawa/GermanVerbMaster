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
  });

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
});
