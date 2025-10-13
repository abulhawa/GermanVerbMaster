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
          await mkdir(path.join(seedRoot, 'data'), { recursive: true });
          await mkdir(path.join(seedRoot, 'docs', 'external'), { recursive: true });

          await writeFile(
            path.join(seedRoot, 'data', 'words_canonical.csv'),
            'lemma,pos\ngehen,V\n',
            'utf8',
          );

          vi.doMock('../scripts/source-loaders', async () => {
            const actual = await vi.importActual<typeof import('../scripts/source-loaders')>(
              '../scripts/source-loaders',
            );
            return {
              ...actual,
              loadManualWordRows: vi.fn(async () => [
                {
                  lemma: 'gehen',
                  pos: 'V',
                  level: 'A1',
                  english: 'to go',
                  example_de: 'Ich gehe.',
                  example_en: 'I go.',
                  praeteritum: 'ging',
                  partizip_ii: 'gegangen',
                  perfekt: 'ist gegangen',
                },
              ]),
              loadExternalWordRows: vi.fn(async () => [
                {
                  lemma: 'gehen',
                  pos: 'V',
                  level: 'A1',
                  english: 'to walk',
                  example_de: 'Wir gehen nach Hause.',
                  example_en: 'We walk home.',
                  sources_csv: 'external',
                },
              ]),
              snapshotExternalSources: vi.fn(),
            };
          });

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
