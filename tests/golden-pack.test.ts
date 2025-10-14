import { describe, expect, it } from 'vitest';

import { buildGoldenBundles } from '../scripts/etl/golden';
import { validateTaskAgainstRegistry } from '../shared/task-registry';

const sampleWords = [
  {
    lemma: 'gehen',
    pos: 'V' as const,
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
  },
  {
    lemma: 'Haus',
    pos: 'N' as const,
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
  },
  {
    lemma: 'schnell',
    pos: 'Adj' as const,
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
  },
];

describe('buildGoldenBundles', () => {
  it('creates deterministic packs with validated tasks', () => {
    const firstRun = buildGoldenBundles(sampleWords);
    const secondRun = buildGoldenBundles(sampleWords);

    expect(firstRun).toHaveLength(3);
    expect(secondRun).toEqual(firstRun);

    const verbBundle = firstRun.find((bundle) => bundle.pack.slug === 'verbs-foundation');
    expect(verbBundle?.tasks.every((task) => task.taskType === 'conjugate_form')).toBe(true);
    expect(verbBundle?.lexemes[0].id).toMatch(/^de:verb:/);

    for (const bundle of firstRun) {
      for (const task of bundle.tasks) {
        const validation = validateTaskAgainstRegistry(
          task.taskType,
          task.pos,
          task.renderer,
          task.prompt,
          task.solution,
        );
        expect(validation.taskType).toBe(task.taskType);
        expect(validation.renderer).toBe(task.renderer);
      }
      expect(bundle.packLexemes.every((entry, index) => entry.position === index + 1)).toBe(true);
      expect(bundle.pack.checksum).toBeTruthy();
      const metadata = bundle.pack.metadata as { attribution?: unknown } | null;
      expect(Array.isArray(metadata?.attribution)).toBe(true);
    }
  });
});
