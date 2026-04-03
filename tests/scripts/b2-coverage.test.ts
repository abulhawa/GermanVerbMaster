import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { aggregateWords } from '../../scripts/seed/loaders/words';

function repoRoot(): string {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
}

describe('B2 canonical inventory coverage', () => {
  it('includes a reusable approved B2 inventory across verbs, nouns, and adjectives', async () => {
    const aggregated = await aggregateWords(repoRoot());
    const b2Words = aggregated.filter((entry) => entry.level === 'B2' && entry.approved && entry.complete);

    const byPos = {
      V: b2Words.filter((entry) => entry.pos === 'V'),
      N: b2Words.filter((entry) => entry.pos === 'N'),
      Adj: b2Words.filter((entry) => entry.pos === 'Adj'),
    };

    expect(byPos.V.length).toBeGreaterThanOrEqual(10);
    expect(byPos.N.length).toBeGreaterThanOrEqual(10);
    expect(byPos.Adj.length).toBeGreaterThanOrEqual(10);

    expect(byPos.V.some((entry) => entry.lemma === 'erläutern')).toBe(true);
    expect(byPos.N.some((entry) => entry.lemma === 'Vereinbarung')).toBe(true);
    expect(byPos.Adj.some((entry) => entry.lemma === 'nachvollziehbar')).toBe(true);
  });
});
