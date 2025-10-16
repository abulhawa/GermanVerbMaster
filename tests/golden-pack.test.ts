import { describe, expect, it } from 'vitest';

import { buildTaskInventory } from '../scripts/etl/golden';
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

describe('buildTaskInventory', () => {
  it('creates deterministic task specs validated against the registry', () => {
    const firstRun = buildTaskInventory(sampleWords);
    const secondRun = buildTaskInventory(sampleWords);

    expect(secondRun).toEqual(firstRun);
    expect(firstRun.tasks).toHaveLength(7);

    const verbTasks = firstRun.tasks.filter((task) => task.pos === 'verb');
    expect(verbTasks).toHaveLength(4);
    const requestedForms = verbTasks.map((task) => (task.prompt as any).requestedForm?.tense);
    expect(requestedForms).toEqual(['present', 'present', 'past', 'participle']);
    const requestedPersons = verbTasks.map((task) => (task.prompt as any).requestedForm?.person ?? null);
    expect(requestedPersons).toEqual([1, 3, 3, null]);

    const nounTasks = firstRun.tasks.filter((task) => task.pos === 'noun');
    expect(nounTasks).toHaveLength(1);
    expect((nounTasks[0]?.prompt as any).requestedCase).toBe('accusative');
    expect((nounTasks[0]?.prompt as any).requestedNumber).toBe('plural');

    const adjectiveTasks = firstRun.tasks.filter((task) => task.pos === 'adjective');
    expect(adjectiveTasks).toHaveLength(2);
    expect(adjectiveTasks.map((task) => (task.prompt as any).degree)).toEqual([
      'comparative',
      'superlative',
    ]);

    for (const task of firstRun.tasks) {
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
  });
});
