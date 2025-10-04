import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'csv-parse/sync';
import { and, eq, sql } from 'drizzle-orm';

import { db } from '@db';
import { words } from '@db/schema';
import {
  loadExternalWordRows,
  loadManualWordRows,
  snapshotExternalSources,
  type ExternalPartOfSpeech,
  type ExternalWordRow,
} from './source-loaders';
import {
  type AggregatedWord,
  buildGoldenBundles,
  upsertGoldenBundles,
  writeGoldenBundlesToDisk,
} from './etl/golden';

const LEVEL_ORDER = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'] as const;
const POS_MAP = new Map<string, ExternalPartOfSpeech>([
  ['verb', 'V'],
  ['v', 'V'],
  ['v.', 'V'],
  ['nomen', 'N'],
  ['substantiv', 'N'],
  ['noun', 'N'],
  ['n', 'N'],
  ['adj', 'Adj'],
  ['adjektiv', 'Adj'],
  ['adjective', 'Adj'],
  ['adv', 'Adv'],
  ['adverb', 'Adv'],
  ['pron', 'Pron'],
  ['pronomen', 'Pron'],
  ['det', 'Det'],
  ['artikel', 'Det'],
  ['präposition', 'Präp'],
  ['prep', 'Präp'],
  ['konj', 'Konj'],
  ['konjunktion', 'Konj'],
  ['num', 'Num'],
  ['numeral', 'Num'],
  ['part', 'Part'],
  ['partikel', 'Part'],
  ['interj', 'Interj'],
  ['interjektion', 'Interj'],
]);

const EXTERNAL_POS_VALUES: readonly ExternalPartOfSpeech[] = [
  'V',
  'N',
  'Adj',
  'Adv',
  'Pron',
  'Det',
  'Präp',
  'Konj',
  'Num',
  'Part',
  'Interj',
] as const;

interface RawWordRow {
  lemma: string;
  pos: ExternalPartOfSpeech;
  level?: string | null;
  english?: string | null;
  exampleDe?: string | null;
  exampleEn?: string | null;
  gender?: string | null;
  plural?: string | null;
  separable?: boolean | null;
  aux?: string | null;
  praesensIch?: string | null;
  praesensEr?: string | null;
  praeteritum?: string | null;
  partizipIi?: string | null;
  perfekt?: string | null;
  comparative?: string | null;
  superlative?: string | null;
  sourcesCsv?: string | null;
  sourceNotes?: string | null;
}

interface AggregatedWordWithKey extends AggregatedWord {
  key: string;
}

function keyFor(lemma: string, pos: string): string {
  return `${lemma.toLowerCase()}::${pos}`;
}

function normaliseString(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  const trimmed = String(value).trim();
  return trimmed.length ? trimmed : null;
}

function normalisePos(raw: unknown): ExternalPartOfSpeech | null {
  if (raw === undefined || raw === null) return null;
  const value = String(raw).trim();
  if (!value) return null;
  if ((EXTERNAL_POS_VALUES as readonly string[]).includes(value)) {
    return value as ExternalPartOfSpeech;
  }
  const upper = value.toUpperCase();
  switch (upper) {
    case 'ADJ':
      return 'Adj';
    case 'ADV':
      return 'Adv';
    case 'PRON':
      return 'Pron';
    case 'DET':
      return 'Det';
    case 'PRÄP':
    case 'PRAEP':
      return 'Präp';
    case 'KONJ':
      return 'Konj';
    case 'NUM':
      return 'Num';
    case 'PART':
      return 'Part';
    case 'INTERJ':
      return 'Interj';
    default:
      break;
  }
  const mapped = POS_MAP.get(value.toLowerCase());
  return mapped ?? null;
}

function parseBooleanish(value: unknown): boolean | null {
  if (value === undefined || value === null) return null;
  const normalized = String(value).trim().toLowerCase();
  if (!normalized) return null;
  if (['1', 'true', 'yes', 'y', 'ja'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'n', 'nein'].includes(normalized)) return false;
  return null;
}

function normaliseLevel(level: unknown): string | null {
  const value = normaliseString(level);
  if (!value) return null;
  const upper = value.toUpperCase();
  return LEVEL_ORDER.includes(upper as (typeof LEVEL_ORDER)[number]) ? upper : value;
}

