import { describe, expect, it, vi } from 'vitest';

import type { Word } from '@db';

import {
  closePoolSafely,
  needsEnrichment,
  runEnrichmentBatch,
  sanitizeEnrichmentUpdates,
  selectTargets,
} from '../../scripts/enrich-pos-jsonl';

function buildWord(overrides: Partial<Word> = {}): Word {
  return {
    id: 1,
    lemma: 'Vereinbarung',
    pos: 'N',
    level: 'B2',
    english: 'agreement',
    exampleDe: 'Die Vereinbarung gilt sofort.',
    exampleEn: 'The agreement applies immediately.',
    gender: 'die',
    plural: 'Vereinbarungen',
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
    sourcesCsv: null,
    sourceNotes: null,
    exportUid: '00000000-0000-0000-0000-000000000000',
    exportedAt: null,
    translations: null,
    examples: null,
    posAttributes: null,
    enrichmentAppliedAt: null,
    enrichmentMethod: null,
    createdAt: new Date('2024-01-01T00:00:00.000Z'),
    updatedAt: new Date('2024-01-01T00:00:00.000Z'),
    ...overrides,
  };
}

describe('enrich-pos-jsonl script helpers', () => {
  it('detects words that still need enrichment', () => {
    expect(needsEnrichment(buildWord({ exampleEn: null }))).toBe(true);
    expect(needsEnrichment(buildWord({ pos: 'Adj', comparative: null, superlative: null }))).toBe(true);
    expect(
      needsEnrichment(
        buildWord({
          pos: 'V',
          aux: 'haben',
          praeteritum: 'bewertete',
          partizipIi: 'bewertet',
          perfekt: 'hat bewertet',
          praesensIch: null,
          praesensEr: null,
        }),
      ),
    ).toBe(false);
    expect(needsEnrichment(buildWord())).toBe(false);
  });

  it('selects only missing rows unless overwrite is enabled', () => {
    const complete = buildWord({ id: 1 });
    const incomplete = buildWord({ id: 2, exampleEn: null });

    expect(
      selectTargets([complete, incomplete], {
        pos: ['N'],
        level: 'B2',
        limit: 10,
        overwrite: false,
        approvedOnly: true,
      }).map((word) => word.id),
    ).toEqual([2]);

    expect(
      selectTargets([complete, incomplete], {
        pos: ['N'],
        level: 'B2',
        limit: 10,
        overwrite: true,
        approvedOnly: true,
      }).map((word) => word.id),
    ).toEqual([1, 2]);
  });

  it('drops Groq fields that do not belong to the word part of speech', () => {
    expect(
      sanitizeEnrichmentUpdates(buildWord({ pos: 'V' }), {
        english: 'to adapt',
        exampleDe: 'Wir passen uns schnell an.',
        exampleEn: 'We adapt quickly.',
        gender: 'die',
        plural: 'Anpassungen',
        praeteritum: 'passte an',
        partizipIi: 'angepasst',
      }),
    ).toEqual({
      english: 'to adapt',
      exampleDe: 'Wir passen uns schnell an.',
      exampleEn: 'We adapt quickly.',
      praeteritum: 'passte an',
      partizipIi: 'angepasst',
    });
  });

  it('rebuilds derived content once and exports touched pos after updating a batch', async () => {
    vi.stubEnv('GROQ_API_KEY', 'test-groq-key');

    const listWords = vi.fn().mockResolvedValue([
      buildWord({ id: 1, pos: 'N', exampleEn: null }),
      buildWord({ id: 2, pos: 'Adj', comparative: null, superlative: null }),
      buildWord({ id: 3, pos: 'N' }),
    ]);
    const buildEnrichment = vi
      .fn()
      .mockResolvedValueOnce({ exampleEn: 'The agreement applies immediately.' })
      .mockResolvedValueOnce({
        comparative: 'nachvollziehbarer',
        superlative: 'am nachvollziehbarsten',
        gender: 'die',
      });
    const updateWordById = vi.fn().mockResolvedValue({});
    const exportPos = vi.fn().mockResolvedValue({ count: 1, file: 'x' });
    const seedDatabase = vi.fn().mockResolvedValue(undefined);
    const rebuildTaskSpecs = vi.fn().mockResolvedValue(undefined);

    const summary = await runEnrichmentBatch(
      'C:\\Projects\\GermanVerbMaster',
      {
        pos: ['N', 'Adj'],
        level: 'B2',
        limit: 2,
        overwrite: false,
        approvedOnly: true,
      },
      {
        applyMigrations: vi.fn().mockResolvedValue(undefined),
        seedDatabase,
        listWords,
        buildGroqWordEnrichment: buildEnrichment,
        updateWordById,
        exportPos,
        rebuildTaskSpecs,
      },
    );

    expect(summary).toEqual({
      selected: 2,
      updated: 2,
      exportedPos: ['N', 'Adj'],
    });
    expect(updateWordById).toHaveBeenNthCalledWith(
      1,
      1,
      { exampleEn: 'The agreement applies immediately.' },
      { rebuildDerivedContent: false },
    );
    expect(updateWordById).toHaveBeenNthCalledWith(
      2,
      2,
      {
        comparative: 'nachvollziehbarer',
        superlative: 'am nachvollziehbarsten',
      },
      { rebuildDerivedContent: false },
    );
    expect(seedDatabase).toHaveBeenCalledTimes(2);
    expect(exportPos).toHaveBeenCalledTimes(2);
    expect(rebuildTaskSpecs).toHaveBeenCalledTimes(1);
  });

  it('ignores pools that were already closed by a nested rebuild command', async () => {
    await expect(
      closePoolSafely({
        end: vi.fn().mockRejectedValue(new Error('Called end on pool more than once')),
      }),
    ).resolves.toBeUndefined();
  });
});
