import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { Word } from '@db';
import { writeWordsBackupToDisk } from '../../scripts/enrichment/backup';

const ORIGINAL_CWD = process.cwd();

describe('words backup utilities', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(path.join(tmpdir(), 'gvm-words-backup-'));
    process.chdir(tempDir);
  });

  afterEach(async () => {
    process.chdir(ORIGINAL_CWD);
    await rm(tempDir, { recursive: true, force: true });
  });

  it('writes a complete words backup and exposes summary metadata', async () => {
    const sampleWord: Word = {
      id: 42,
      lemma: 'laufen',
      pos: 'V',
      level: 'A2',
      english: 'to run',
      exampleDe: 'Ich laufe jeden Morgen.',
      exampleEn: 'I run every morning.',
      gender: null,
      plural: null,
      separable: false,
      aux: 'sein',
      praesensIch: null,
      praesensEr: null,
      praeteritum: 'lief',
      partizipIi: 'gelaufen',
      perfekt: 'ist gelaufen',
      comparative: null,
      superlative: null,
      canonical: true,
      complete: true,
      sourcesCsv: 'manual',
      sourceNotes: null,
      translations: [{ value: 'to run', source: 'manual' }],
      examples: null,
      posAttributes: null,
      enrichmentAppliedAt: new Date('2024-01-05T10:00:00.000Z'),
      enrichmentMethod: 'manual_api',
      createdAt: new Date('2024-01-01T00:00:00.000Z'),
      updatedAt: new Date('2024-01-06T12:30:00.000Z'),
    };

    const result = await writeWordsBackupToDisk({
      rootDir: tempDir,
      fetchWords: async () => [sampleWord],
    });

    expect(result.summary.totalWords).toBe(1);
    expect(result.summary.relativePath.startsWith('backups/words-')).toBe(true);
    expect(result.summary.latestRelativePath).toBe('backups/words-latest.json');

    const latestPath = path.join(tempDir, 'data', 'enrichment', result.summary.latestRelativePath);
    const contents = JSON.parse(await readFile(latestPath, 'utf8')) as {
      schemaVersion: number;
      total: number;
      words: Array<Record<string, unknown>>;
    };

    expect(contents.total).toBe(1);
    expect(contents.words[0]).toMatchObject({
      id: 42,
      lemma: 'laufen',
      pos: 'V',
      english: 'to run',
      enrichmentMethod: 'manual_api',
    });
    expect(typeof contents.schemaVersion).toBe('number');
  });
});
