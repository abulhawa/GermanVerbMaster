import { sql } from 'drizzle-orm';

import { words } from '@db/schema';

import { buildLexemeInventory, upsertLexemeInventory as persistLexemeInventory } from '../etl/golden';
import { chunkArray } from '../etl/utils';
import { WORDS_BATCH_SIZE } from './constants';
import type { DatabaseClient } from './database';
import type { AggregatedWordWithKey } from './types';
import { keyFor } from './loaders/words';

function toDateOrNull(value: string | null | undefined): Date | null {
  if (!value) {
    return null;
  }
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date : null;
}

async function deleteWordBatch(
  db: DatabaseClient,
  batch: Array<{ lemma: string; pos: string }>,
): Promise<void> {
  if (!batch.length) {
    return;
  }

  const tupleList = sql.join(
    batch.map((row) => sql`(${row.lemma}, ${row.pos})`),
    sql`, `,
  );

  await db.execute(sql`DELETE FROM "words" WHERE ("lemma", "pos") IN (${tupleList})`);
}

export async function insertWordsBatch(
  db: DatabaseClient,
  batch: AggregatedWordWithKey[],
): Promise<void> {
  if (!batch.length) {
    return;
  }

  await db
    .insert(words)
    .values(
      batch.map((word) => ({
        lemma: word.lemma,
        pos: word.pos,
        level: word.level,
        english: word.english,
        exampleDe: word.exampleDe,
        exampleEn: word.exampleEn,
        gender: word.gender,
        plural: word.plural,
        separable: word.separable,
        aux: word.aux,
        praesensIch: word.praesensIch,
        praesensEr: word.praesensEr,
        praeteritum: word.praeteritum,
        partizipIi: word.partizipIi,
        perfekt: word.perfekt,
        comparative: word.comparative,
        superlative: word.superlative,
        approved: word.approved,
        complete: word.complete,
        translations: word.translations ?? null,
        examples: word.examples ?? null,
        enrichmentAppliedAt: toDateOrNull(word.enrichmentAppliedAt),
        enrichmentMethod: word.enrichmentMethod ?? null,
      })),
    )
    .onConflictDoUpdate({
      target: [words.lemma, words.pos],
      set: {
        level: sql`excluded.level`,
        english: sql`excluded.english`,
        exampleDe: sql`excluded.example_de`,
        exampleEn: sql`excluded.example_en`,
        gender: sql`excluded.gender`,
        plural: sql`excluded.plural`,
        separable: sql`excluded.separable`,
        aux: sql`excluded.aux`,
        praesensIch: sql`excluded.praesens_ich`,
        praesensEr: sql`excluded.praesens_er`,
        praeteritum: sql`excluded.praeteritum`,
        partizipIi: sql`excluded.partizip_ii`,
        perfekt: sql`excluded.perfekt`,
        comparative: sql`excluded.comparative`,
        superlative: sql`excluded.superlative`,
        approved: sql`excluded.approved`,
        complete: sql`excluded.complete`,
        translations: sql`excluded.translations`,
        examples: sql`excluded.examples`,
        enrichmentAppliedAt: sql`excluded.enrichment_applied_at`,
        enrichmentMethod: sql`excluded.enrichment_method`,
        updatedAt: sql`now()`,
      },
    });
}

export async function syncLegacyWords(
  db: DatabaseClient,
  wordsToUpsert: AggregatedWordWithKey[],
): Promise<void> {
  const existing = await db.select({ lemma: words.lemma, pos: words.pos }).from(words);
  const desiredKeys = new Set(wordsToUpsert.map((word) => word.key));

  const wordsToDelete = existing.filter((row) => !desiredKeys.has(keyFor(row.lemma, row.pos)));

  for (const batch of chunkArray(wordsToDelete, WORDS_BATCH_SIZE)) {
    await deleteWordBatch(db, batch);
  }

  for (const batch of chunkArray(wordsToUpsert, WORDS_BATCH_SIZE)) {
    await insertWordsBatch(db, batch);
  }
}

export async function upsertLexemeInventory(
  db: DatabaseClient,
  aggregated: AggregatedWordWithKey[],
): Promise<{ lexemeCount: number; inflectionCount: number }> {
  const inventory = buildLexemeInventory(aggregated);
  await persistLexemeInventory(db, inventory);

  return {
    lexemeCount: inventory.lexemes.length,
    inflectionCount: inventory.inflections.length,
  };
}
