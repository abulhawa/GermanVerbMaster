import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { brotliDecompress } from 'node:zlib';
import { promisify } from 'node:util';

import { db, words } from '@db';
import { eq } from 'drizzle-orm';

import { resolveLocalDirectory } from '../server/export-sync.js';
import {
  EXPORT_SCHEMA_VERSION,
  type ExportManifest,
  type ExportOperation,
  type ExportWordPayload,
} from '@shared';
import type { WordExample, WordTranslation, WordPosAttributes } from '@shared';

const brotliDecompressAsync = promisify(brotliDecompress);

interface SeedJsonlOptions {
  pos?: string;
  manifest?: string;
  source: 'local';
  snapshotOnly: boolean;
}

interface SeedSummary {
  inserted: number;
  updated: number;
  deleted: number;
}

function parseSeedArgs(argv: readonly string[]): SeedJsonlOptions {
  let pos: string | undefined;
  let manifest: string | undefined;
  let source: 'local' = 'local';
  let snapshotOnly = false;

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (!arg) continue;

    if (arg === '--pos' || arg === '-p') {
      pos = argv[index + 1] ?? undefined;
      index += 1;
      continue;
    }
    if (arg.startsWith('--pos=')) {
      const [, value] = arg.split('=', 2);
      pos = value || undefined;
      continue;
    }
    if (arg === '--manifest' || arg === '-m') {
      manifest = argv[index + 1] ?? undefined;
      index += 1;
      continue;
    }
    if (arg.startsWith('--manifest=')) {
      const [, value] = arg.split('=', 2);
      manifest = value || undefined;
      continue;
    }
    if (arg === '--source') {
      const value = (argv[index + 1] ?? '').toLowerCase();
      index += 1;
      if (value && value !== 'local') {
        throw new Error(`Unsupported source: ${value}`);
      }
      source = 'local';
      continue;
    }
    if (arg.startsWith('--source=')) {
      const [, valueRaw] = arg.split('=', 2);
      const value = (valueRaw ?? '').toLowerCase();
      if (value && value !== 'local') {
        throw new Error(`Unsupported source: ${value}`);
      }
      source = 'local';
      continue;
    }
    if (arg === '--snapshot-only') {
      snapshotOnly = true;
      continue;
    }
    if (arg === '--no-snapshot-only') {
      snapshotOnly = false;
      continue;
    }
  }

  return { pos: pos?.trim() || undefined, manifest, source, snapshotOnly } satisfies SeedJsonlOptions;
}

async function loadManifest(manifestPath: string): Promise<ExportManifest> {
  const raw = await fs.readFile(manifestPath, 'utf8');
  const parsed = JSON.parse(raw) as ExportManifest;
  if (!parsed.schema || parsed.schema !== EXPORT_SCHEMA_VERSION) {
    throw new Error(`Unsupported manifest schema: ${parsed.schema ?? 'unknown'}`);
  }
  return parsed;
}

function selectEntry(manifest: ExportManifest, pos: string | undefined): [string, ExportManifest['entries'][string]][] {
  const entries = Object.entries(manifest.entries);
  if (!pos) {
    return entries;
  }
  const entry = manifest.entries[pos];
  if (!entry) {
    throw new Error(`Manifest does not include POS ${pos}`);
  }
  return [[pos, entry]];
}

async function readJsonl(filePath: string): Promise<ExportWordPayload[]> {
  const ext = path.extname(filePath);
  if (ext === '.br') {
    const compressed = await fs.readFile(filePath);
    const buffer = await brotliDecompressAsync(compressed);
    const text = buffer.toString('utf8');
    return text
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line.length)
      .map((line) => JSON.parse(line) as ExportWordPayload);
  }

  const raw = await fs.readFile(filePath, 'utf8');
  return raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length)
    .map((line) => JSON.parse(line) as ExportWordPayload);
}

