import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const s3SendMock = vi.hoisted(() => vi.fn());
const s3ClientCtorMock = vi.hoisted(() => vi.fn());
const putObjectCtorMock = vi.hoisted(() => vi.fn());

vi.mock('@aws-sdk/client-s3', () => {
  return {
    S3Client: vi.fn((config) => {
      s3ClientCtorMock(config);
      return { send: s3SendMock };
    }),
    PutObjectCommand: vi.fn((input) => {
      putObjectCtorMock(input);
      return { input };
    }),
  };
});

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
    delete process.env.ENRICHMENT_S3_BUCKET;
    delete process.env.ENRICHMENT_S3_PREFIX;
    delete process.env.ENRICHMENT_S3_REGION;
    delete process.env.ENRICHMENT_S3_ENDPOINT;
    delete process.env.ENRICHMENT_S3_FORCE_PATH_STYLE;
    s3SendMock.mockReset();
    s3ClientCtorMock.mockReset();
    putObjectCtorMock.mockReset();
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

  it('uploads provider files to S3 when configuration is provided', async () => {
    const now = new Date().toISOString();
    const snapshot: EnrichmentProviderSnapshot = {
      id: 5,
      wordId: 505,
      lemma: 'Birne',
      pos: 'N',
      providerId: 'wiktextract',
      providerLabel: 'Kaikki',
      status: 'success',
      trigger: 'apply',
      mode: 'non-canonical',
      translations: [{ value: 'pear', language: 'English', source: 'kaikki.org' }],
      examples: null,
      synonyms: [],
      englishHints: ['pear'],
      verbForms: null,
      nounForms: null,
      adjectiveForms: null,
      prepositionAttributes: null,
      rawPayload: null,
      collectedAt: now,
      createdAt: now,
    };

    process.env.ENRICHMENT_S3_BUCKET = 'test-bucket';
    process.env.ENRICHMENT_S3_PREFIX = 'snapshots';
    process.env.ENRICHMENT_S3_REGION = 'eu-central-1';

    await persistProviderSnapshotToFile(snapshot);

    expect(s3ClientCtorMock).toHaveBeenCalledWith({
      region: 'eu-central-1',
      endpoint: undefined,
      forcePathStyle: false,
    });

    expect(s3SendMock).toHaveBeenCalledTimes(1);
    const putCommandArg = putObjectCtorMock.mock.calls[0][0] as {
      Bucket: string;
      Key: string;
      Body: string;
      ContentType: string;
    };

    expect(putCommandArg.Bucket).toBe('test-bucket');
    expect(putCommandArg.Key).toBe('snapshots/n/wiktextract.json');
    expect(putCommandArg.ContentType).toBe('application/json');
    expect(putCommandArg.Body).toContain('"lemma": "Birne"');
  });
});

