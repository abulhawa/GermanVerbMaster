import { db, taskSpecs, words, type Word } from '@db';

import { MANUAL_ADMIN_SOURCE } from '@shared/content-sources';

import { buildLexemeInventory, buildTaskInventory, upsertLexemeInventory } from '../../../scripts/etl/golden';
import type { AggregatedWord } from '../../../scripts/etl/types';
import { chunkArray } from '../../../scripts/etl/utils';
import { clearQueryCache } from '../../cache/query-cache.js';
import { resetTaskSpecCache } from '../../cache/task-specs-cache.js';

const TASK_INSERT_BATCH_SIZE = 500;

function toAggregatedWord(word: Word): AggregatedWord {
  return {
    lemma: word.lemma,
    pos: word.pos as AggregatedWord['pos'],
    level: word.level ?? null,
    english: word.english ?? null,
    exampleDe: word.exampleDe ?? null,
    exampleEn: word.exampleEn ?? null,
    gender: word.gender ?? null,
    plural: word.plural ?? null,
    separable: word.separable ?? null,
    aux: word.aux ?? null,
    praesensIch: word.praesensIch ?? null,
    praesensEr: word.praesensEr ?? null,
    praeteritum: word.praeteritum ?? null,
    partizipIi: word.partizipIi ?? null,
    perfekt: word.perfekt ?? null,
    comparative: word.comparative ?? null,
    superlative: word.superlative ?? null,
    approved: word.approved,
    complete: word.complete,
    translations: word.translations ?? null,
    examples: word.examples ?? null,
    posAttributes: word.posAttributes ?? null,
    enrichmentAppliedAt: word.enrichmentAppliedAt ? word.enrichmentAppliedAt.toISOString() : null,
    enrichmentMethod: word.enrichmentMethod ?? null,
  };
}

export function isManualAdminWord(word: Pick<Word, 'sourcesCsv'>): boolean {
  return word.sourcesCsv === MANUAL_ADMIN_SOURCE;
}

export async function rebuildDerivedContentFromWords(): Promise<void> {
  const wordRows = await db.select().from(words);
  const aggregated = wordRows.map(toAggregatedWord);
  const lexemeInventory = buildLexemeInventory(aggregated);
  const taskInventory = buildTaskInventory(aggregated);

  await db.transaction(async (tx) => {
    await tx.delete(taskSpecs);
    await upsertLexemeInventory(tx as Parameters<typeof upsertLexemeInventory>[0], lexemeInventory);

    for (const batch of chunkArray(taskInventory.tasks, TASK_INSERT_BATCH_SIZE)) {
      if (batch.length === 0) {
        continue;
      }
      await tx.insert(taskSpecs).values(batch);
    }
  });

  clearQueryCache();
  resetTaskSpecCache();
}
