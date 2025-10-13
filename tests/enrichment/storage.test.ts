import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const supabaseCreateClientMock = vi.hoisted(() => vi.fn());
const supabaseFromMock = vi.hoisted(() => vi.fn());
const supabaseUploadMock = vi.hoisted(() => vi.fn(async () => ({ data: null, error: null })));
const supabaseListMock = vi.hoisted(() =>
  vi.fn(async () => ({ data: [] as any[], error: null as { message: string } | null })),
);
const supabaseRemoveMock = vi.hoisted(() =>
  vi.fn(async () => ({ data: [] as any[], error: null as { message: string } | null })),
);

vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn((url: string, key: string, options: Record<string, unknown>) => {
    supabaseCreateClientMock({ url, key, options });
    return {
      storage: {
        from(bucket: string) {
          supabaseFromMock(bucket);
          return {
            upload: supabaseUploadMock,
            list: supabaseListMock,
            remove: supabaseRemoveMock,
          };
        },
      },
    };
  }),
}));

import type { EnrichmentProviderSnapshot } from '../../shared/enrichment';
import {
  loadPersistedWordData,
  persistProviderSnapshotToFile,
  listSupabaseBucketObjects,
  syncEnrichmentDirectoryToSupabase,
  clearSupabaseBucketPrefix,
  SupabaseStorageNotConfiguredError,
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
    delete process.env.SUPABASE_URL;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    delete process.env.SUPABASE_SECRET_KEY;
    delete process.env.ENRICHMENT_SUPABASE_BUCKET;
    delete process.env.ENRICHMENT_SUPABASE_PATH_PREFIX;
    supabaseCreateClientMock.mockReset();
    supabaseFromMock.mockReset();
    supabaseUploadMock.mockReset();
    supabaseListMock.mockReset();
    supabaseRemoveMock.mockReset();
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

  it('uploads provider files to Supabase storage when configuration is provided', async () => {
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

    process.env.SUPABASE_URL = 'https://example.supabase.co';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role';
    process.env.ENRICHMENT_SUPABASE_BUCKET = 'enrichment-backups';
    process.env.ENRICHMENT_SUPABASE_PATH_PREFIX = 'snapshots';

    await persistProviderSnapshotToFile(snapshot);

    expect(supabaseCreateClientMock).toHaveBeenCalledWith({
      url: 'https://example.supabase.co',
      key: 'test-service-role',
      options: {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      },
    });

    expect(supabaseFromMock).toHaveBeenCalledWith('enrichment-backups');
    expect(supabaseUploadMock).toHaveBeenCalledTimes(1);
    const [objectPath, body, options] = supabaseUploadMock.mock.calls[0] as [
      string,
      Buffer,
      { contentType: string; upsert: boolean },
    ];

    expect(objectPath).toBe('snapshots/n/wiktextract.json');
    expect(body.toString('utf8')).toContain('"lemma": "Birne"');
    expect(options).toMatchObject({ contentType: 'application/json', upsert: true });
  });

  it('lists Supabase storage objects with pagination metadata', async () => {
    process.env.SUPABASE_URL = 'https://example.supabase.co';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-key';
    process.env.ENRICHMENT_SUPABASE_BUCKET = 'enrichment-backups';
    process.env.ENRICHMENT_SUPABASE_PATH_PREFIX = 'snapshots';

    supabaseListMock.mockResolvedValueOnce({
      data: [
        {
          id: 'file-1',
          name: 'verbs.json',
          created_at: '2024-01-01T00:00:00.000Z',
          updated_at: '2024-01-02T12:30:00.000Z',
          last_accessed_at: null,
          metadata: { size: 1024 },
        },
        {
          id: null,
          name: 'nouns',
          created_at: '2024-01-01T00:00:00.000Z',
          updated_at: '2024-01-01T00:00:00.000Z',
          last_accessed_at: null,
          metadata: null,
        },
      ],
      error: null,
    });

    const result = await listSupabaseBucketObjects({ limit: 25, offset: 0, path: 'verbs' });

    expect(supabaseCreateClientMock).toHaveBeenCalledTimes(1);
    expect(supabaseFromMock).toHaveBeenCalledWith('enrichment-backups');
    expect(supabaseListMock).toHaveBeenCalledWith('snapshots/verbs', {
      limit: 25,
      offset: 0,
      sortBy: { column: 'name', order: 'asc' },
    });

    expect(result.path).toBe('snapshots/verbs');
    expect(result.items).toHaveLength(2);
    expect(result.items[0]).toMatchObject({
      id: 'file-1',
      name: 'verbs.json',
      path: 'snapshots/verbs/verbs.json',
      type: 'file',
      size: 1024,
    });
    expect(result.items[1]).toMatchObject({
      name: 'nouns',
      type: 'folder',
    });
  });

  it('cleans the Supabase storage prefix before exports', async () => {
    process.env.SUPABASE_URL = 'https://example.supabase.co';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-key';
    process.env.ENRICHMENT_SUPABASE_BUCKET = 'enrichment-backups';
    process.env.ENRICHMENT_SUPABASE_PATH_PREFIX = 'snapshots';

    const listResponses = [
      {
        data: [
          {
            id: 'file-1',
            name: 'words-latest.json',
            created_at: null,
            updated_at: null,
            last_accessed_at: null,
            metadata: { size: 2048 },
          },
        ],
        error: null,
      },
      { data: [], error: null },
    ];

    supabaseListMock.mockImplementation(async () => listResponses.shift() ?? { data: [], error: null });
    supabaseRemoveMock.mockResolvedValueOnce({
      data: [{ name: 'snapshots/words-latest.json' }],
      error: null,
    });

    const result = await clearSupabaseBucketPrefix();

    expect(supabaseListMock).toHaveBeenCalledWith('snapshots', {
      limit: 1000,
      offset: 0,
      sortBy: { column: 'name', order: 'asc' },
    });
    expect(supabaseListMock).not.toHaveBeenCalledWith('snapshots/backups', expect.anything());
    expect(supabaseRemoveMock).toHaveBeenCalledWith(['snapshots/words-latest.json']);
    expect(result.total).toBe(1);
    expect(result.deleted).toBe(1);
    expect(result.failed).toHaveLength(0);
  });

  it('throws a descriptive error when Supabase storage is not configured', async () => {
    await expect(listSupabaseBucketObjects()).rejects.toBeInstanceOf(
      SupabaseStorageNotConfiguredError,
    );

    await expect(syncEnrichmentDirectoryToSupabase()).rejects.toBeInstanceOf(
      SupabaseStorageNotConfiguredError,
    );

    await expect(clearSupabaseBucketPrefix()).rejects.toBeInstanceOf(
      SupabaseStorageNotConfiguredError,
    );
  });

  it('syncs enrichment provider files to Supabase storage', async () => {
    process.env.SUPABASE_URL = 'https://example.supabase.co';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-key';
    process.env.ENRICHMENT_SUPABASE_BUCKET = 'enrichment-backups';

    const dir = path.join(tempDir, 'data', 'enrichment', 'v');
    await mkdir(dir, { recursive: true });
    await writeFile(path.join(dir, 'wiktextract.json'), JSON.stringify({ foo: 'bar' }), 'utf8');

    const result = await syncEnrichmentDirectoryToSupabase(tempDir);

    expect(result.totalFiles).toBe(1);
    expect(result.uploaded).toBe(1);
    expect(result.failed).toHaveLength(0);
    expect(supabaseUploadMock).toHaveBeenCalledTimes(1);
    expect(supabaseUploadMock.mock.calls[0][0]).toBe('v/wiktextract.json');
  });

  it('syncs only explicit files when includeRelativePaths are provided', async () => {
    process.env.SUPABASE_URL = 'https://example.supabase.co';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-key';
    process.env.ENRICHMENT_SUPABASE_BUCKET = 'enrichment-backups';

    const dataDir = path.join(tempDir, 'data', 'enrichment');
    await mkdir(path.join(dataDir, 'v'), { recursive: true });
    await mkdir(path.join(dataDir, 'n'), { recursive: true });
    await writeFile(path.join(dataDir, 'v', 'wiktextract.json'), JSON.stringify({ foo: 'bar' }), 'utf8');
    await writeFile(path.join(dataDir, 'n', 'wiktextract.json'), JSON.stringify({ foo: 'baz' }), 'utf8');

    const result = await syncEnrichmentDirectoryToSupabase(tempDir, {
      includeRelativePaths: ['v/wiktextract.json'],
    });

    expect(result.totalFiles).toBe(1);
    expect(result.uploaded).toBe(1);
    expect(result.failed).toHaveLength(0);
    expect(supabaseUploadMock).toHaveBeenCalledTimes(1);
    expect(supabaseUploadMock.mock.calls[0][0]).toBe('v/wiktextract.json');
  });
});