function computeCompleteness(word: RawWordRow & { pos: ExternalPartOfSpeech }): boolean {
  switch (word.pos) {
    case 'V':
      return Boolean(word.praeteritum && word.partizipIi && word.perfekt);
    case 'N':
      return Boolean(word.gender && word.plural);
    case 'Adj':
      return Boolean(word.comparative && word.superlative);
    default:
      return Boolean(word.english || word.exampleDe);
  }
}

function mapRow(row: Record<string, unknown>): RawWordRow | null {
  const lemma = normaliseString(row.lemma ?? row.Lemma);
  const rawPos = row.pos ?? row.POS ?? row.part_of_speech ?? row.PartOfSpeech;
  const pos = normalisePos(rawPos);
  if (!lemma || !pos) {
    return null;
  }

  return {
    lemma,
    pos,
    level: normaliseLevel(row.level ?? row.cefr ?? row.difficulty),
    english: normaliseString(row.english ?? row.translation ?? row.translation_en),
    exampleDe: normaliseString(row.example_de ?? row.exampleDe ?? row.example_deu),
    exampleEn: normaliseString(row.example_en ?? row.exampleEn ?? row.example_eng),
    gender: normaliseString(row.gender ?? row.article ?? row.Genus ?? row.Artikel),
    plural: normaliseString(row.plural ?? row.Plural),
    separable: parseBooleanish(row.separable ?? row.isSeparable),
    aux: normaliseString(row.aux ?? row.auxiliary),
    praesensIch: normaliseString(row.praesens_ich ?? row.praesensIch ?? row.ich_form),
    praesensEr: normaliseString(row.praesens_er ?? row.praesensEr ?? row.er_form),
    praeteritum: normaliseString(row.praeteritum ?? row.praet ?? row.präteritum),
    partizipIi: normaliseString(row.partizip_ii ?? row.partizipIi ?? row.partizip2),
    perfekt: normaliseString(row.perfekt ?? row.perfect),
    comparative: normaliseString(row.comparative ?? row.komparativ),
    superlative: normaliseString(row.superlative ?? row.superlativ),
    sourcesCsv: normaliseString(row.sources_csv ?? row.source ?? row.sources),
    sourceNotes: normaliseString(row.source_notes ?? row.notes ?? row.sourceNotes ?? row.URL),
  };
}

function mergeWord(existing: RawWordRow | null, incoming: RawWordRow): RawWordRow {
  if (!existing) return { ...incoming };
  const merged: RawWordRow = { ...existing };

  const preferredLevel = pickPreferredLevel(existing.level ?? null, incoming.level ?? null);
  merged.level = preferredLevel;

  merged.english = existing.english ?? incoming.english ?? null;
  merged.exampleDe = existing.exampleDe ?? incoming.exampleDe ?? null;
  merged.exampleEn = existing.exampleEn ?? incoming.exampleEn ?? null;
  merged.gender = existing.gender ?? incoming.gender ?? null;
  merged.plural = existing.plural ?? incoming.plural ?? null;
  merged.separable = incoming.separable ?? existing.separable ?? null;
  merged.aux = existing.aux ?? incoming.aux ?? null;
  merged.praesensIch = existing.praesensIch ?? incoming.praesensIch ?? null;
  merged.praesensEr = existing.praesensEr ?? incoming.praesensEr ?? null;
  merged.praeteritum = existing.praeteritum ?? incoming.praeteritum ?? null;
  merged.partizipIi = existing.partizipIi ?? incoming.partizipIi ?? null;
  merged.perfekt = existing.perfekt ?? incoming.perfekt ?? null;
  merged.comparative = existing.comparative ?? incoming.comparative ?? null;
  merged.superlative = existing.superlative ?? incoming.superlative ?? null;
  merged.sourcesCsv = dedupeSources(existing.sourcesCsv, incoming.sourcesCsv);
  merged.sourceNotes = dedupeSources(existing.sourceNotes, incoming.sourceNotes);

  return merged;
}