function deriveExamples(payload: ExportWordPayload): {
  list: WordExample[] | null;
  primaryDe: string | null;
  primaryEn: string | null;
} {
  const mapped: WordExample[] = [];
  let primaryDe: string | null = null;
  let primaryEn: string | null = null;

  for (const example of payload.examples ?? []) {
    const sentenceDe = example.sentence.de ?? null;
    const translationEn = example.translations.en ?? Object.values(example.translations)[0] ?? null;
    const wordExample: WordExample = {
      sentence: sentenceDe,
      translations: translationEn ? { en: translationEn } : null,
      exampleDe: sentenceDe,
      exampleEn: translationEn,
    };
    mapped.push(wordExample);

    if (!primaryDe && sentenceDe) {
      primaryDe = sentenceDe;
      primaryEn = translationEn ?? null;
    }
  }

  return {
    list: mapped.length ? mapped : null,
    primaryDe,
    primaryEn,
  };
}

function deriveTranslations(payload: ExportWordPayload): {
  array: WordTranslation[] | null;
  english: string | null;
} {
  const translations = payload.translations ?? {};
  const entries = Object.entries(translations);
  if (!entries.length) {
    return { array: null, english: null };
  }
  const mapped: WordTranslation[] = entries.map(([language, value]) => ({
    value,
    language,
    source: null,
    confidence: null,
  }));
  const english = translations.en ?? null;
  return { array: mapped.length ? mapped : null, english };
}

function deriveForms(
  payload: ExportWordPayload,
): {
  level: string | null;
  gender: string | null;
  plural: string | null;
  separable: boolean | null;
  aux: string | null;
  praesensIch: string | null;
  praesensEr: string | null;
  praeteritum: string | null;
  partizipIi: string | null;
  perfekt: string | null;
  comparative: string | null;
  superlative: string | null;
  posAttributes: WordPosAttributes | null;
} {
  const forms = payload.forms ?? {};
  const attributes = (forms.attributes ?? null) as WordPosAttributes | null;
  const asString = (value: unknown): string | null => (typeof value === 'string' && value.trim().length ? value : null);
  const asBoolean = (value: unknown): boolean | null => (typeof value === 'boolean' ? value : null);

  return {
    level: payload.level ?? null,
    gender: asString((forms as any).gender),
    plural: asString((forms as any).plural),
    separable: asBoolean((forms as any).separable),
    aux: asString((forms as any).auxiliary),
    praesensIch: asString((forms as any).praesensIch),
    praesensEr: asString((forms as any).praesensEr),
    praeteritum: asString((forms as any).praeteritum),
    partizipIi: asString((forms as any).partizipIi),
    perfekt: asString((forms as any).perfekt),
    comparative: asString((forms as any).comparative),
    superlative: asString((forms as any).superlative),
    posAttributes: attributes,
  };
}

async function applyUpsert(payload: ExportWordPayload): Promise<'inserted' | 'updated'> {
  const { array: translations, english } = deriveTranslations(payload);
  const { list: examples, primaryDe, primaryEn } = deriveExamples(payload);
  const forms = deriveForms(payload);
  const updatedAt = new Date(payload.lastUpdated);

  const insertValues = {
    lemma: payload.lemma,
    pos: payload.pos,
    level: forms.level,
    english,
    exampleDe: primaryDe,
    exampleEn: primaryEn,
    gender: forms.gender,
    plural: forms.plural,
    separable: forms.separable,
    aux: forms.aux,
    praesensIch: forms.praesensIch,
    praesensEr: forms.praesensEr,
    praeteritum: forms.praeteritum,
    partizipIi: forms.partizipIi,
    perfekt: forms.perfekt,
    comparative: forms.comparative,
    superlative: forms.superlative,
    approved: payload.approved,
    complete: payload.complete,
    translations,
    examples,
    posAttributes: forms.posAttributes,
    exportUid: payload.wordId,
    exportedAt: null,
    createdAt: updatedAt,
    updatedAt,
  } satisfies typeof words.$inferInsert;

  const updateValues = {
    lemma: payload.lemma,
    pos: payload.pos,
    level: forms.level,
    english,
    exampleDe: primaryDe,
    exampleEn: primaryEn,
    gender: forms.gender,
    plural: forms.plural,
    separable: forms.separable,
    aux: forms.aux,
    praesensIch: forms.praesensIch,
    praesensEr: forms.praesensEr,
    praeteritum: forms.praeteritum,
    partizipIi: forms.partizipIi,
    perfekt: forms.perfekt,
    comparative: forms.comparative,
    superlative: forms.superlative,
    approved: payload.approved,
    complete: payload.complete,
    translations,
    examples,
    posAttributes: forms.posAttributes,
    exportedAt: null,
    updatedAt,
  } satisfies Partial<typeof words.$inferInsert>;

  const existing = await db.query.words.findFirst({ where: eq(words.exportUid, payload.wordId) });
  if (existing) {
    await db.update(words).set(updateValues).where(eq(words.exportUid, payload.wordId));
    return 'updated';
  }

  await db.insert(words).values(insertValues);
  return 'inserted';
}

