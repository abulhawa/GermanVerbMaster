import { describe, expect, it } from 'vitest';

import { buildLexemeInventory, upsertLexemeInventory } from '../scripts/etl/golden';
import type { AggregatedWord } from '../scripts/etl/types';
import { setupTestDatabase } from './helpers/pg';

function createVerb(): AggregatedWord {
  return {
    lemma: 'gehen',
    pos: 'V',
    level: 'A1',
    english: 'to go',
    exampleDe: 'Ich gehe.',
    exampleEn: 'I go.',
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

describe('upsertLexemeInventory', () => {
  it('removes stale lexemes before inserting new ids for the same lemma and POS', async () => {
    const context = await setupTestDatabase();
    context.mock();

    try {
      const { lexemes } = await import('../db/schema.js');

      await context.db.insert(lexemes).values({
        id: 'legacy:de:verb:gehen',
        lemma: 'gehen',
        language: 'de',
        pos: 'verb',
        gender: null,
        metadata: {} as Record<string, unknown>,
        frequencyRank: null,
        sourceIds: ['legacy-source'],
      });

      const inventory = buildLexemeInventory([createVerb()]);
      const expectedId = inventory.lexemes[0]?.id;
      expect(expectedId).toBeDefined();

      await upsertLexemeInventory(context.db, inventory);

      const rows = await context.db.select().from(lexemes);
      expect(rows).toHaveLength(1);
      expect(rows[0]?.id).toBe(expectedId);
      expect(rows[0]?.lemma).toBe('gehen');
      expect(rows[0]?.pos).toBe('verb');
    } finally {
      await context.cleanup();
    }
  });
});