function pickPreferredLevel(existing: string | null, incoming: string | null): string | null {
  if (!existing) return incoming ?? null;
  if (!incoming) return existing;
  const existingIndex = LEVEL_ORDER.indexOf(existing as (typeof LEVEL_ORDER)[number]);
  const incomingIndex = LEVEL_ORDER.indexOf(incoming as (typeof LEVEL_ORDER)[number]);
  if (existingIndex === -1 && incomingIndex === -1) {
    return existing;
  }
  if (existingIndex === -1) return incoming;
  if (incomingIndex === -1) return existing;
  return incomingIndex < existingIndex ? incoming : existing;
}

function dedupeSources(existing: string | null | undefined, incoming: string | null | undefined): string | null {
  const values = new Set<string>();
  for (const candidate of [existing, incoming]) {
    if (!candidate) continue;
    candidate
      .split(';')
      .map((entry) => entry.trim())
      .filter(Boolean)
      .forEach((entry) => values.add(entry));
  }
  return values.size ? Array.from(values).join('; ') : null;
}

async function aggregateWords(rootDir: string): Promise<AggregatedWordWithKey[]> {
  const manualPath = path.join(rootDir, 'data', 'words_manual.csv');
  const canonicalPath = path.join(rootDir, 'data', 'words_canonical.csv');
  const externalDir = path.join(rootDir, 'docs', 'external');
  const snapshotPath = path.join(rootDir, 'data', 'words_all_sources.csv');

  const [manualRows, externalRows] = await Promise.all([
    loadManualWordRows(manualPath),
    loadExternalWordRows(externalDir),
  ]);

  const canonicalRows = await loadCanonicalRows(canonicalPath);
  const canonicalSet = new Set<string>(
    canonicalRows.map((row) => {
      const lemma = normaliseString(row.lemma);
      const pos = normalisePos(row.pos);
      if (!lemma || !pos) {
        throw new Error(`Invalid canonical record: ${JSON.stringify(row)}`);
      }
      return keyFor(lemma, pos);
    }),
  );

  const aggregated = new Map<string, RawWordRow>();
  const combinedRows: RawWordRow[] = [];

  for (const row of manualRows) {
    const mapped = mapRow(row);
    if (mapped) combinedRows.push(mapped);
  }

  for (const row of externalRows) {
    const mapped = mapRow(row as unknown as Record<string, unknown>);
    if (mapped) combinedRows.push(mapped);
  }

  const snapshotRows: ExternalWordRow[] = combinedRows.map((row) => ({
    lemma: row.lemma,
    pos: row.pos,
    level: row.level ?? undefined,
    english: row.english ?? undefined,
    example_de: row.exampleDe ?? undefined,
    example_en: row.exampleEn ?? undefined,
    gender: row.gender ?? undefined,
    plural: row.plural ?? undefined,
    separable: row.separable ?? undefined,
    aux: row.aux ?? undefined,
    praesens_ich: row.praesensIch ?? undefined,
    praesens_er: row.praesensEr ?? undefined,
    praeteritum: row.praeteritum ?? undefined,
    partizip_ii: row.partizipIi ?? undefined,
    perfekt: row.perfekt ?? undefined,
    comparative: row.comparative ?? undefined,
    superlative: row.superlative ?? undefined,
    sources_csv: row.sourcesCsv ?? undefined,
    source_notes: row.sourceNotes ?? undefined,
  }));

  await snapshotExternalSources(snapshotPath, snapshotRows);

  for (const row of combinedRows) {
    const key = keyFor(row.lemma, row.pos);
    const merged = mergeWord(aggregated.get(key) ?? null, row);
    aggregated.set(key, merged);
  }

  const wordsWithMetadata: AggregatedWordWithKey[] = [];
  for (const [key, value] of aggregated.entries()) {
    const complete = computeCompleteness(value);
    const canonical = canonicalSet.has(key);
    wordsWithMetadata.push({
      key,
      lemma: value.lemma,
      pos: value.pos as AggregatedWord['pos'],
      level: value.level ?? null,
      english: value.english ?? null,
      exampleDe: value.exampleDe ?? null,
      exampleEn: value.exampleEn ?? null,
      gender: value.gender ?? null,
      plural: value.plural ?? null,
      separable: value.separable ?? null,
      aux: value.aux ?? null,
      praesensIch: value.praesensIch ?? null,
      praesensEr: value.praesensEr ?? null,
      praeteritum: value.praeteritum ?? null,
      partizipIi: value.partizipIi ?? null,
      perfekt: value.perfekt ?? null,
      comparative: value.comparative ?? null,
      superlative: value.superlative ?? null,
      canonical,
      complete,
      sourcesCsv: value.sourcesCsv ?? null,
      sourceNotes: value.sourceNotes ?? null,
    });
  }

  return wordsWithMetadata;
}