async function applyDelete(wordId: string): Promise<number> {
  const result = await db.delete(words).where(eq(words.exportUid, wordId));
  return result.rowCount ?? 0;
}

async function seedFromEntry(
  manifestDir: string,
  pos: string,
  entry: ExportManifest['entries'][string],
  snapshotOnly: boolean,
): Promise<SeedSummary> {
  const summary: SeedSummary = { inserted: 0, updated: 0, deleted: 0 };
  if (!entry.snapshot) {
    throw new Error(`Manifest entry for ${pos} is missing a snapshot reference`);
  }

  const snapshotPath = path.resolve(manifestDir, entry.snapshot);
  const snapshotPayloads = await readJsonl(snapshotPath);

  for (const payload of snapshotPayloads) {
    const outcome = await applyUpsert(payload);
    summary[outcome] += 1;
  }

  if (!snapshotOnly && entry.updates) {
    const updatesPath = path.resolve(manifestDir, entry.updates);
    try {
      const updatePayloads = await readJsonl(updatesPath);
      for (const payload of updatePayloads) {
        const op: ExportOperation = payload.op ?? 'upsert';
        if (op === 'delete') {
          summary.deleted += await applyDelete(payload.wordId);
          continue;
        }
        const outcome = await applyUpsert(payload);
        summary[outcome] += 1;
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException)?.code !== 'ENOENT') {
        throw error;
      }
    }
  }

  return summary;
}

async function main(): Promise<void> {
  const options = parseSeedArgs(process.argv.slice(2));
  if (options.source !== 'local') {
    throw new Error('Only local source is supported currently');
  }

  const __filename = fileURLToPath(import.meta.url);
  const repositoryRoot = path.resolve(path.dirname(__filename), '..');
  const baseLocalDir = resolveLocalDirectory(process.env.JSONL_LOCAL_DIR ?? null)
    ?? path.resolve(repositoryRoot, 'data', 'sync');
  const manifestPath = options.manifest
    ? path.resolve(options.manifest)
    : path.resolve(baseLocalDir, 'latest', 'manifest.json');
  const manifestDir = path.dirname(manifestPath);

  const manifest = await loadManifest(manifestPath);
  const entries = selectEntry(manifest, options.pos);

  const combined: SeedSummary = { inserted: 0, updated: 0, deleted: 0 };

  for (const [pos, entry] of entries) {
    const summary = await seedFromEntry(manifestDir, pos, entry, options.snapshotOnly);
    combined.inserted += summary.inserted;
    combined.updated += summary.updated;
    combined.deleted += summary.deleted;
  }

  console.log('Seeding complete:', combined);
}

const executedDirectly = fileURLToPath(import.meta.url) === path.resolve(process.argv[1] ?? '');

if (executedDirectly) {
  main().catch((error) => {
    console.error('Failed to seed from JSONL', error);
    process.exitCode = 1;
  });
}

export { main };
