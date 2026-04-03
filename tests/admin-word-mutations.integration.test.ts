import './helpers/mock-auth';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { eq } from 'drizzle-orm';

import { MANUAL_ADMIN_SOURCE } from '@shared/content-sources';

import { setupTestDatabase, type TestDatabaseContext } from './helpers/pg';
import { createApiInvoker } from './helpers/vercel';

interface KaikkiNounFixture {
  lemma: string;
  english: string;
  exampleDe: string;
  exampleEn: string;
  gender: 'der' | 'die' | 'das';
  plural: string;
}

interface TranslationFixture {
  translation: string;
  confidence?: number;
}

interface ExampleFixture {
  exampleDe: string;
  exampleEn?: string;
}

function textResponse(body: string, status = 200): Response {
  return new Response(body, {
    status,
    headers: {
      'content-type': 'text/plain; charset=utf-8',
    },
  });
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
    },
  });
}

function buildKaikkiNounJsonl({
  lemma,
  english,
  exampleDe,
  exampleEn,
  gender,
  plural,
}: KaikkiNounFixture): string {
  return `${JSON.stringify({
    word: lemma,
    lang: 'German',
    pos: 'noun',
    forms: [
      {
        form: plural,
        tags: ['plural'],
      },
    ],
    head_templates: [
      {
        expansion: `${gender} ${lemma}`,
      },
    ],
    senses: [
      {
        translations: [
          {
            word: english,
            lang: 'English',
            lang_code: 'en',
          },
        ],
        examples: [
          {
            text: exampleDe,
            translation: exampleEn,
          },
        ],
      },
    ],
  })}\n`;
}

