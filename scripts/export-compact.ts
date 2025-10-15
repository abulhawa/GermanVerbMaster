import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { brotliCompress, constants as zlibConstants } from 'node:zlib';
import { promisify } from 'node:util';

import { db, words, type Word } from '@db';
import { and, asc, eq } from 'drizzle-orm';

import {
  buildExportPayloadForWord,
  formatPosSlug,
  loadSnapshotFragments,
  resolveLocalDirectory,
} from '../server/export-sync.js';
import { EXPORT_SCHEMA_VERSION, type ExportManifest } from '@shared';

const brotliCompressAsync = promisify(brotliCompress);

interface CompactOptions {
  pos: string;
  out?: string;
}

function parseArgs(argv: readonly string[]): CompactOptions {
  let pos: string | null = null;
  let out: string | undefined;

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (!arg) continue;

    if (arg === '--pos' || arg === '-p') {
      pos = argv[index + 1] ?? null;
      index += 1;
      continue;
    }
    if (arg.startsWith('--pos=')) {
      const [, value] = arg.split('=', 2);
      pos = value ?? null;
      continue;
    }
    if (arg === '--out' || arg === '-o') {
      out = argv[index + 1] ?? undefined;
      index += 1;
      continue;
    }
    if (arg.startsWith('--out=')) {
      const [, value] = arg.split('=', 2);
      out = value || undefined;
      continue;
    }
  }

  if (!pos || !pos.trim()) {
    throw new Error('Missing required --pos argument');
  }

  return { pos: pos.trim(), out } satisfies CompactOptions;
}

function toIsoTimestamp(date: Date): string {
  return date.toISOString();
}

async function ensureDirectory(target: string): Promise<void> {
  await fs.mkdir(target, { recursive: true });
}

async function loadManifest(manifestPath: string): Promise<ExportManifest> {
  try {
    const raw = await fs.readFile(manifestPath, 'utf8');
    const parsed = JSON.parse(raw) as ExportManifest;
    if (!parsed.schema) {
      parsed.schema = EXPORT_SCHEMA_VERSION;
    }
    return parsed;
  } catch (error) {
    if ((error as NodeJS.ErrnoException)?.code === 'ENOENT') {
      const now = new Date().toISOString();
      return {
        schema: EXPORT_SCHEMA_VERSION,
        version: 'local-dev',
        generatedAt: now,
        entries: {},
      } satisfies ExportManifest;
    }
    throw error;
  }
}

async function writeManifest(manifestPath: string, manifest: ExportManifest): Promise<void> {
  const enriched: ExportManifest = {
    ...manifest,
    schema: EXPORT_SCHEMA_VERSION,
    generatedAt: new Date().toISOString(),
  };
  await ensureDirectory(path.dirname(manifestPath));
  await fs.writeFile(manifestPath, `${JSON.stringify(enriched, null, 2)}\n`, 'utf8');
}

async function moveIfExists(fromPath: string, toPath: string): Promise<boolean> {
  try {
    await ensureDirectory(path.dirname(toPath));
    await fs.rename(fromPath, toPath);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException)?.code === 'ENOENT') {
      return false;
    }
    throw error;
  }
}

