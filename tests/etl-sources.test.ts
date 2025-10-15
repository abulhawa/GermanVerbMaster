import { describe, expect, it } from 'vitest';

import { primarySourceId, collectSources, deriveSourceRevision } from '../scripts/etl/sources';
import type { AggregatedWord } from '../scripts/etl/types';

const baseWord: AggregatedWord = {
  lemma: 'gehen',
  pos: 'V',
  level: 'A1',
  english: 'to go',
  exampleDe: 'Ich gehe nach Hause.',
  exampleEn: 'I go home.',
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
  translations: null,
  examples: null,
  posAttributes: null,
  enrichmentAppliedAt: null,
  enrichmentMethod: null,
};

describe('sources', () => {
  it('derives per-POS primary source identifiers', () => {
    expect(primarySourceId(baseWord)).toBe('pos_jsonl:verbs');
  });

  it('collects enrichment sources when present', () => {
    const enrichedWord: AggregatedWord = {
      ...baseWord,
      enrichmentMethod: 'manual_entry',
    };

    expect(collectSources(enrichedWord)).toEqual([
      'pos_jsonl:verbs',
      'enrichment:manual_entry',
    ]);
  });

  it('prefixes source revisions with the primary source identifier', () => {
    const revision = deriveSourceRevision(baseWord);
    expect(revision.startsWith('pos_jsonl:verbs:')).toBe(true);
  });
});