function installProviderFetchMock({
  kaikkiByLemma = {},
  translationByLemma = {},
  exampleByLemma = {},
}: {
  kaikkiByLemma?: Record<string, string>;
  translationByLemma?: Record<string, TranslationFixture>;
  exampleByLemma?: Record<string, ExampleFixture>;
}) {
  const originalFetch = globalThis.fetch.bind(globalThis);
  const fetchMock = vi.fn(async (input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
    const url =
      typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;

    if (url.includes('kaikki.org')) {
      const decoded = decodeURIComponent(url);
      const lemma = Object.keys(kaikkiByLemma).find((candidate) =>
        decoded.includes(`/${candidate}.jsonl`),
      );
      if (!lemma) {
        return textResponse('', 404);
      }
      return textResponse(kaikkiByLemma[lemma]);
    }

    if (url.startsWith('https://api.mymemory.translated.net/get')) {
      const lemma = new URL(url).searchParams.get('q') ?? '';
      const match = translationByLemma[lemma];
      if (!match) {
        return jsonResponse({
          responseData: {
            translatedText: lemma,
            match: 0,
          },
          matches: [],
        });
      }
      return jsonResponse({
        responseData: {
          translatedText: match.translation,
          match: (match.confidence ?? 90) / 100,
        },
        matches: [
          {
            translation: match.translation,
            quality: match.confidence ?? 90,
          },
        ],
      });
    }

    if (url.startsWith('https://tatoeba.org/en/api_v0/search')) {
      const lemma = new URL(url).searchParams.get('query') ?? '';
      const match = exampleByLemma[lemma];
      if (!match) {
        return jsonResponse({ results: [] });
      }
      return jsonResponse({
        results: [
          {
            text: match.exampleDe,
            translations: match.exampleEn
              ? [
                  {
                    lang: 'eng',
                    text: match.exampleEn,
                  },
                ]
              : [],
          },
        ],
      });
    }

    return originalFetch(input, init);
  });

  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

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
    vi.unstubAllGlobals();
    vi.doUnmock('groq-sdk');

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

  it('enriches an existing noun through free providers and rebuilds derived content', async () => {
    if (!dbContext) {
      throw new Error('test database not initialised');
    }

    const fetchMock = installProviderFetchMock({
      kaikkiByLemma: {
        Messer: buildKaikkiNounJsonl({
          lemma: 'Messer',
          english: 'knife',
          exampleDe: 'Das Messer liegt auf dem Tisch.',
          exampleEn: 'The knife is lying on the table.',
          gender: 'das',
          plural: 'Messer',
        }),
      },
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
      exampleDe: 'Das Messer liegt auf dem Tisch.',
      exampleEn: 'The knife is lying on the table.',
      gender: 'das',
      plural: 'Messer',
      enrichmentMethod: 'manual_api',
      complete: true,
    });
    expect(fetchMock).toHaveBeenCalled();

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

  it('keeps provider data and ignores invalid Groq fallback fields for verbs', async () => {
    if (!dbContext) {
      throw new Error('test database not initialised');
    }

    vi.stubEnv('GROQ_API_KEY', 'test-groq-key');
    const createCompletionMock = vi.fn().mockResolvedValue({
      choices: [
        {
          message: {
            content: JSON.stringify({
              english: 'to branch off',
              exampleDe: 'Du biegst am Ende der Strasse ab.',
              exampleEn: 'You turn off at the end of the street.',
              gender: 'die',
              plural: 'Abbiegungen',
              comparative: 'abgebogener',
              superlative: 'am abgebogensten',
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

    installProviderFetchMock({
      translationByLemma: {
        abbiegen: {
          translation: 'to turn off',
        },
      },
      exampleByLemma: {
        abbiegen: {
          exampleDe: 'Ich biege an der Kreuzung links ab.',
          exampleEn: 'I turn left at the intersection.',
        },
      },
    });

    const schema = await import('../db/schema.js');
    const [word] = await dbContext.db
      .insert(schema.words)
      .values({
        lemma: 'abbiegen',
        pos: 'V',
        level: 'A2',
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
    expect(createCompletionMock).toHaveBeenCalledTimes(1);
    expect(response.bodyJson).toMatchObject({
      id: word.id,
      lemma: 'abbiegen',
      english: 'to turn off',
      exampleDe: 'Ich biege an der Kreuzung links ab.',
      exampleEn: 'I turn left at the intersection.',
      enrichmentMethod: 'manual_api',
      complete: false,
    });
    expect(response.bodyJson).toMatchObject({
      gender: null,
      plural: null,
      comparative: null,
      superlative: null,
    });

    const refreshed = await dbContext.db.query.words.findFirst({
      where: eq(schema.words.id, word.id),
    });
    expect(refreshed).toMatchObject({
      english: 'to turn off',
      exampleDe: 'Ich biege an der Kreuzung links ab.',
      exampleEn: 'I turn left at the intersection.',
      gender: null,
      plural: null,
      comparative: null,
      superlative: null,
      complete: false,
      enrichmentMethod: 'manual_api',
    });
  });

  it('runs batch enrichment for filtered pending incomplete words without Groq', async () => {
    if (!dbContext) {
      throw new Error('test database not initialised');
    }

    installProviderFetchMock({
      kaikkiByLemma: {
        Filiale: buildKaikkiNounJsonl({
          lemma: 'Filiale',
          english: 'branch office',
          exampleDe: 'Die Filiale schliesst um 18 Uhr.',
          exampleEn: 'The branch office closes at 6 p.m.',
          gender: 'die',
          plural: 'Filialen',
        }),
        Arbeitswelt: buildKaikkiNounJsonl({
          lemma: 'Arbeitswelt',
          english: 'working world',
          exampleDe: 'Die Arbeitswelt veraendert sich schnell.',
          exampleEn: 'The working world is changing quickly.',
          gender: 'die',
          plural: 'Arbeitswelten',
        }),
      },
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
        lemma: 'Arbeitswelt',
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
          fields: expect.arrayContaining([
            'english',
            'exampleDe',
            'exampleEn',
            'gender',
            'plural',
          ]),
        }),
        expect.objectContaining({
          lemma: 'Arbeitswelt',
          updated: true,
          fields: expect.arrayContaining([
            'english',
            'exampleDe',
            'exampleEn',
            'gender',
            'plural',
          ]),
        }),
      ]),
    });

    const filiale = await dbContext.db.query.words.findFirst({
      where: eq(schema.words.lemma, 'Filiale'),
    });
    const arbeitswelt = await dbContext.db.query.words.findFirst({
      where: eq(schema.words.lemma, 'Arbeitswelt'),
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
    expect(arbeitswelt).toMatchObject({
      english: 'working world',
      gender: 'die',
      plural: 'Arbeitswelten',
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
      ['Filiale', 'Arbeitswelt'],
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
      ['Filiale', 'Arbeitswelt'],
    );
    expect(taskRows.rows[0]?.count).toBeGreaterThan(0);
  });
});
