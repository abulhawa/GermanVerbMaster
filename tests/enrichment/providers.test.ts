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
    expect(result?.translations.map((entry) => entry.value)).toEqual(['turn', 'turn off']);
    expect(result?.translations.map((entry) => entry.language)).toEqual(['English', 'English']);
    expect(result?.englishHints).toEqual(['to turn']);
    expect(result?.examples).toEqual([
      { exampleDe: 'Biegen Sie links ab.', exampleEn: 'Turn left.' },
    ]);
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
    expect(result?.translations.map((entry) => entry.value)).toEqual(
      expect.arrayContaining(['to turn', 'abbiegen']),
    );
    expect(result?.pivotUsed).toBe(true);
  });

  it('extracts noun genders and plural forms when requested for nouns', async () => {
    const germanEntry = {
      lang: 'German',
      pos: 'noun',
      word: 'Apfel',
      head_templates: [{ expansion: 'der Apfel' }],
      forms: [
        { form: 'Äpfel', tags: ['plural', 'nominative'] },
        { form: 'des Apfels', tags: ['genitive', 'singular'] },
      ],
      senses: [
        {
          translations: [{ word: 'apple', lang: 'English' }],
        },
      ],
    };

    mockedFetch.mockResolvedValueOnce(createResponse(`${JSON.stringify(germanEntry)}\n`));

    const result = await lookupWiktextract('Apfel', 'N');

    expect(result?.nounForms?.genders).toEqual(['der']);
    expect(result?.nounForms?.plurals).toEqual(['Äpfel']);
    expect(result?.nounForms?.forms).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ form: 'Äpfel', tags: expect.arrayContaining(['plural', 'nominative']) }),
      ]),
    );
  });

  it('extracts comparative and superlative forms for adjectives', async () => {
    const germanEntry = {
      lang: 'German',
      pos: 'adjective',
      word: 'schnell',
      forms: [
        { form: 'schneller', tags: ['comparative'] },
        { form: 'am schnellsten', tags: ['superlative'] },
      ],
    };

    mockedFetch.mockResolvedValueOnce(createResponse(`${JSON.stringify(germanEntry)}\n`));

    const result = await lookupWiktextract('schnell', 'Adj');

    expect(result?.adjectiveForms?.comparatives).toEqual(['schneller']);
    expect(result?.adjectiveForms?.superlatives).toEqual(['am schnellsten']);
    expect(result?.adjectiveForms?.forms).toEqual(
      expect.arrayContaining([expect.objectContaining({ form: 'am schnellsten' })]),
    );
  });

  it('extracts governed cases and notes for prepositions', async () => {
    const germanEntry = {
      lang: 'German',
      pos: 'prep',
      word: 'auf',
      categories: ['German two-way prepositions'],
      senses: [
        {
          glosses: ['(with accusative) onto; on'],
          tags: ['directional'],
        },
      ],
    };

    mockedFetch.mockResolvedValueOnce(createResponse(`${JSON.stringify(germanEntry)}\n`));

    const result = await lookupWiktextract('auf', 'Präp');

    expect(result?.prepositionAttributes?.cases).toEqual(['Akkusativ', 'Dativ']);
    expect(result?.prepositionAttributes?.notes).toEqual(['directional']);
    expect(result?.posLabel).toBe('prep');
    expect(result?.posTags).toEqual(expect.arrayContaining(['directional']));
    expect(result?.posNotes).toEqual(expect.arrayContaining(['two-way prepositions']));
  });

  it('collects POS tags and usage notes for verbs when available', async () => {
    const germanEntry = {
      lang: 'German',
      pos: 'verb',
      word: 'abholen',
      senses: [
        {
          glosses: ['to pick up'],
          tags: ['transitive', 'separable'],
          categories: ['German separable verbs'],
          translations: [{ word: 'pick up', lang: 'English' }],
        },
      ],
    };

    mockedFetch.mockResolvedValueOnce(createResponse(`${JSON.stringify(germanEntry)}\n`));

    const result = await lookupWiktextract('abholen', 'V');

    expect(result?.posLabel).toBe('verb');
    expect(result?.posTags).toEqual(expect.arrayContaining(['transitive', 'separable']));
    expect(result?.posNotes).toEqual(expect.arrayContaining(['separable verbs']));
  });
});
