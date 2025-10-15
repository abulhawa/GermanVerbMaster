import { describe, expect, it } from 'vitest';

import { buildLexemeInventory } from '../scripts/etl/golden';
import { validateWord } from '../scripts/etl/validators';
import type { AggregatedWord } from '../scripts/etl/types';

function createVerb(): AggregatedWord {
  return {
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
    translations: null,
    examples: null,
    posAttributes: null,
    enrichmentAppliedAt: null,
    enrichmentMethod: null,
  };
}

function createNoun(): AggregatedWord {
  return {
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
    translations: null,
    examples: null,
    posAttributes: null,
    enrichmentAppliedAt: null,
    enrichmentMethod: null,
  };
}

function createAdjective(): AggregatedWord {
  return {
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
    translations: null,
    examples: null,
    posAttributes: null,
    enrichmentAppliedAt: null,
    enrichmentMethod: null,
  };
}

function createAdverb(): AggregatedWord {
  return {
    lemma: 'oft',
    pos: 'Adv',
    level: 'A2',
    english: 'often',
    exampleDe: 'Er kommt oft vorbei.',
    exampleEn: 'He often stops by.',
    gender: null,
    plural: null,
    separable: null,
    aux: null,
    praesensIch: null,
    praesensEr: null,
    praeteritum: null,
    partizipIi: null,
    perfekt: null,
    comparative: 'öfter',
    superlative: 'am häufigsten',
    approved: true,
    complete: true,
    translations: null,
    examples: null,
    posAttributes: null,
    enrichmentAppliedAt: null,
    enrichmentMethod: null,
  };
}

function createPreposition(): AggregatedWord {
  return {
    lemma: 'ohne',
    pos: 'Präp',
    level: 'A2',
    english: 'without',
    exampleDe: 'Ohne dich gehe ich nicht.',
    exampleEn: 'I will not go without you.',
    gender: null,
    plural: null,
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
    translations: null,
    examples: null,
    posAttributes: {
      preposition: { cases: ['Akkusativ'], notes: ['Regiert den Akkusativ.'] },
      tags: ['governed-case'],
      notes: ['Used with accusative objects.'],
    },
    enrichmentAppliedAt: null,
    enrichmentMethod: null,
  };
}

describe('buildLexemeInventory', () => {
  it('deduplicates lexemes and inflections across POS types', () => {
    const words: AggregatedWord[] = [
      createVerb(),
      createNoun(),
      createAdjective(),
      createAdverb(),
      createPreposition(),
    ];

    const inventory = buildLexemeInventory(words);

    expect(inventory.lexemes).toHaveLength(5);
    expect(inventory.inflections.length).toBeGreaterThan(5);
    expect(inventory.attribution.length).toBeGreaterThan(0);

    const prepositionLexeme = inventory.lexemes.find((lexeme) => lexeme.lemma === 'ohne');
    expect(prepositionLexeme?.metadata.preposition).toMatchObject({ cases: ['Akkusativ'] });

    const prepositionInflections = inventory.inflections.filter(
      (inflection) => inflection.lexemeId === prepositionLexeme?.id,
    );
    expect(prepositionInflections[0]?.features.governedCases).toEqual(['Akkusativ']);
    expect(prepositionInflections[0]?.sourceRevision).toMatch(/^pos_jsonl:prepositions:/);
  });
});

describe('validateWord', () => {
  it('flags missing required noun fields', () => {
    const noun = createNoun();
    noun.gender = null;
    const result = validateWord(noun);
    expect(result.errors).toContain('gender');
  });

  it('treats preposition cases as warnings when absent', () => {
    const preposition = createPreposition();
    preposition.posAttributes = { preposition: { cases: [], notes: [] } } as AggregatedWord['posAttributes'];
    const result = validateWord(preposition);
    expect(result.errors).toHaveLength(0);
    expect(result.warnings).toContain('preposition.cases');
  });
});
