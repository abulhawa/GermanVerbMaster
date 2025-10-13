import type { NodePgDatabase } from 'drizzle-orm/node-postgres';

import type { AggregatedWord } from '../../scripts/etl/types';
import { buildLexemeInventory, upsertLexemeInventory } from '../../scripts/etl/golden';

export type Schema = typeof import('../../db/schema.js');

export async function seedLexemeInventoryForWords(
  db: NodePgDatabase<Schema>,
  words: AggregatedWord[],
): Promise<void> {
  if (words.length === 0) {
    return;
  }

  const inventory = buildLexemeInventory(words);
  if (inventory.lexemes.length === 0) {
    return;
  }

  await upsertLexemeInventory(db, inventory);
}
