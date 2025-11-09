import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { aggregateWords, keyFor } from '../../../scripts/seed/loaders/words';

async function setupPosFile(root: string, filename: string, records: unknown[]): Promise<void> {
  const posDir = path.join(root, 'data', 'pos');
  await fs.mkdir(posDir, { recursive: true });
  const content = records.map((record) => JSON.stringify(record)).join('\n');
  await fs.writeFile(path.join(posDir, filename), `${content}\n`, 'utf8');
}

describe('seed loaders', () => {
  it('creates consistent keys', () => {
    expect(keyFor('Haus', 'N')).toBe('haus::N');
  });

  it('loads and aggregates POS data from disk', async () => {
    const tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'seed-loader-test-'));

    try {
      await setupPosFile(tmpRoot, 'verbs.jsonl', [
        {
          lemma: 'laufen',
          level: 'B1',
          english: 'to run',
          verb: {
            praesens: { ich: 'laufe', er: 'läuft' },
            praeteritum: 'lief',
            partizipIi: 'gelaufen',
            perfekt: 'ist gelaufen',
          },
          examples: [
            { sentence: 'Ich laufe nach Hause.', translations: { en: 'I run home.' } },
          ],
        },
        {
          lemma: 'laufen',
          english: 'to jog',
          verb: {
            praeteritum: 'lief',
            partizipIi: 'gelaufen',
            perfekt: 'ist gelaufen',
          },
          approved: true,
        },
      ]);

      await setupPosFile(tmpRoot, 'nouns.jsonl', [
        {
          lemma: 'Haus',
          level: 'A1',
          english: 'house',
          noun: { gender: 'das', plural: 'Häuser' },
          examples: [
            { sentence: 'Das Haus ist groß.', translations: { en: 'The house is big.' } },
          ],
        },
      ]);

      const aggregated = await aggregateWords(tmpRoot);

      expect(aggregated).toHaveLength(2);
      const laufen = aggregated.find((entry) => entry.lemma === 'laufen');
      expect(laufen?.approved).toBe(true);
      expect(laufen?.complete).toBe(true);
      expect(laufen?.examples).toHaveLength(1);

      const haus = aggregated.find((entry) => entry.lemma === 'Haus');
      expect(haus?.gender).toBe('das');
      expect(haus?.plural).toBe('Häuser');
    } finally {
      await fs.rm(tmpRoot, { recursive: true, force: true });
    }
  });
});
