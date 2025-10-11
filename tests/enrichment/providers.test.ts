import fetch, { type Response } from 'node-fetch';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { lookupWiktextract } from '../../scripts/enrichment/providers';

vi.mock('node-fetch', () => ({
  default: vi.fn(),
}));

const mockedFetch = fetch as unknown as ReturnType<typeof vi.fn>;

function createResponse(body: string, status = 200) {
  return {
    status,
    ok: status >= 200 && status < 300,
    text: async () => body,
  } as Response;
}

describe('lookupWiktextract', () => {
  beforeEach(() => {
    mockedFetch.mockReset();
  });

  it('parses verb forms, translations, and examples from Kaikki JSON lines', async () => {
    const germanEntry = {
      lang: 'German',
      pos: 'verb',
      word: 'abbiegen',
      forms: [
        { form: 'bog ab', tags: ['past'] },
        { form: 'abgebogen', tags: ['participle', 'past'] },
        { form: 'hat abgebogen', tags: ['indicative', 'perfect', 'singular', 'third-person'] },
        { form: 'ist abgebogen', tags: ['indicative', 'perfect', 'singular', 'third-person'] },
        { form: 'haben', tags: ['auxiliary'] },
        { form: 'sein', tags: ['auxiliary'] },
      ],
      senses: [
        {
          glosses: ['to turn'],
          translations: [
            { word: 'turn', lang: 'English' },
            { word: 'turn off', lang: 'English' },
          ],
          examples: [
            { text: 'Biegen Sie links ab.', translation: 'Turn left.' },
          ],
          synonyms: [{ word: 'abbiegen' }],
        },
      ],
    };

    mockedFetch.mockResolvedValueOnce(createResponse(`${JSON.stringify(germanEntry)}\n`));

    const result = await lookupWiktextract('abbiegen');

    expect(result).not.toBeNull();
    expect(result?.translations).toEqual(['turn', 'turn off']);
    expect(result?.englishHints).toEqual(['to turn']);
    expect(result?.example).toEqual({ exampleDe: 'Biegen Sie links ab.', exampleEn: 'Turn left.' });
    expect(result?.synonyms).toEqual(['abbiegen']);
    expect(result?.verbForms?.praeteritum).toBe('bog ab');
    expect(result?.verbForms?.partizipIi).toBe('abgebogen');
    expect(result?.verbForms?.perfektOptions).toEqual(['hat abgebogen', 'ist abgebogen']);
    expect(result?.verbForms?.auxiliaries).toEqual(expect.arrayContaining(['haben', 'sein']));
  });

  it('falls back to glosses and pivot translations when the German entry lacks direct translations', async () => {
    const germanEntry = {
      lang: 'German',
      pos: 'verb',
      word: 'abbiegen',
      senses: [
        {
          glosses: ['to turn'],
        },
      ],
    };
    const englishEntry = {
      lang: 'English',
      pos: 'verb',
      word: 'turn',
      senses: [
        {
          translations: [{ word: 'abbiegen', lang: 'German' }],
        },
      ],
    };

    mockedFetch
      .mockResolvedValueOnce(createResponse(`${JSON.stringify(germanEntry)}\n`))
      .mockResolvedValueOnce(createResponse(`${JSON.stringify(englishEntry)}\n`));

    const result = await lookupWiktextract('abbiegen');

    expect(result).not.toBeNull();
    expect(result?.translations).toEqual(expect.arrayContaining(['to turn', 'abbiegen']));
    expect(result?.pivotUsed).toBe(true);
  });
});