async function writeSnapshot(
  snapshotPath: string,
  payloads: readonly string[],
  compress: boolean,
): Promise<void> {
  await ensureDirectory(path.dirname(snapshotPath));
  const content = `${payloads.join('\n')}\n`;
  if (compress) {
    const buffer = await brotliCompressAsync(Buffer.from(content), {
      params: {
        [zlibConstants.BROTLI_PARAM_QUALITY]: 11,
      },
    });
    await fs.writeFile(snapshotPath, buffer);
    return;
  }
  await fs.writeFile(snapshotPath, content, 'utf8');
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  const now = new Date();
  const timestamp = now.toISOString().replace(/[-:]/g, '').replace(/\..*/, '');
  const compressSnapshots = String(process.env.COMPRESS_SNAPSHOTS ?? '').toLowerCase() === 'true';

  const pos = options.pos;
  const posSlug = formatPosSlug(pos);

  const __filename = fileURLToPath(import.meta.url);
  const repositoryRoot = path.resolve(path.dirname(__filename), '..');
  const baseLocalDir = resolveLocalDirectory(process.env.JSONL_LOCAL_DIR ?? null)
    ?? path.resolve(repositoryRoot, 'data', 'sync');

  const outputDir = (() => {
    if (options.out) {
      return path.isAbsolute(options.out)
        ? options.out
        : path.resolve(baseLocalDir, options.out);
    }
    return path.resolve(baseLocalDir, 'versions', timestamp);
  })();

  const snapshotFileName = `${posSlug}.snapshot.jsonl${compressSnapshots ? '.br' : ''}`;
  const snapshotPath = path.resolve(outputDir, snapshotFileName);

  const rows = await db
    .select()
    .from(words)
    .where(and(eq(words.pos, pos), eq(words.approved, true)))
    .orderBy(asc(words.lemma));

  if (!rows.length) {
    throw new Error(`No approved words found for POS ${pos}`);
  }

  const typedRows = rows as Word[];
  const snapshotMap = await loadSnapshotFragments(typedRows.map((row) => row.id));
  const payloadLines = typedRows.map((row) => {
    const payload = buildExportPayloadForWord(row, snapshotMap.get(row.id) ?? [], undefined);
    return JSON.stringify(payload);
  });

  await writeSnapshot(snapshotPath, payloadLines, compressSnapshots);

  const manifestPath = path.resolve(baseLocalDir, 'manifest.json');
  const manifest = await loadManifest(manifestPath);

  const nowIso = toIsoTimestamp(now);
  const relativeRootSnapshot = path.posix.join('..', 'versions', timestamp, snapshotFileName);
  const relativeRootUpdates = `./${posSlug}.updates.jsonl`;
  const entry = manifest.entries[pos] ?? {
    pos,
    snapshot: null,
    updates: null,
    snapshotGeneratedAt: null,
    lastUpdateAt: null,
  };

  entry.snapshot = relativeRootSnapshot;
  entry.updates = entry.updates ?? relativeRootUpdates;
  entry.snapshotGeneratedAt = nowIso;
  if (!entry.lastUpdateAt) {
    entry.lastUpdateAt = nowIso;
  }
  manifest.entries[pos] = entry;
  manifest.version = timestamp;
  manifest.generatedAt = nowIso;

  await writeManifest(manifestPath, manifest);

  const latestDir = path.resolve(baseLocalDir, 'latest');
  const latestManifestPath = path.resolve(latestDir, 'manifest.json');
  const latestManifest: ExportManifest = JSON.parse(JSON.stringify(manifest));
  const latestEntry = latestManifest.entries[pos]!;
  latestEntry.snapshot = relativeRootSnapshot;
  latestEntry.updates = `./updates/${posSlug}.updates.jsonl`;
  await writeManifest(latestManifestPath, latestManifest);

  const versionManifestPath = path.resolve(outputDir, 'manifest.json');
  const versionManifest: ExportManifest = JSON.parse(JSON.stringify(latestManifest));
  const versionEntry = versionManifest.entries[pos]!;
  versionEntry.snapshot = `./${snapshotFileName}`;
  versionEntry.updates = `./updates/${posSlug}.updates.jsonl`;
  versionManifest.version = timestamp;
  versionManifest.generatedAt = nowIso;
  await writeManifest(versionManifestPath, versionManifest);

  const devUpdatesPath = path.resolve(baseLocalDir, `${posSlug}.updates.jsonl`);
  const versionUpdatesPath = path.resolve(outputDir, 'updates', `${posSlug}.updates.jsonl`);
  const latestUpdatesPath = path.resolve(latestDir, 'updates', `${posSlug}.updates.jsonl`);

  const moved = await moveIfExists(devUpdatesPath, versionUpdatesPath);
  if (!moved) {
    await ensureDirectory(path.dirname(versionUpdatesPath));
    await fs.writeFile(versionUpdatesPath, '', 'utf8');
  }

  await ensureDirectory(path.dirname(devUpdatesPath));
  await fs.writeFile(devUpdatesPath, '', 'utf8');
  await ensureDirectory(path.dirname(latestUpdatesPath));
  await fs.writeFile(latestUpdatesPath, '', 'utf8');

  console.log(`Snapshot written to ${snapshotPath}`);
  console.log(`Manifest updated at ${manifestPath}`);
}

const executedDirectly = fileURLToPath(import.meta.url) === path.resolve(process.argv[1] ?? '');

if (executedDirectly) {
  main().catch((error) => {
    console.error('Failed to compact exports', error);
    process.exitCode = 1;
  });
}

export { main };
