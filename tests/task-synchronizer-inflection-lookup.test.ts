import { describe, expect, it } from 'vitest';

import { __TEST_ONLY__ } from '../server/tasks/synchronizer.js';

describe('createInflectionFinder', () => {
  const createFinder = __TEST_ONLY__.createInflectionFinder;

  it('returns indexed inflections for common feature tuples', () => {
    const finder = createFinder([
      {
        lexemeId: '1',
        form: 'gehe',
        features: {
          tense: 'present',
          mood: 'indicative',
          person: 1,
          number: 'singular',
        },
      },
      {
        lexemeId: '1',
        form: 'ist gegangen',
        features: {
          tense: 'perfect',
          mood: 'indicative',
        },
      },
    ]);

    expect(
      finder({ tense: 'present', mood: 'indicative', person: 1, number: 'singular' }),
    ).toBe('gehe');
    expect(finder({ tense: 'perfect' })).toBe('ist gegangen');
  });

  it('creates combinations for array-backed feature values', () => {
    const finder = createFinder([
      {
        lexemeId: '2',
        form: 'Häuser',
        features: {
          case: ['nominative', 'accusative'],
          number: 'plural',
        },
      },
    ]);

    expect(finder({ case: 'nominative', number: 'plural' })).toBe('Häuser');
    expect(finder({ case: 'accusative', number: 'plural' })).toBe('Häuser');
  });

  it('falls back to linear search for unsupported feature combinations', () => {
    const finder = createFinder([
      {
        lexemeId: '3',
        form: 'sonderform',
        features: {
          aspect: 'progressive',
        },
      },
    ]);

    expect(finder({ aspect: 'progressive' })).toBe('sonderform');
  });
});
