import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { count, eq } from 'drizzle-orm';

import type { PracticeResult } from '@shared';

describe('processTaskSubmission', () => {
  let db: typeof import('../db/index').db;
  let lexemesTable: typeof import('../db/schema').lexemes;
  let taskSpecsTable: typeof import('../db/schema').taskSpecs;
  let schedulingTable: typeof import('../db/schema').schedulingState;
  let telemetryTable: typeof import('../db/schema').telemetryPriorities;
  let processTaskSubmission: typeof import('../server/tasks/scheduler').processTaskSubmission;
  let taskRegistry: typeof import('../server/tasks/registry').taskRegistry;

  const baseTimestamp = new Date('2025-01-01T00:00:00.000Z');

  beforeEach(async () => {
    process.env.DATABASE_FILE = ':memory:';
    vi.resetModules();

    ({ db } = await import('../db/index'));
    const schema = await import('../db/schema');
    lexemesTable = schema.lexemes;
    taskSpecsTable = schema.taskSpecs;
    schedulingTable = schema.schedulingState;
    telemetryTable = schema.telemetryPriorities;

    ({ processTaskSubmission } = await import('../server/tasks/scheduler'));
    ({ taskRegistry } = await import('../server/tasks/registry'));
  });

  afterEach(() => {
    delete process.env.DATABASE_FILE;
    vi.resetModules();
  });

  async function seedLexeme({
    id,
    lemma,
    pos,
    gender,
    metadata = {},
    frequencyRank = null,
  }: {
    id: string;
    lemma: string;
    pos: 'verb' | 'noun';
    gender?: string | null;
    metadata?: Record<string, unknown>;
    frequencyRank?: number | null;
  }) {
    await db.insert(lexemesTable).values({
      id,
      lemma,
      language: 'de',
      pos,
      gender: gender ?? null,
      metadata,
      frequencyRank,
      sourceIds: ['test'],
      createdAt: baseTimestamp,
      updatedAt: baseTimestamp,
    });
  }

  async function seedTask({
    id,
    lexemeId,
    pos,
    taskType,
    prompt,
    solution,
  }: {
    id: string;
    lexemeId: string;
    pos: 'verb' | 'noun';
    taskType: 'conjugate_form' | 'noun_case_declension';
    prompt: Record<string, unknown>;
    solution: Record<string, unknown>;
  }) {
    await db.insert(taskSpecsTable).values({
      id,
      lexemeId,
      pos,
      taskType,
      renderer: taskRegistry[taskType].renderer,
      prompt,
      solution,
      revision: 1,
      sourcePack: 'test-pack',
      createdAt: baseTimestamp,
      updatedAt: baseTimestamp,
    });
  }

  async function recordSubmission({
    taskId,
    taskType,
    pos,
    result = 'correct',
    responseMs = 1800,
    deviceId = 'device-1',
    submittedAt = new Date('2025-01-02T09:00:00.000Z'),
    frequencyRank = 1200,
  }: {
    taskId: string;
    taskType: 'conjugate_form' | 'noun_case_declension';
    pos: 'verb' | 'noun';
    result?: PracticeResult;
    responseMs?: number;
    deviceId?: string;
    submittedAt?: Date;
    frequencyRank?: number | null;
  }) {
    return processTaskSubmission({
      deviceId,
      taskId,
      taskType,
      pos,
      queueCap: taskRegistry[taskType].queueCap,
      result,
      responseMs,
      submittedAt,
      frequencyRank,
    });
  }

  it('creates scheduling state and telemetry for new noun submissions', async () => {
    await seedLexeme({
      id: 'lex:de:noun:kind',
      lemma: 'Kind',
      pos: 'noun',
      gender: 'das',
      metadata: { english: 'child' },
      frequencyRank: 410,
    });

    await seedTask({
      id: 'task:de:noun:kind:dative',
      lexemeId: 'lex:de:noun:kind',
      pos: 'noun',
      taskType: 'noun_case_declension',
      prompt: {
        lemma: 'Kind',
        pos: 'noun',
        gender: 'das',
        requestedCase: 'dative',
        requestedNumber: 'plural',
        instructions: 'Setze „Kind“ in den Dativ Plural mit Artikel.',
      },
      solution: { form: 'Kindern', article: 'den' },
    });

    const result = await recordSubmission({
      taskId: 'task:de:noun:kind:dative',
      taskType: 'noun_case_declension',
      pos: 'noun',
    });

    expect(result.leitnerBox).toBeGreaterThanOrEqual(2);
    expect(result.totalAttempts).toBe(1);
    expect(result.correctAttempts).toBe(1);
    expect(result.queueCap).toBe(taskRegistry.noun_case_declension.queueCap);
    expect(result.coverageScore).toBeCloseTo(0.96, 2);

    const rows = await db
      .select({
        leitnerBox: schedulingTable.leitnerBox,
        totalAttempts: schedulingTable.totalAttempts,
        correctAttempts: schedulingTable.correctAttempts,
        priorityScore: schedulingTable.priorityScore,
      })
      .from(schedulingTable)
      .where(eq(schedulingTable.taskId, 'task:de:noun:kind:dative'));

    expect(rows).toHaveLength(1);
    expect(rows[0]?.leitnerBox).toBe(result.leitnerBox);
    expect(rows[0]?.totalAttempts).toBe(result.totalAttempts);
    expect(rows[0]?.correctAttempts).toBe(result.correctAttempts);
    expect(rows[0]?.priorityScore).toBeCloseTo(result.priorityScore, 5);

    const telemetryRows = await db
      .select({
        priorityScore: telemetryTable.priorityScore,
        metadata: telemetryTable.metadata,
      })
      .from(telemetryTable)
      .where(eq(telemetryTable.taskId, 'task:de:noun:kind:dative'));

    expect(telemetryRows).toHaveLength(1);
    expect(telemetryRows[0]?.priorityScore).toBeCloseTo(result.priorityScore, 5);
    expect(telemetryRows[0]?.metadata).toMatchObject({
      posAssignments: 1,
      coverageScore: result.coverageScore,
    });
  });

  it('increments coverage assignments for subsequent noun tasks on the same device', async () => {
    await seedLexeme({
      id: 'lex:de:noun:kind',
      lemma: 'Kind',
      pos: 'noun',
      gender: 'das',
      metadata: { english: 'child' },
    });
    await seedLexeme({
      id: 'lex:de:noun:freund',
      lemma: 'Freund',
      pos: 'noun',
      gender: 'der',
      metadata: { english: 'friend' },
    });

    await seedTask({
      id: 'task:de:noun:kind:dative',
      lexemeId: 'lex:de:noun:kind',
      pos: 'noun',
      taskType: 'noun_case_declension',
      prompt: {
        lemma: 'Kind',
        pos: 'noun',
        gender: 'das',
        requestedCase: 'dative',
        requestedNumber: 'plural',
        instructions: 'Setze „Kind“ in den Dativ Plural mit Artikel.',
      },
      solution: { form: 'Kindern', article: 'den' },
    });

    await seedTask({
      id: 'task:de:noun:freund:dative',
      lexemeId: 'lex:de:noun:freund',
      pos: 'noun',
      taskType: 'noun_case_declension',
      prompt: {
        lemma: 'Freund',
        pos: 'noun',
        gender: 'der',
        requestedCase: 'dative',
        requestedNumber: 'plural',
        instructions: 'Setze „Freund“ in den Dativ Plural mit Artikel.',
      },
      solution: { form: 'Freunden', article: 'den' },
    });

    const first = await recordSubmission({
      taskId: 'task:de:noun:kind:dative',
      taskType: 'noun_case_declension',
      pos: 'noun',
      deviceId: 'device-noun',
    });
    expect(first.coverageScore).toBeCloseTo(0.96, 2);

    const second = await recordSubmission({
      taskId: 'task:de:noun:freund:dative',
      taskType: 'noun_case_declension',
      pos: 'noun',
      deviceId: 'device-noun',
    });

    expect(second.coverageScore).toBeCloseTo(0.92, 2);

    const telemetryRows = await db
      .select({ metadata: telemetryTable.metadata })
      .from(telemetryTable)
      .where(eq(telemetryTable.taskId, 'task:de:noun:freund:dative'));

    expect(telemetryRows).toHaveLength(1);
    expect(telemetryRows[0]?.metadata).toMatchObject({ posAssignments: 2 });

    const nounAssignments = await db
      .select({ value: count() })
      .from(schedulingTable)
      .innerJoin(taskSpecsTable, eq(taskSpecsTable.id, schedulingTable.taskId))
      .where(eq(taskSpecsTable.pos, 'noun'));

    expect(nounAssignments[0]?.value).toBe(2);
  });

  it('handles verb submissions independently from noun coverage', async () => {
    await seedLexeme({
      id: 'lex:de:noun:kind',
      lemma: 'Kind',
      pos: 'noun',
      gender: 'das',
    });
    await seedLexeme({
      id: 'lex:de:verb:gehen',
      lemma: 'gehen',
      pos: 'verb',
      metadata: { english: 'to go' },
    });

    await seedTask({
      id: 'task:de:noun:kind:dative',
      lexemeId: 'lex:de:noun:kind',
      pos: 'noun',
      taskType: 'noun_case_declension',
      prompt: {
        lemma: 'Kind',
        pos: 'noun',
        gender: 'das',
        requestedCase: 'dative',
        requestedNumber: 'plural',
        instructions: 'Setze „Kind“ in den Dativ Plural mit Artikel.',
      },
      solution: { form: 'Kindern', article: 'den' },
    });

    await seedTask({
      id: 'task:de:verb:gehen:partizip',
      lexemeId: 'lex:de:verb:gehen',
      pos: 'verb',
      taskType: 'conjugate_form',
      prompt: {
        lemma: 'gehen',
        pos: 'verb',
        requestedForm: { tense: 'participle', mood: 'indicative', voice: 'active' },
        instructions: 'Gib das Partizip II von „gehen“ an.',
      },
      solution: { form: 'gegangen' },
    });

    await recordSubmission({
      taskId: 'task:de:noun:kind:dative',
      taskType: 'noun_case_declension',
      pos: 'noun',
      deviceId: 'device-mixed',
    });

    const verbResult = await recordSubmission({
      taskId: 'task:de:verb:gehen:partizip',
      taskType: 'conjugate_form',
      pos: 'verb',
      deviceId: 'device-mixed',
    });

    expect(verbResult.coverageScore).toBeCloseTo(0.97, 2);

    const telemetryRows = await db
      .select({ metadata: telemetryTable.metadata })
      .from(telemetryTable)
      .where(eq(telemetryTable.taskId, 'task:de:verb:gehen:partizip'));

    expect(telemetryRows).toHaveLength(1);
    expect(telemetryRows[0]?.metadata).toMatchObject({ posAssignments: 1 });
  });
});
