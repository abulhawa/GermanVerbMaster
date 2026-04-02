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
  let loadTaskSpecSyncCheckpoint: typeof import('../server/tasks/task-sync-state.js').loadTaskSpecSyncCheckpoint;
  let clearTaskSpecSyncCheckpoint: typeof import('../server/tasks/task-sync-state.js').clearTaskSpecSyncCheckpoint;

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
    ({ loadTaskSpecSyncCheckpoint, clearTaskSpecSyncCheckpoint } = await import(
      '../server/tasks/task-sync-state.js'
    ));

    await seedLexemeInventoryForWords(drizzleDb, sampleWords);
    await clearTaskSpecSyncCheckpoint();
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

  async function insertManualB2WritingTask(lexemeId: string, taskId: string): Promise<void> {
    await drizzleDb.insert(taskSpecsTable).values({
      id: taskId,
      lexemeId,
      pos: 'verb',
      taskType: 'b2_writing_prompt',
      renderer: 'b2_writing_prompt',
      prompt: {
        scenario: 'Formulate a formal response for a project update.',
        wordBankItems: ['wuerde', 'sollte', 'jedoch', 'meiner Meinung nach'],
        cefrLevel: 'B2',
        taskInstructions: 'Write a short formal response.',
      },
      solution: {
        keyPhrases: ['wuerde', 'meiner Meinung nach', 'jedoch'],
        grammarFocus: 'Use Konjunktiv II for polite tone.',
      },
      metadata: { source: 'test:manual-b2' },
      revision: 1,
    });
  }

  it('bootstraps a checkpoint when none exists', async () => {
    const before = await loadTaskSpecSyncCheckpoint();
    expect(before).toBeNull();

    const result = await ensureTaskSpecsSynced();
    expect(result.checkpoint).toBeTruthy();
    const checkpoint = result.checkpoint!;
    expect(checkpoint.lastSyncedAt).toBeInstanceOf(Date);

    const stored = await loadTaskSpecSyncCheckpoint();
    expect(stored?.lastSyncedAt.toISOString()).toBe(checkpoint.lastSyncedAt.toISOString());
    expect(stored?.versionHash ?? null).toBe(checkpoint.versionHash ?? null);
  });

  it('recovers and persists a fresh checkpoint after loss', async () => {
    const initial = await ensureTaskSpecsSynced();
    expect(initial.checkpoint).toBeTruthy();
    const initialCheckpoint = initial.checkpoint!;

    await clearTaskSpecSyncCheckpoint();
    resetTaskSpecSync();

    const lexemeId = await getLexemeIdByLemma('gehen');
    const bumpedTimestamp = new Date(initialCheckpoint.lastSyncedAt.getTime() + 1000);

    await drizzleDb
      .update(lexemesTable)
      .set({ updatedAt: bumpedTimestamp })
      .where(eq(lexemesTable.id, lexemeId));

    resetTaskSpecSync();
    const recovery = await ensureTaskSpecsSynced();
    expect(recovery.checkpoint).toBeTruthy();
    const recoveryCheckpoint = recovery.checkpoint!;
    expect(recoveryCheckpoint.lastSyncedAt.getTime()).toBeGreaterThan(
      initialCheckpoint.lastSyncedAt.getTime(),
    );

    const stored = await loadTaskSpecSyncCheckpoint();
    expect(stored?.lastSyncedAt.toISOString()).toBe(recoveryCheckpoint.lastSyncedAt.toISOString());
    expect(stored?.versionHash ?? null).toBe(recoveryCheckpoint.versionHash ?? null);
  });

  it('skips unchanged lexemes when rerunning with a stored checkpoint', async () => {
    const fullSync = await ensureTaskSpecsSynced();
    expect(fullSync.checkpoint).toBeTruthy();
    const initialCheckpoint = fullSync.checkpoint!;

    const storedAfterFull = await loadTaskSpecSyncCheckpoint();
    expect(storedAfterFull?.lastSyncedAt.toISOString()).toBe(
      initialCheckpoint.lastSyncedAt.toISOString(),
    );

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

    const updatedLexemeTimestamp = new Date(initialCheckpoint.lastSyncedAt.getTime() + 1000);

    await drizzleDb
      .update(lexemesTable)
      .set({ metadata: nextMetadata, updatedAt: updatedLexemeTimestamp })
      .where(eq(lexemesTable.id, updatedLexemeId));

    resetTaskSpecSync();
    const deltaSync = await ensureTaskSpecsSynced();
    expect(deltaSync.checkpoint).toBeTruthy();

    const storedAfterDelta = await loadTaskSpecSyncCheckpoint();
    expect(storedAfterDelta?.lastSyncedAt.toISOString()).toBe(
      deltaSync.checkpoint!.lastSyncedAt.toISOString(),
    );

    const afterUpdated = await getLatestTaskUpdatedAt(updatedLexemeId);
    const afterUntouched = await getLatestTaskUpdatedAt(untouchedLexemeId);

    expect(afterUpdated && beforeUpdated && afterUpdated > beforeUpdated).toBe(true);
    expect(afterUntouched && beforeUntouched && afterUntouched.getTime() === beforeUntouched.getTime()).toBe(true);
  });

  it('resyncs lexemes when only inflections change', async () => {
    const fullSync = await ensureTaskSpecsSynced();
    expect(fullSync.checkpoint).toBeTruthy();
    const initialCheckpoint = fullSync.checkpoint!;

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

    const updatedInflectionTimestamp = new Date(initialCheckpoint.lastSyncedAt.getTime() + 1000);

    await drizzleDb
      .update(inflectionsTable)
      .set({ form: updatedForm, updatedAt: updatedInflectionTimestamp })
      .where(eq(inflectionsTable.id, inflectionId!));

    resetTaskSpecSync();
    const deltaSync = await ensureTaskSpecsSynced();
    expect(deltaSync.checkpoint).toBeTruthy();

    const afterTarget = await getLatestTaskUpdatedAt(targetLexemeId);
    const afterUntouched = await getLatestTaskUpdatedAt(untouchedLexemeId);

    expect(afterTarget && beforeTarget && afterTarget > beforeTarget).toBe(true);
    expect(afterUntouched && beforeUntouched && afterUntouched.getTime() === beforeUntouched.getTime()).toBe(true);
  });

  it('removes obsolete task specs when templates are no longer available', async () => {
    const fullSync = await ensureTaskSpecsSynced();
    expect(fullSync.checkpoint).toBeTruthy();
    const initialCheckpoint = fullSync.checkpoint!;

    const targetLexemeId = await getLexemeIdByLemma('gehen');

    const originalTasks = await drizzleDb
      .select({ id: taskSpecsTable.id, revision: taskSpecsTable.revision })
      .from(taskSpecsTable)
      .where(eq(taskSpecsTable.lexemeId, targetLexemeId));
    expect(originalTasks.length).toBeGreaterThan(0);

    const partizipTaskId = originalTasks.find((row) => row.revision === 4)?.id;
    expect(partizipTaskId).toBeTruthy();

    const inflectionRows = await drizzleDb
      .select({ id: inflectionsTable.id, features: inflectionsTable.features })
      .from(inflectionsTable)
      .where(eq(inflectionsTable.lexemeId, targetLexemeId));

    const partizipInflection = inflectionRows.find((row) => {
      const features = row.features as Record<string, unknown>;
      return features.tense === 'participle';
    });
    expect(partizipInflection?.id).toBeTruthy();

    const updatedFeatures = {
      ...(partizipInflection!.features as Record<string, unknown>),
      tense: 'present',
    } as Record<string, unknown>;

    const updatedTimestamp = new Date(initialCheckpoint.lastSyncedAt.getTime() + 1000);

    await drizzleDb
      .update(inflectionsTable)
      .set({ features: updatedFeatures, updatedAt: updatedTimestamp })
      .where(eq(inflectionsTable.id, partizipInflection!.id));

    resetTaskSpecSync();
    const deltaSync = await ensureTaskSpecsSynced();
    expect(deltaSync.checkpoint).toBeTruthy();

    const refreshedTasks = await drizzleDb
      .select({ id: taskSpecsTable.id, revision: taskSpecsTable.revision })
      .from(taskSpecsTable)
      .where(eq(taskSpecsTable.lexemeId, targetLexemeId));

    expect(refreshedTasks.length).toBeLessThan(originalTasks.length);
    expect(refreshedTasks.some((row) => row.id === partizipTaskId)).toBe(false);
  });

  it('preserves manual b2_writing_prompt tasks during stale type pruning', async () => {
    const fullSync = await ensureTaskSpecsSynced();
    expect(fullSync.checkpoint).toBeTruthy();
    const initialCheckpoint = fullSync.checkpoint!;

    const targetLexemeId = await getLexemeIdByLemma('gehen');
    const manualTaskId = 'task:b2:manual-preserve';
    await insertManualB2WritingTask(targetLexemeId, manualTaskId);

    const currentMetadataRow = await drizzleDb
      .select({ metadata: lexemesTable.metadata })
      .from(lexemesTable)
      .where(eq(lexemesTable.id, targetLexemeId))
      .limit(1);

    const updatedMetadata = {
      ...((currentMetadataRow[0]?.metadata as Record<string, unknown> | undefined) ?? {}),
      level: 'B1',
    };

    const updatedTimestamp = new Date(initialCheckpoint.lastSyncedAt.getTime() + 1000);
    await drizzleDb
      .update(lexemesTable)
      .set({ metadata: updatedMetadata, updatedAt: updatedTimestamp })
      .where(eq(lexemesTable.id, targetLexemeId));

    resetTaskSpecSync();
    await ensureTaskSpecsSynced();

    const persistedManualTask = await drizzleDb
      .select({ id: taskSpecsTable.id })
      .from(taskSpecsTable)
      .where(eq(taskSpecsTable.id, manualTaskId))
      .limit(1);
    expect(persistedManualTask).toHaveLength(1);
  });

  it('removes task specs when a lexeme is no longer supported', async () => {
    await ensureTaskSpecsSynced();

    const targetLexemeId = await getLexemeIdByLemma('gehen');
    const siblingLexemeId = await getLexemeIdByLemma('kommen');

    const beforeTargetCount = await drizzleDb
      .select({ id: taskSpecsTable.id })
      .from(taskSpecsTable)
      .where(eq(taskSpecsTable.lexemeId, targetLexemeId));
    expect(beforeTargetCount.length).toBeGreaterThan(0);

    const beforeSiblingCount = await drizzleDb
      .select({ id: taskSpecsTable.id })
      .from(taskSpecsTable)
      .where(eq(taskSpecsTable.lexemeId, siblingLexemeId));
    expect(beforeSiblingCount.length).toBeGreaterThan(0);

    const updatedTimestamp = new Date(Date.now() + 1000);

    await drizzleDb
      .update(lexemesTable)
      .set({ pos: 'adverb', updatedAt: updatedTimestamp })
      .where(eq(lexemesTable.id, targetLexemeId));

    resetTaskSpecSync();
    await ensureTaskSpecsSynced();

    const afterTargetCount = await drizzleDb
      .select({ id: taskSpecsTable.id })
      .from(taskSpecsTable)
      .where(eq(taskSpecsTable.lexemeId, targetLexemeId));
    expect(afterTargetCount.length).toBe(0);

    const afterSiblingCount = await drizzleDb
      .select({ id: taskSpecsTable.id })
      .from(taskSpecsTable)
      .where(eq(taskSpecsTable.lexemeId, siblingLexemeId));
    expect(afterSiblingCount.length).toBe(beforeSiblingCount.length);
  });

  it('removes manual b2_writing_prompt tasks when the lexeme becomes unsupported', async () => {
    await ensureTaskSpecsSynced();

    const targetLexemeId = await getLexemeIdByLemma('gehen');
    const manualTaskId = 'task:b2:manual-remove';
    await insertManualB2WritingTask(targetLexemeId, manualTaskId);

    const insertedManualTask = await drizzleDb
      .select({ id: taskSpecsTable.id })
      .from(taskSpecsTable)
      .where(eq(taskSpecsTable.id, manualTaskId))
      .limit(1);
    expect(insertedManualTask).toHaveLength(1);

    await drizzleDb
      .update(lexemesTable)
      .set({ pos: 'adverb', updatedAt: new Date(Date.now() + 1000) })
      .where(eq(lexemesTable.id, targetLexemeId));

    resetTaskSpecSync();
    await ensureTaskSpecsSynced();

    const afterRemoval = await drizzleDb
      .select({ id: taskSpecsTable.id })
      .from(taskSpecsTable)
      .where(eq(taskSpecsTable.id, manualTaskId))
      .limit(1);
    expect(afterRemoval).toHaveLength(0);
  });
});
