import path from 'node:path';
import { tmpdir } from 'node:os';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';

import { afterEach, describe, expect, it, vi } from 'vitest';
import { count, eq } from 'drizzle-orm';

import { setupTestDatabase, type TestDatabaseContext } from './helpers/pg';

async function writeBasicPosFiles(root: string): Promise<void> {
  await mkdir(path.join(root, 'data', 'pos'), { recursive: true });

  await writeFile(
    path.join(root, 'data', 'pos', 'verbs.jsonl'),
    [
      JSON.stringify({
        lemma: 'gehen',
        level: 'A1',
        english: 'to go',
        approved: true,
        examples: [{ de: 'Ich gehe.', en: 'I go.' }],
        verb: {
          separable: false,
          aux: 'sein',
          praesens: { ich: 'gehe', er: 'geht' },
          praeteritum: 'ging',
          partizipIi: 'gegangen',
          perfekt: 'ist gegangen',
        },
      }),
    ].join('\n'),
    'utf8',
  );

  await writeFile(
    path.join(root, 'data', 'pos', 'nouns.jsonl'),
    [
      JSON.stringify({
        lemma: 'das Haus',
        level: 'A1',
        english: 'house',
        approved: true,
        examples: [{ de: 'Das Haus ist groß.', en: 'The house is big.' }],
        noun: { gender: 'das', plural: 'Häuser' },
      }),
    ].join('\n'),
    'utf8',
  );
}

describe('seedDatabase', () => {
  afterEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it(
    'populates core lexeme and inflection tables only',
      async () => {
        const context: TestDatabaseContext = await setupTestDatabase();
        context.mock();

        const seedRoot = await mkdtemp(path.join(tmpdir(), 'gvm-seed-'));

        try {
          await writeBasicPosFiles(seedRoot);

          const { seedDatabase } = await import('../scripts/seed');
          const { words, lexemes, inflections, taskSpecs } = await import('../db/schema.js');

          const result = await seedDatabase(seedRoot);

          expect(result.aggregatedCount).toBeGreaterThan(0);
          expect(result.lexemeCount).toBeGreaterThan(0);
          expect(result.inflectionCount).toBeGreaterThan(0);

          const wordRows = await context.db.select({ value: count() }).from(words);
          expect(Number(wordRows[0]?.value ?? 0)).toBeGreaterThan(0);

          const lexemeRows = await context.db.select({ value: count() }).from(lexemes);
          expect(Number(lexemeRows[0]?.value ?? 0)).toBeGreaterThan(0);

          const inflectionRows = await context.db.select({ value: count() }).from(inflections);
          expect(Number(inflectionRows[0]?.value ?? 0)).toBeGreaterThan(0);

          const taskRows = await context.db.select({ value: count() }).from(taskSpecs);
          expect(Number(taskRows[0]?.value ?? 0)).toBe(0);

        } finally {
          await context.cleanup();
          await rm(seedRoot, { recursive: true, force: true });
        }
    },
    60000,
  );

  it('fails when a POS JSONL file defines the same word twice', async () => {
    const context: TestDatabaseContext = await setupTestDatabase();
    context.mock();

    const seedRoot = await mkdtemp(path.join(tmpdir(), 'gvm-seed-dupe-'));

    try {
      const posDir = path.join(seedRoot, 'data', 'pos');
      await mkdir(posDir, { recursive: true });

      const duplicateVerb = {
        lemma: 'gehen',
        level: 'A1',
        english: 'to go',
        approved: true,
        examples: [{ de: 'Ich gehe.', en: 'I go.' }],
        verb: {
          separable: false,
          aux: 'sein',
          praeteritum: 'ging',
          partizipIi: 'gegangen',
          perfekt: 'ist gegangen',
        },
      };

          await writeFile(
            path.join(posDir, 'verbs.jsonl'),
            [JSON.stringify(duplicateVerb), JSON.stringify(duplicateVerb)].join('\n'),
            'utf8',
          );

      const { seedDatabase } = await import('../scripts/seed');

      await expect(seedDatabase(seedRoot)).rejects.toThrow(/duplicate word gehen \(V\)/i);
    } finally {
      await context.cleanup();
      await rm(seedRoot, { recursive: true, force: true });
    }
  });

  it('resets seeded tables before seeding when requested', async () => {
    const context: TestDatabaseContext = await setupTestDatabase();
    context.mock();

    const seedRoot = await mkdtemp(path.join(tmpdir(), 'gvm-seed-reset-'));

    try {
      await writeBasicPosFiles(seedRoot);

      const { words, lexemes } = await import('../db/schema.js');

      await context.db.insert(words).values({
        lemma: 'sentinel',
        pos: 'V',
        approved: true,
        complete: true,
      });

      const sentinelLexemeId = 'sentinel:lexeme';
      await context.db.insert(lexemes).values({
        id: sentinelLexemeId,
        lemma: 'sentinel',
        pos: 'verb',
        metadata: {},
        sourceIds: [],
      });

      const { seedDatabase } = await import('../scripts/seed');

      const result = await seedDatabase(seedRoot, context.db, { reset: true });
      expect(result.lexemeCount).toBeGreaterThan(0);

      const sentinelWordRows = await context.db
        .select({ value: count() })
        .from(words)
        .where(eq(words.lemma, 'sentinel'));
      expect(Number(sentinelWordRows[0]?.value ?? 0)).toBe(0);

      const sentinelLexemeRows = await context.db
        .select({ value: count() })
        .from(lexemes)
        .where(eq(lexemes.id, sentinelLexemeId));
      expect(Number(sentinelLexemeRows[0]?.value ?? 0)).toBe(0);
    } finally {
      await context.cleanup();
      await rm(seedRoot, { recursive: true, force: true });
    }
  });
});
