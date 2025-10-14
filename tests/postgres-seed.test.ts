import path from 'node:path';
import { tmpdir } from 'node:os';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';

import { describe, expect, it, vi } from 'vitest';
import { count } from 'drizzle-orm';

import { setupTestDatabase, type TestDatabaseContext } from './helpers/pg';

describe('seedDatabase', () => {
  it(
    'populates core lexeme and task tables',
      async () => {
        const context: TestDatabaseContext = await setupTestDatabase();
        context.mock();

        const seedRoot = await mkdtemp(path.join(tmpdir(), 'gvm-seed-'));

        try {
          await mkdir(path.join(seedRoot, 'data', 'pos'), { recursive: true });

          await writeFile(
            path.join(seedRoot, 'data', 'pos', 'verbs.jsonl'),
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
                sources: { csv: 'test-source' },
              }),
            ].join('\n'),
            'utf8',
          );

          await writeFile(
            path.join(seedRoot, 'data', 'pos', 'nouns.jsonl'),
            [
              JSON.stringify({
                lemma: 'das Haus',
                level: 'A1',
                english: 'house',
                approved: true,
                examples: [{ de: 'Das Haus ist groß.', en: 'The house is big.' }],
                noun: { gender: 'das', plural: 'Häuser' },
                sources: { csv: 'test-source' },
              }),
            ].join('\n'),
            'utf8',
          );

          vi.doMock('../scripts/etl/golden', async () => {
            const actual = await vi.importActual<typeof import('../scripts/etl/golden')>(
              '../scripts/etl/golden',
            );
            return {
              ...actual,
              writeGoldenBundlesToDisk: vi.fn(),
            };
          });

          const { seedDatabase } = await import('../scripts/seed');
          const { words, lexemes, inflections, taskSpecs, packLexemeMap } = await import('../db/schema.js');

          const result = await seedDatabase(seedRoot);

          expect(result.aggregatedCount).toBeGreaterThan(0);
          expect(result.lexemeCount).toBeGreaterThan(0);
          expect(result.inflectionCount).toBeGreaterThan(0);
          expect(result.taskCount).toBeGreaterThan(0);

          const wordRows = await context.db.select({ value: count() }).from(words);
          expect(Number(wordRows[0]?.value ?? 0)).toBeGreaterThan(0);

          const lexemeRows = await context.db.select({ value: count() }).from(lexemes);
          expect(Number(lexemeRows[0]?.value ?? 0)).toBeGreaterThan(0);

          const inflectionRows = await context.db.select({ value: count() }).from(inflections);
          expect(Number(inflectionRows[0]?.value ?? 0)).toBeGreaterThan(0);

          const taskRows = await context.db.select({ value: count() }).from(taskSpecs);
          expect(Number(taskRows[0]?.value ?? 0)).toBeGreaterThan(0);

          const packMapRows = await context.db.select({ value: count() }).from(packLexemeMap);
          expect(Number(packMapRows[0]?.value ?? 0)).toBeGreaterThan(0);
        } finally {
          await context.cleanup();
          await rm(seedRoot, { recursive: true, force: true });
        }
    },
    60000,
  );
});
