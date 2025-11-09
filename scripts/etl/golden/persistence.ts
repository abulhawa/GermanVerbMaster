import { inArray, sql } from 'drizzle-orm';

import {
  inflections as inflectionsTable,
  lexemes as lexemesTable,
  taskSpecs as taskSpecsTable,
} from '@db/schema';

import { chunkArray } from '../utils';
import {
  INFLECTION_DELETE_CHUNK_SIZE,
  TASK_DELETE_CHUNK_SIZE,
  type DrizzleDatabase,
  type LexemeInventory,
  type TaskInventory,
} from './types';

export async function upsertLexemeInventory(
  db: DrizzleDatabase,
  inventory: LexemeInventory,
): Promise<void> {
  const incomingLexemeIds = new Set(inventory.lexemes.map((lexeme) => lexeme.id));
  const existingLexemes = await db.select({ id: lexemesTable.id }).from(lexemesTable);

  if (incomingLexemeIds.size === 0) {
    if (existingLexemes.length > 0) {
      await db.delete(lexemesTable);
    }
  } else {
    const staleLexemeIds = existingLexemes
      .map((row) => row.id)
      .filter((id): id is string => Boolean(id) && !incomingLexemeIds.has(id));
    if (staleLexemeIds.length > 0) {
      await db.delete(lexemesTable).where(inArray(lexemesTable.id, staleLexemeIds));
    }
  }

  if (inventory.lexemes.length > 0) {
    await db
      .insert(lexemesTable)
      .values(inventory.lexemes)
      .onConflictDoUpdate({
        target: lexemesTable.id,
        set: {
          lemma: sql`excluded.lemma`,
          pos: sql`excluded.pos`,
          gender: sql`excluded.gender`,
          metadata: sql`excluded.metadata`,
          frequencyRank: sql`excluded.frequency_rank`,
          sourceIds: sql`excluded.source_ids`,
          updatedAt: sql`now()`,
        },
      });
  }

  const inflectionsByLexeme = new Map<string, Set<string>>();
  for (const inflection of inventory.inflections) {
    let ids = inflectionsByLexeme.get(inflection.lexemeId);
    if (!ids) {
      ids = new Set<string>();
      inflectionsByLexeme.set(inflection.lexemeId, ids);
    }
    ids.add(inflection.id);
  }

  if (inflectionsByLexeme.size > 0) {
    const lexemeIds = Array.from(inflectionsByLexeme.keys());
    const existing = await db
      .select({
        id: inflectionsTable.id,
        lexemeId: inflectionsTable.lexemeId,
      })
      .from(inflectionsTable)
      .where(inArray(inflectionsTable.lexemeId, lexemeIds));

    const staleIds = existing
      .filter(({ id, lexemeId }) => {
        const incoming = inflectionsByLexeme.get(lexemeId);
        return !incoming || !incoming.has(id);
      })
      .map((row) => row.id);

    if (staleIds.length > 0) {
      for (const chunk of chunkArray(staleIds, INFLECTION_DELETE_CHUNK_SIZE)) {
        await db.delete(inflectionsTable).where(inArray(inflectionsTable.id, chunk));
      }
    }
  }

  if (inventory.inflections.length > 0) {
    await db
      .insert(inflectionsTable)
      .values(inventory.inflections)
      .onConflictDoUpdate({
        target: inflectionsTable.id,
        set: {
          form: sql`excluded.form`,
          features: sql`excluded.features`,
          audioAsset: sql`excluded.audio_asset`,
          sourceRevision: sql`excluded.source_revision`,
          checksum: sql`excluded.checksum`,
          updatedAt: sql`now()`,
        },
      });
  }
}

export async function upsertTaskInventory(
  db: DrizzleDatabase,
  inventory: TaskInventory,
): Promise<void> {
  if (inventory.tasks.length === 0) return;

  const lexemeIds = Array.from(new Set(inventory.tasks.map((task) => task.lexemeId)));
  if (lexemeIds.length > 0) {
    for (const chunk of chunkArray(lexemeIds, TASK_DELETE_CHUNK_SIZE)) {
      await db.delete(taskSpecsTable).where(inArray(taskSpecsTable.lexemeId, chunk));
    }
  }

  await db
    .insert(taskSpecsTable)
    .values(inventory.tasks)
    .onConflictDoUpdate({
      target: taskSpecsTable.id,
      set: {
        prompt: sql`excluded.prompt`,
        solution: sql`excluded.solution`,
        hints: sql`excluded.hints`,
        metadata: sql`excluded.metadata`,
        updatedAt: sql`now()`,
      },
    });
}
