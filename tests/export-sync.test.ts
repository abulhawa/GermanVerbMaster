import { mkdtemp, readFile, rm } from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';

import { words } from '@db';
import type { ExportManifest, ExportWordPayload } from '@shared';
import { setupTestDatabase, type TestDatabaseContext } from './helpers/pg';

let exportWordById: typeof import('../server/export-sync.js')['exportWordById'];
let getExportStatus: typeof import('../server/export-sync.js')['getExportStatus'];
let runBulkExport: typeof import('../server/export-sync.js')['runBulkExport'];

async function readJsonLines(filePath: string): Promise<ExportWordPayload[]> {
  const raw = await readFile(filePath, 'utf8');
  return raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length)
    .map((line) => JSON.parse(line) as ExportWordPayload);
}

describe('export sync helpers', () => {
  let context: TestDatabaseContext;
  let tempDir: string;
  const originalEnv = process.env.JSONL_LOCAL_DIR;

  beforeEach(async () => {
    context = await setupTestDatabase();
    context.mock();
    ({ exportWordById, getExportStatus, runBulkExport } = await import('../server/export-sync.js'));
    tempDir = await mkdtemp(path.join(tmpdir(), 'gvm-export-'));
    process.env.JSONL_LOCAL_DIR = tempDir;
  });

  afterEach(async () => {
    process.env.JSONL_LOCAL_DIR = originalEnv;
    await context.cleanup();
    await rm(tempDir, { recursive: true, force: true });
  });

  it('exports an individual word and updates the manifest', async () => {
    const [wordId] = await context.db
      .insert(words)
      .values({
        lemma: 'gehen',
        pos: 'V',
        approved: true,
        complete: true,
        english: 'to go',
        exampleDe: 'Ich gehe.',
        exampleEn: 'I go.',
      })
      .returning({ id: words.id });

    const result = await exportWordById(wordId.id);
    expect(result.wroteLocal).toBe(true);

    const updatePath = path.join(tempDir, 'v.updates.jsonl');
    const manifestPath = path.join(tempDir, 'manifest.json');

    const lines = await readJsonLines(updatePath);
    expect(lines).toHaveLength(1);
    expect(lines[0]?.op).toBe('upsert');
    expect(lines[0]?.lemma).toBe('gehen');
    expect(lines[0]?.translations?.en).toBe('to go');

    const manifestRaw = await readFile(manifestPath, 'utf8');
    const manifest = JSON.parse(manifestRaw) as ExportManifest;
    expect(manifest.entries.V?.updates).toBe('./v.updates.jsonl');
    expect(manifest.entries.V?.lastUpdateAt).toBeTruthy();

    const refreshed = await context.db.query.words.findFirst({ where: eq(words.id, wordId.id) });
    expect(refreshed?.exportedAt).not.toBeNull();
  });

  it('bulk exports multiple dirty words and reports status', async () => {
    const inserted = await context.db
      .insert(words)
      .values([
        { lemma: 'gehen', pos: 'V', approved: true, complete: true, english: 'to go' },
        { lemma: 'kommen', pos: 'V', approved: true, complete: true, english: 'to come' },
      ])
      .returning({ id: words.id });

    const statusBefore = await getExportStatus();
    expect(statusBefore.totalDirty).toBeGreaterThanOrEqual(2);

    const bulk = await runBulkExport({ pos: 'V', limit: 10 });
    expect(bulk.succeeded).toBe(2);
    expect(bulk.failed).toBe(0);

    const updatePath = path.join(tempDir, 'v.updates.jsonl');
    const lines = await readJsonLines(updatePath);
    expect(lines.length).toBe(2);

    const statusAfter = await getExportStatus();
    expect(statusAfter.totalDirty).toBe(0);

    for (const row of inserted) {
      const refreshed = await context.db.query.words.findFirst({ where: eq(words.id, row.id) });
      expect(refreshed?.exportedAt).not.toBeNull();
    }
  });
});
