import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { EnrichmentProviderSnapshot } from '../../shared/enrichment';
import {
  loadPersistedWordData,
  persistProviderSnapshotToFile,
} from '../../scripts/enrichment/storage';

const ORIGINAL_CWD = process.cwd();

describe('enrichment storage', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(path.join(tmpdir(), 'gvm-enrichment-storage-'));
    process.chdir(tempDir);
  });

  afterEach(async () => {
    process.chdir(ORIGINAL_CWD);
    await rm(tempDir, { recursive: true, force: true });
  });

  it('persists snapshots under POS-specific files and retains translations/examples', async () => {
    const now = new Date().toISOString();
    const snapshot: EnrichmentProviderSnapshot = {
      id: 1,
      wordId: 101,
      lemma: 'Apfel',
      pos: 'N',
      providerId: 'wiktextract',
      providerLabel: 'Kaikki',
      status: 'success',
      trigger: 'preview',
      mode: 'non-canonical',
      translations: [
        { value: 'apple', language: 'English', source: 'kaikki.org' },
        { value: 'Apfel', language: 'German', source: 'kaikki.org' },
      ],
      examples: [
        { exampleDe: 'Der Apfel ist rot.', exampleEn: 'The apple is red.', source: 'kaikki.org' },
        { exampleDe: 'Äpfel sind lecker.', source: 'kaikki.org' },
      ],
      synonyms: ['Apfel'],
      englishHints: ['apple'],
      verbForms: null,
      nounForms: [
        {
          source: 'kaikki.org',
          genders: ['der'],
          plurals: ['Äpfel'],
          forms: [{ form: 'Äpfel', tags: ['plural', 'nominative'] }],
        },
      ],
      adjectiveForms: null,
      prepositionAttributes: [
        {
          source: 'kaikki.org',
          cases: ['Akkusativ'],
          notes: ['directional'],
        },
      ],
      rawPayload: { foo: 'bar' },
      collectedAt: now,
      createdAt: now,
    };

    await persistProviderSnapshotToFile(snapshot);

    const providerFilePath = path.join(tempDir, 'data', 'enrichment', 'n', 'wiktextract.json');
    const fileContents = JSON.parse(await readFile(providerFilePath, 'utf8')) as Record<string, unknown>;

    expect(typeof fileContents.schemaVersion).toBe('number');
    expect(fileContents.schemaVersion as number).toBeGreaterThanOrEqual(1);
    const entries = (fileContents.entries ?? {}) as Record<string, any>;
    expect(Object.keys(entries)).toContain('apfel');
    expect(entries.apfel.translations).toHaveLength(2);
    expect(entries.apfel.examples).toHaveLength(2);
    expect(entries.apfel.prepositionAttributes).toHaveLength(1);

    const persisted = await loadPersistedWordData(tempDir);
    expect(persisted).toHaveLength(1);
    expect(persisted[0]).toMatchObject({ lemma: 'Apfel', pos: 'N' });
    expect(persisted[0].providers[0].translations).toHaveLength(2);
    expect(persisted[0].providers[0].examples).toHaveLength(2);
    expect(persisted[0].providers[0].prepositionAttributes).toHaveLength(1);
  });

  it('records schema version history when upgrading legacy files', async () => {
    const legacyDir = path.join(tempDir, 'data', 'enrichment', 'v');
    await mkdir(legacyDir, { recursive: true });
    await writeFile(
      path.join(legacyDir, 'wiktextract.json'),
      JSON.stringify(
        {
          schemaVersion: 0,
          providerId: 'wiktextract',
          pos: 'V',
          entries: {
            laufen: {
              lemma: 'laufen',
              pos: 'V',
              providerId: 'wiktextract',
              status: 'success',
            },
          },
        },
        null,
        2,
      ),
      'utf8',
    );

    const now = new Date().toISOString();
    const snapshot: EnrichmentProviderSnapshot = {
      id: 2,
      wordId: 202,
      lemma: 'laufen',
      pos: 'V',
      providerId: 'wiktextract',
      providerLabel: 'Kaikki',
      status: 'success',
      trigger: 'preview',
      mode: 'non-canonical',
      translations: [{ value: 'to run', language: 'English', source: 'kaikki.org' }],
      examples: null,
      synonyms: [],
      englishHints: ['to run'],
      verbForms: [
        {
          source: 'kaikki.org',
          praeteritum: 'lief',
          partizipIi: 'gelaufen',
          auxiliaries: ['sein'],
        },
      ],
      nounForms: null,
      adjectiveForms: null,
      rawPayload: { legacy: true },
      collectedAt: now,
      createdAt: now,
    };

    await persistProviderSnapshotToFile(snapshot);

    const providerFilePath = path.join(legacyDir, 'wiktextract.json');
    const updated = JSON.parse(await readFile(providerFilePath, 'utf8')) as {
      schemaVersion: number;
      meta?: { previousSchemaVersions?: number[]; lastUpgradedAt?: string };
      entries: Record<string, any>;
    };

    expect(updated.schemaVersion).toBeGreaterThanOrEqual(1);
    expect(updated.meta?.previousSchemaVersions).toContain(0);
    expect(typeof updated.meta?.lastUpgradedAt).toBe('string');
    expect(updated.entries.laufen.verbForms[0].praeteritum).toBe('lief');
  });
});

