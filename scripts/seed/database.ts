import { sql } from 'drizzle-orm';

import { getDb } from '@db';
import { inflections as inflectionsTable, lexemes as lexemesTable, words } from '@db/schema';

export type DatabaseClient = ReturnType<typeof getDb>;

let cachedDb: DatabaseClient | null = null;

export function ensureDatabase(): DatabaseClient {
  if (!cachedDb) {
    cachedDb = getDb();
  }

  return cachedDb;
}

export async function ensureLegacySchema(db: DatabaseClient): Promise<void> {
  await db.execute(sql`ALTER TABLE words ADD COLUMN IF NOT EXISTS pos_attributes JSONB`);
}

export async function resetSeededContent(db: DatabaseClient): Promise<void> {
  await db.transaction(async (tx) => {
    await tx.delete(inflectionsTable);
    await tx.delete(lexemesTable);
    await tx.delete(words);
  });
}
