import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';

import type { AggregatedWord } from '../scripts/etl/types';
import { setupTestDatabase, type TestDatabaseContext } from './helpers/pg';

describe('task synchronizer delta sync', () => {
  const sampleWords: AggregatedWord[] = [
    {
      lemma: 'gehen',
      pos: 'V',
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
      lemma: 'kommen',
      pos: 'V',
      level: 'A1',
      english: 'to come',
      exampleDe: 'Sie kommen später.',
      exampleEn: 'They come later.',
      gender: null,
      plural: null,
      separable: false,
      aux: 'sein',
      praesensIch: 'komme',
      praesensEr: 'kommt',
      praeteritum: 'kam',
      partizipIi: 'gekommen',
      perfekt: 'ist gekommen',
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
  ];

  let dbContext: TestDatabaseContext | undefined;
  let drizzleDb: typeof import('@db').db;
  let lexemesTable: typeof import('../db/schema.js').lexemes;
  let inflectionsTable: typeof import('../db/schema.js').inflections;
  let taskSpecsTable: typeof import('../db/schema.js').taskSpecs;
  let seedLexemeInventoryForWords: typeof import('./helpers/task-fixtures').seedLexemeInventoryForWords;
  let ensureTaskSpecsSynced: typeof import('../server/tasks/synchronizer.js').ensureTaskSpecsSynced;
  let resetTaskSpecSync: typeof import('../server/tasks/synchronizer.js').resetTaskSpecSync;
  let loadTaskSpecSyncMarker: typeof import('../server/tasks/task-sync-state.js').loadTaskSpecSyncMarker;
  let storeTaskSpecSyncMarker: typeof import('../server/tasks/task-sync-state.js').storeTaskSpecSyncMarker;
  let clearTaskSpecSyncMarker: typeof import('../server/tasks/task-sync-state.js').clearTaskSpecSyncMarker;

  beforeEach(async () => {
    dbContext = await setupTestDatabase();
    dbContext.mock();

    const dbModule = await import('@db');
    drizzleDb = dbModule.db;

    const schemaModule = await import('../db/schema.js');
    lexemesTable = schemaModule.lexemes;
    inflectionsTable = schemaModule.inflections;
    taskSpecsTable = schemaModule.taskSpecs;

    ({ seedLexemeInventoryForWords } = await import('./helpers/task-fixtures'));
    ({ ensureTaskSpecsSynced, resetTaskSpecSync } = await import('../server/tasks/synchronizer.js'));
    ({
      loadTaskSpecSyncMarker,
      storeTaskSpecSyncMarker,
      clearTaskSpecSyncMarker,
    } = await import('../server/tasks/task-sync-state.js'));

    await seedLexemeInventoryForWords(drizzleDb, sampleWords);
    await clearTaskSpecSyncMarker();
    resetTaskSpecSync();
  });

  afterEach(async () => {
    if (dbContext) {
      await dbContext.cleanup();
      dbContext = undefined;
    }
  });

  async function getLexemeIdByLemma(lemma: string): Promise<string> {
    const rows = await drizzleDb
      .select({ id: lexemesTable.id })
      .from(lexemesTable)
      .where(eq(lexemesTable.lemma, lemma))
      .limit(1);
    const id = rows[0]?.id;
    if (!id) {
      throw new Error(`Lexeme not found for lemma ${lemma}`);
    }
    return id;
  }

  async function getLatestTaskUpdatedAt(lexemeId: string): Promise<Date | null> {
    const rows = await drizzleDb
      .select({ updatedAt: taskSpecsTable.updatedAt })
      .from(taskSpecsTable)
      .where(eq(taskSpecsTable.lexemeId, lexemeId));

    let latest: Date | null = null;
    for (const row of rows) {
      const value = row.updatedAt ?? null;
      if (value && (!latest || value > latest)) {
        latest = value;
      }
    }

    return latest;
  }

  function rewindMarker(marker: Date | null): Date | null {
    return marker;
  }

  it('skips unchanged lexemes when rerunning with a marker', async () => {
    const fullSync = await ensureTaskSpecsSynced();
    expect(fullSync.latestTouchedAt).toBeInstanceOf(Date);
    const marker = fullSync.latestTouchedAt!;
    await storeTaskSpecSyncMarker(marker);

    const updatedLexemeId = await getLexemeIdByLemma('gehen');
    const untouchedLexemeId = await getLexemeIdByLemma('kommen');

    const beforeUpdated = await getLatestTaskUpdatedAt(updatedLexemeId);
    const beforeUntouched = await getLatestTaskUpdatedAt(untouchedLexemeId);
    expect(beforeUpdated).toBeInstanceOf(Date);
    expect(beforeUntouched).toBeInstanceOf(Date);

    const currentMetadataRow = await drizzleDb
      .select({ metadata: lexemesTable.metadata })
      .from(lexemesTable)
      .where(eq(lexemesTable.id, updatedLexemeId))
      .limit(1);

    const nextMetadata = {
      ...(currentMetadataRow[0]?.metadata as Record<string, unknown> | undefined ?? {}),
      level: 'B1',
    };

    const updatedLexemeTimestamp = new Date(marker.getTime() + 1000);

    await drizzleDb
      .update(lexemesTable)
      .set({ metadata: nextMetadata, updatedAt: updatedLexemeTimestamp })
      .where(eq(lexemesTable.id, updatedLexemeId));

    resetTaskSpecSync();
    const storedMarker = await loadTaskSpecSyncMarker();
    const since = rewindMarker(storedMarker);
    const deltaSync = await ensureTaskSpecsSynced({ since });
    if (deltaSync.latestTouchedAt) {
      await storeTaskSpecSyncMarker(deltaSync.latestTouchedAt);
    }

    const afterUpdated = await getLatestTaskUpdatedAt(updatedLexemeId);
    const afterUntouched = await getLatestTaskUpdatedAt(untouchedLexemeId);

    expect(afterUpdated && beforeUpdated && afterUpdated > beforeUpdated).toBe(true);
    expect(afterUntouched && beforeUntouched && afterUntouched.getTime() === beforeUntouched.getTime()).toBe(true);
  });

  it('resyncs lexemes when only inflections change', async () => {
    const fullSync = await ensureTaskSpecsSynced();
    expect(fullSync.latestTouchedAt).toBeInstanceOf(Date);
    const marker = fullSync.latestTouchedAt!;
    await storeTaskSpecSyncMarker(marker);

    const targetLexemeId = await getLexemeIdByLemma('gehen');
    const untouchedLexemeId = await getLexemeIdByLemma('kommen');

    const inflectionRow = await drizzleDb
      .select({ id: inflectionsTable.id })
      .from(inflectionsTable)
      .where(eq(inflectionsTable.lexemeId, targetLexemeId))
      .limit(1);
    const inflectionId = inflectionRow[0]?.id;
    expect(inflectionId).toBeTruthy();

    const beforeTarget = await getLatestTaskUpdatedAt(targetLexemeId);
    const beforeUntouched = await getLatestTaskUpdatedAt(untouchedLexemeId);

    const originalInflection = await drizzleDb
      .select({ form: inflectionsTable.form })
      .from(inflectionsTable)
      .where(eq(inflectionsTable.id, inflectionId!))
      .limit(1);

    const updatedForm = `${originalInflection[0]?.form ?? ''}_mod`;

    const updatedInflectionTimestamp = new Date(marker.getTime() + 1000);

    await drizzleDb
      .update(inflectionsTable)
      .set({ form: updatedForm, updatedAt: updatedInflectionTimestamp })
      .where(eq(inflectionsTable.id, inflectionId!));

    resetTaskSpecSync();
    const storedMarker = await loadTaskSpecSyncMarker();
    const since = rewindMarker(storedMarker);
    const deltaSync = await ensureTaskSpecsSynced({ since });
    if (deltaSync.latestTouchedAt) {
      await storeTaskSpecSyncMarker(deltaSync.latestTouchedAt);
    }

    const afterTarget = await getLatestTaskUpdatedAt(targetLexemeId);
    const afterUntouched = await getLatestTaskUpdatedAt(untouchedLexemeId);

    expect(afterTarget && beforeTarget && afterTarget > beforeTarget).toBe(true);
    expect(afterUntouched && beforeUntouched && afterUntouched.getTime() === beforeUntouched.getTime()).toBe(true);
  });
});