async function loadCanonicalRows(filePath: string): Promise<Array<Record<string, string>>> {
  const content = await fs.readFile(filePath, 'utf8');
  return parse(content, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
  }) as Array<Record<string, string>>;
}

async function seedLegacyWords(wordsToUpsert: AggregatedWordWithKey[]): Promise<void> {
  const existing = await db.select({ lemma: words.lemma, pos: words.pos }).from(words);
  const desiredKeys = new Set(wordsToUpsert.map((word) => word.key));

  for (const row of existing) {
    const rowKey = keyFor(row.lemma, row.pos);
    if (!desiredKeys.has(rowKey)) {
      await db.delete(words).where(and(eq(words.lemma, row.lemma), eq(words.pos, row.pos)));
    }
  }

  for (const word of wordsToUpsert) {
    await db
      .insert(words)
      .values({
        lemma: word.lemma,
        pos: word.pos,
        level: word.level,
        english: word.english,
        exampleDe: word.exampleDe,
        exampleEn: word.exampleEn,
        gender: word.gender,
        plural: word.plural,
        separable: word.separable,
        aux: word.aux,
        praesensIch: word.praesensIch,
        praesensEr: word.praesensEr,
        praeteritum: word.praeteritum,
        partizipIi: word.partizipIi,
        perfekt: word.perfekt,
        comparative: word.comparative,
        superlative: word.superlative,
        canonical: word.canonical,
        complete: word.complete,
        sourcesCsv: word.sourcesCsv,
        sourceNotes: word.sourceNotes,
      })
      .onConflictDoUpdate({
        target: [words.lemma, words.pos],
        set: {
          level: sql`excluded.level`,
          english: sql`excluded.english`,
          exampleDe: sql`excluded.example_de`,
          exampleEn: sql`excluded.example_en`,
          gender: sql`excluded.gender`,
          plural: sql`excluded.plural`,
          separable: sql`excluded.separable`,
          aux: sql`excluded.aux`,
          praesensIch: sql`excluded.praesens_ich`,
          praesensEr: sql`excluded.praesens_er`,
          praeteritum: sql`excluded.praeteritum`,
          partizipIi: sql`excluded.partizip_ii`,
          perfekt: sql`excluded.perfekt`,
          comparative: sql`excluded.comparative`,
          superlative: sql`excluded.superlative`,
          canonical: sql`excluded.canonical`,
          complete: sql`excluded.complete`,
          sourcesCsv: sql`excluded.sources_csv`,
          sourceNotes: sql`excluded.source_notes`,
          updatedAt: sql`now()`,
        },
      });
  }
}

export async function seedDatabase(rootDir: string): Promise<{
  aggregatedCount: number;
  lexemeCount: number;
  taskCount: number;
  bundleCount: number;
}> {
  const aggregated = await aggregateWords(rootDir);
  await seedLegacyWords(aggregated);

  const bundles = buildGoldenBundles(aggregated);
  await upsertGoldenBundles(db, bundles);
  await writeGoldenBundlesToDisk(rootDir, bundles);

  const lexemeCount = bundles.reduce((sum, bundle) => sum + bundle.lexemes.length, 0);
  const taskCount = bundles.reduce((sum, bundle) => sum + bundle.tasks.length, 0);

  return {
    aggregatedCount: aggregated.length,
    lexemeCount,
    taskCount,
    bundleCount: bundles.length,
  };
}

async function main(): Promise<void> {
  const __filename = fileURLToPath(import.meta.url);
  const root = path.resolve(path.dirname(__filename), '..');

  const { aggregatedCount, lexemeCount, taskCount, bundleCount } = await seedDatabase(root);

  console.log(`Seeded ${aggregatedCount} words into legacy table.`);
  console.log(`Upserted ${lexemeCount} lexemes and ${taskCount} task specs across ${bundleCount} packs.`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  main()
    .then(() => {
      console.log('Word and task seeding completed');
    })
    .catch((error) => {
      console.error('Failed to seed content', error);
      process.exit(1);
    });
}
