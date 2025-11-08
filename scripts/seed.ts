import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { sql } from 'drizzle-orm';

import { getDb, getPool } from '@db';
import { words, lexemes as lexemesTable, inflections as inflectionsTable } from '@db/schema';
import { buildLexemeInventory, upsertLexemeInventory } from './etl/golden';
import type { AggregatedWord } from './etl/types';
import type {
  EnrichmentMethod,
  PartOfSpeech,
  WordExample,
  WordPosAttributes,
  WordTranslation,
} from '@shared/types';
import { normalizeWordExample } from '@shared/examples';
import { applyMigrations } from './db-push';
import { chunkArray } from './etl/utils';

type DatabaseClient = ReturnType<typeof getDb>;

let cachedDb: DatabaseClient | null = null;

function ensureDatabase(): DatabaseClient {
  if (!cachedDb) {
    cachedDb = getDb();
  }

  return cachedDb;
}

async function ensureLegacySchema(db: DatabaseClient): Promise<void> {
  await db.execute(sql`ALTER TABLE words ADD COLUMN IF NOT EXISTS pos_attributes JSONB`);
}

export interface SeedOptions {
  reset?: boolean;
}

function parseBooleanOption(value: string | undefined): boolean {
  if (!value) {
    return true;
  }
  const normalised = value.trim().toLowerCase();
  if (normalised === '' || normalised === 'true' || normalised === '1' || normalised === 'yes') {
    return true;
  }
  if (normalised === 'false' || normalised === '0' || normalised === 'no') {
    return false;
  }
  return true;
}

export function parseSeedOptions(argv: readonly string[]): SeedOptions {
  let reset = false;
  for (const raw of argv) {
    if (!raw || raw === '--') {
      continue;
    }
    if (raw === '--reset' || raw === '-r') {
      reset = true;
      continue;
    }
    if (raw === '--no-reset') {
      reset = false;
      continue;
    }
    if (raw.startsWith('--reset=')) {
      const [, value] = raw.split('=');
      reset = parseBooleanOption(value);
    }
  }

  return { reset } satisfies SeedOptions;
}

async function resetSeededContent(db: DatabaseClient): Promise<void> {
  await db.transaction(async (tx) => {
    await tx.delete(inflectionsTable);
    await tx.delete(lexemesTable);
    await tx.delete(words);
  });
}

const LEVEL_ORDER = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'] as const;
const WORDS_BATCH_SIZE = 500;
const POS_MAP = new Map<string, PartOfSpeech>([
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

const EXTERNAL_POS_VALUES: readonly PartOfSpeech[] = [
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
  pos: PartOfSpeech;
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
  translations?: WordTranslation[] | null;
  examples?: WordExample[] | null;
  posAttributes?: WordPosAttributes | null;
  enrichmentAppliedAt?: string | null;
  enrichmentMethod?: EnrichmentMethod | null;
  approved?: boolean | null;
}

interface PosJsonExample {
  de?: string | null;
  en?: string | null;
  exampleDe?: string | null;
  exampleEn?: string | null;
  source?: string | null;
}

interface BasePosJsonRecord {
  lemma: unknown;
  level?: unknown;
  english?: unknown;
  approved?: unknown;
  examples?: unknown;
  example?: unknown;
  example_de?: unknown;
  example_en?: unknown;
}

function createExampleFallback(record: BasePosJsonRecord | null): FallbackExampleInput | null {
  if (!record) {
    return null;
  }

  const raw = record as Record<string, unknown>;
  const exampleDe = raw['example_de'] ?? raw.exampleDe;
  const exampleEn = raw['example_en'] ?? raw.exampleEn;
  const exampleValue = raw.example;

  if (
    (typeof exampleDe === 'string' && exampleDe.trim()) ||
    (typeof exampleEn === 'string' && exampleEn.trim()) ||
    (exampleValue && typeof exampleValue === 'object')
  ) {
    return {
      exampleDe,
      exampleEn,
      example: exampleValue,
    } satisfies FallbackExampleInput;
  }

  return null;
}

interface VerbJsonRecord extends BasePosJsonRecord {
  verb?: {
    separable?: unknown;
    aux?: unknown;
    praesens?: {
      ich?: unknown;
      er?: unknown;
    };
    praeteritum?: unknown;
    partizipIi?: unknown;
    perfekt?: unknown;
  };
}

interface NounJsonRecord extends BasePosJsonRecord {
  noun?: {
    gender?: unknown;
    plural?: unknown;
  };
}

interface AdjectiveJsonRecord extends BasePosJsonRecord {
  adjective?: {
    comparative?: unknown;
    superlative?: unknown;
  };
}

interface AdverbJsonRecord extends BasePosJsonRecord {
  adverb?: {
    comparative?: unknown;
    superlative?: unknown;
  };
}

interface PrepositionJsonRecord extends BasePosJsonRecord {
  preposition?: {
    cases?: unknown;
    notes?: unknown;
  };
}

type PosJsonRecord =
  | VerbJsonRecord
  | NounJsonRecord
  | AdjectiveJsonRecord
  | AdverbJsonRecord
  | PrepositionJsonRecord
  | BasePosJsonRecord;

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

function normaliseBoolean(value: unknown): boolean | null {
  if (value === undefined || value === null) return null;
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') return parseBooleanish(value);
  if (typeof value === 'number') return value === 1 ? true : value === 0 ? false : null;
  return null;
}

interface FallbackExampleInput {
  exampleDe?: unknown;
  exampleEn?: unknown;
  example?: unknown;
}

function normaliseExamples(
  rawExamples: unknown,
  fallback: FallbackExampleInput | null = null,
): { exampleDe: string | null; exampleEn: string | null; examples: WordExample[] | null } {
  const fallbackExample = resolveFallbackExample(fallback);
  const normalizedEntries: WordExample[] = Array.isArray(rawExamples)
    ? (rawExamples as unknown[])
        .map((entry) => normalizeWordExample(entry as WordExample))
        .filter((entry): entry is WordExample => Boolean(entry))
    : [];

  const canonical = fallbackExample ?? normalizedEntries[0] ?? null;
  const deduped: WordExample[] = [];
  const seen = new Set<string>();

  const pushExample = (entry: WordExample | null): void => {
    if (!entry) {
      return;
    }

    const sentence = normaliseString(entry.sentence ?? null);
    const english = normaliseString(entry.translations?.en ?? null);
    const key = `${sentence ?? ''}::${english ?? ''}`;
    if (seen.has(key)) {
      return;
    }
    seen.add(key);

    const nextTranslations = entry.translations ? { ...entry.translations } : english ? { en: english } : null;
    if (nextTranslations && english) {
      nextTranslations.en = english;
    }

    deduped.push({
      sentence: sentence ?? entry.sentence ?? null,
      translations: nextTranslations,
    });
  };

  pushExample(fallbackExample);
  for (const entry of normalizedEntries) {
    pushExample(entry);
  }

  const resolvedCanonical = canonical ?? deduped[0] ?? null;

  return {
    exampleDe: resolvedCanonical?.sentence ?? null,
    exampleEn: resolvedCanonical?.translations?.en ?? null,
    examples: deduped.length ? deduped : null,
  };
}

function resolveFallbackExample(input: FallbackExampleInput | null): WordExample | null {
  if (!input) {
    return null;
  }

  const exampleRecord = isRecord(input.example) ? (input.example as Record<string, unknown>) : null;
  const deValue = pickFirstString([
    input.exampleDe,
    exampleRecord?.exampleDe,
    exampleRecord?.example_de,
    exampleRecord?.de,
    exampleRecord?.sentence,
  ]);
  const enValue = pickFirstString([
    input.exampleEn,
    exampleRecord?.exampleEn,
    exampleRecord?.example_en,
    exampleRecord?.en,
  ]);

  if (!deValue && !enValue) {
    return null;
  }

  return {
    sentence: deValue ?? null,
    translations: enValue ? { en: enValue } : null,
  } satisfies WordExample;
}

function pickFirstString(values: Array<unknown>): string | null {
  for (const value of values) {
    const normalized = normaliseString(value);
    if (normalized) {
      return normalized;
    }
  }
  return null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object');
}

function normalisePos(raw: unknown): PartOfSpeech | null {
  if (raw === undefined || raw === null) return null;
  const value = String(raw).trim();
  if (!value) return null;
  if ((EXTERNAL_POS_VALUES as readonly string[]).includes(value)) {
    return value as PartOfSpeech;
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

function computeCompleteness(word: RawWordRow & { pos: PartOfSpeech }): boolean {
  const english = word.english ?? null;
  const exampleDe = word.exampleDe ?? null;
  const exampleEn = word.exampleEn ?? null;
  const examples = word.examples ?? [];
  const hasExamplePair = Boolean(
    exampleDe?.trim() && exampleEn?.trim()
    || examples.some((entry) => entry?.exampleDe?.trim() && entry?.exampleEn?.trim()),
  );
  if (!english || !english.trim()) {
    return false;
  }
  if (!hasExamplePair) {
    return false;
  }
  switch (word.pos) {
    case 'V':
      return Boolean(word.praeteritum && word.partizipIi && word.perfekt);
    case 'N':
      return Boolean(word.gender && word.plural);
    case 'Adj':
      return Boolean(word.comparative && word.superlative);
    default:
      return true;
  }
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
  merged.translations = mergeTranslations(existing.translations, incoming.translations);
  merged.examples = mergeExamples(existing.examples, incoming.examples);
  merged.posAttributes = mergeWordPosAttributes(existing.posAttributes, incoming.posAttributes);
  merged.enrichmentAppliedAt = pickLatestTimestamp(
    existing.enrichmentAppliedAt ?? null,
    incoming.enrichmentAppliedAt ?? null,
  );
  merged.enrichmentMethod = existing.enrichmentMethod ?? incoming.enrichmentMethod ?? null;
  if (incoming.approved !== undefined && incoming.approved !== null) {
    merged.approved = incoming.approved;
  } else if (merged.approved === undefined) {
    merged.approved = existing.approved ?? null;
  }

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

function mergeTranslations(
  existing: WordTranslation[] | null | undefined,
  incoming: WordTranslation[] | null | undefined,
): WordTranslation[] | null {
  const combined = [...(existing ?? []), ...(incoming ?? [])];
  if (!combined.length) {
    return null;
  }
  const seen = new Set<string>();
  const deduped: WordTranslation[] = [];
  for (const entry of combined) {
    if (!entry || typeof entry.value !== 'string') {
      continue;
    }
    const value = entry.value.trim();
    if (!value) {
      continue;
    }
    const source = entry.source?.trim() ?? null;
    const language = entry.language?.trim() ?? null;
    const confidence = typeof entry.confidence === 'number' ? entry.confidence : null;
    const key = `${value.toLowerCase()}::${source ?? ''}::${language ?? ''}::${confidence ?? ''}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    deduped.push({ value, source, language, confidence });
  }
  return deduped.length ? deduped : null;
}

function mergeExamples(
  existing: WordExample[] | null | undefined,
  incoming: WordExample[] | null | undefined,
): WordExample[] | null {
  const combined = [...(existing ?? []), ...(incoming ?? [])];
  if (!combined.length) {
    return null;
  }
  const seen = new Set<string>();
  const deduped: WordExample[] = [];
  for (const entry of combined) {
    const normalized = normalizeWordExample(entry);
    if (!normalized) {
      continue;
    }
    const sentence = (normalized.sentence ?? normalized.exampleDe ?? '').trim().toLowerCase();
    const translations: Array<readonly [string, string]> = [];
    if (normalized.translations) {
      for (const [language, value] of Object.entries(normalized.translations)) {
        if (typeof value !== 'string') {
          continue;
        }
        const trimmedLanguage = language.trim().toLowerCase();
        const trimmedValue = value.trim().toLowerCase();
        if (!trimmedLanguage || !trimmedValue) {
          continue;
        }
        translations.push([trimmedLanguage, trimmedValue]);
      }
      translations.sort((a, b) => a[0].localeCompare(b[0]));
    }
    const key = JSON.stringify([sentence, translations]);
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    deduped.push(normalized);
  }
  return deduped.length ? deduped : null;
}

function normalizeStringArray(values: Array<string | null | undefined>): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const trimmed = value?.trim();
    if (!trimmed) {
      continue;
    }
    const key = trimmed.toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      result.push(trimmed);
    }
  }
  return result;
}

function mergeWordPosAttributes(
  existing: WordPosAttributes | null | undefined,
  incoming: WordPosAttributes | null | undefined,
): WordPosAttributes | null {
  const next: WordPosAttributes = {};
  const existingPos = existing?.pos ?? null;
  const incomingPos = incoming?.pos ?? null;
  if (existingPos?.trim()) {
    next.pos = existingPos.trim();
  } else if (incomingPos?.trim()) {
    next.pos = incomingPos.trim();
  }

  const collectPrepositionValues = (
    source: WordPosAttributes | null | undefined,
    targetCases: Set<string>,
    targetNotes: Set<string>,
  ) => {
    if (!source?.preposition) return;
    for (const value of source.preposition.cases ?? []) {
      const trimmed = value?.trim();
      if (trimmed) {
        targetCases.add(trimmed);
      }
    }
    for (const value of source.preposition.notes ?? []) {
      const trimmed = value?.trim();
      if (trimmed) {
        targetNotes.add(trimmed);
      }
    }
  };

  const caseValues = new Set<string>();
  const noteValues = new Set<string>();
  collectPrepositionValues(existing, caseValues, noteValues);
  collectPrepositionValues(incoming, caseValues, noteValues);

  if (caseValues.size || noteValues.size) {
    const preposition: NonNullable<WordPosAttributes["preposition"]> = {};
    if (caseValues.size) {
      preposition.cases = Array.from(caseValues.values()).sort((a, b) => a.localeCompare(b));
    }
    if (noteValues.size) {
      preposition.notes = Array.from(noteValues.values()).sort((a, b) => a.localeCompare(b));
    }
    next.preposition = preposition;
  }

  const mergedTags = normalizeStringArray([...(existing?.tags ?? []), ...(incoming?.tags ?? [])]);
  if (mergedTags.length) {
    next.tags = mergedTags.sort((a, b) => a.localeCompare(b));
  }
  const mergedNotes = normalizeStringArray([...(existing?.notes ?? []), ...(incoming?.notes ?? [])]);
  if (mergedNotes.length) {
    next.notes = mergedNotes.sort((a, b) => a.localeCompare(b));
  }

  return Object.keys(next).length ? next : null;
}

interface PosFileDefinition {
  filename: string;
  pos: PartOfSpeech;
  map(record: PosJsonRecord): RawWordRow | null;
}

const POS_FILE_DEFINITIONS: PosFileDefinition[] = [
  {
    filename: 'verbs.jsonl',
    pos: 'V',
    map: (record) => {
      const data = record as VerbJsonRecord;
      const lemma = normaliseString(data.lemma);
      if (!lemma) return null;

      const { exampleDe, exampleEn, examples } = normaliseExamples(data.examples, createExampleFallback(data));
      const verb = (data.verb ?? {}) as NonNullable<VerbJsonRecord['verb']>;
      const praesens = (verb.praesens ?? {}) as { ich?: unknown; er?: unknown };

      return {
        lemma,
        pos: 'V',
        level: normaliseLevel(data.level),
        english: normaliseString(data.english),
        exampleDe,
        exampleEn,
        gender: null,
        plural: null,
        separable: normaliseBoolean(verb.separable),
        aux: normaliseString(verb.aux),
        praesensIch: normaliseString(praesens.ich),
        praesensEr: normaliseString(praesens.er),
        praeteritum: normaliseString(verb.praeteritum),
        partizipIi: normaliseString(verb.partizipIi),
        perfekt: normaliseString(verb.perfekt),
        comparative: null,
        superlative: null,
        translations: null,
        examples,
        posAttributes: null,
        enrichmentAppliedAt: null,
        enrichmentMethod: null,
        approved: normaliseBoolean(data.approved) ?? false,
      } satisfies RawWordRow;
    },
  },
  {
    filename: 'nouns.jsonl',
    pos: 'N',
    map: (record) => {
      const data = record as NounJsonRecord;
      const lemma = normaliseString(data.lemma);
      if (!lemma) return null;

      const { exampleDe, exampleEn, examples } = normaliseExamples(data.examples, createExampleFallback(data));
      const noun = (data.noun ?? {}) as NonNullable<NounJsonRecord['noun']>;

      return {
        lemma,
        pos: 'N',
        level: normaliseLevel(data.level),
        english: normaliseString(data.english),
        exampleDe,
        exampleEn,
        gender: normaliseString(noun.gender),
        plural: normaliseString(noun.plural),
        separable: null,
        aux: null,
        praesensIch: null,
        praesensEr: null,
        praeteritum: null,
        partizipIi: null,
        perfekt: null,
        comparative: null,
        superlative: null,
        translations: null,
        examples,
        posAttributes: null,
        enrichmentAppliedAt: null,
        enrichmentMethod: null,
        approved: normaliseBoolean(data.approved) ?? false,
      } satisfies RawWordRow;
    },
  },
  {
    filename: 'adjectives.jsonl',
    pos: 'Adj',
    map: (record) => {
      const data = record as AdjectiveJsonRecord;
      const lemma = normaliseString(data.lemma);
      if (!lemma) return null;

      const { exampleDe, exampleEn, examples } = normaliseExamples(data.examples, createExampleFallback(data));
      const adjective = (data.adjective ?? {}) as NonNullable<AdjectiveJsonRecord['adjective']>;

      return {
        lemma,
        pos: 'Adj',
        level: normaliseLevel(data.level),
        english: normaliseString(data.english),
        exampleDe,
        exampleEn,
        gender: null,
        plural: null,
        separable: null,
        aux: null,
        praesensIch: null,
        praesensEr: null,
        praeteritum: null,
        partizipIi: null,
        perfekt: null,
        comparative: normaliseString(adjective.comparative),
        superlative: normaliseString(adjective.superlative),
        translations: null,
        examples,
        posAttributes: null,
        enrichmentAppliedAt: null,
        enrichmentMethod: null,
        approved: normaliseBoolean(data.approved) ?? false,
      } satisfies RawWordRow;
    },
  },
  {
    filename: 'adverbs.jsonl',
    pos: 'Adv',
    map: (record) => {
      const data = record as AdverbJsonRecord;
      const lemma = normaliseString(data.lemma);
      if (!lemma) return null;

      const { exampleDe, exampleEn, examples } = normaliseExamples(data.examples, createExampleFallback(data));
      const adverb = (data.adverb ?? {}) as NonNullable<AdverbJsonRecord['adverb']>;

      return {
        lemma,
        pos: 'Adv',
        level: normaliseLevel(data.level),
        english: normaliseString(data.english),
        exampleDe,
        exampleEn,
        gender: null,
        plural: null,
        separable: null,
        aux: null,
        praesensIch: null,
        praesensEr: null,
        praeteritum: null,
        partizipIi: null,
        perfekt: null,
        comparative: normaliseString(adverb.comparative),
        superlative: normaliseString(adverb.superlative),
        translations: null,
        examples,
        posAttributes: null,
        enrichmentAppliedAt: null,
        enrichmentMethod: null,
        approved: normaliseBoolean(data.approved) ?? false,
      } satisfies RawWordRow;
    },
  },
  {
    filename: 'prepositions.jsonl',
    pos: 'Präp',
    map: (record) => {
      const data = record as PrepositionJsonRecord;
      const lemma = normaliseString(data.lemma);
      if (!lemma) return null;

      const { exampleDe, exampleEn, examples } = normaliseExamples(data.examples, createExampleFallback(data));
      const preposition = (data.preposition ?? {}) as NonNullable<PrepositionJsonRecord['preposition']>;

      const caseValues = normalizeStringArray(
        Array.isArray(preposition.cases)
          ? (preposition.cases as unknown[]).map((value) =>
              value === null || value === undefined ? null : String(value),
            )
          : [],
      );
      const noteValues = normalizeStringArray(
        Array.isArray(preposition.notes)
          ? (preposition.notes as unknown[]).map((value) =>
              value === null || value === undefined ? null : String(value),
            )
          : [],
      );
      const posAttributes: WordPosAttributes = {
        pos: 'Präp',
        preposition:
          caseValues.length || noteValues.length
            ? {
                cases: caseValues.length ? caseValues : undefined,
                notes: noteValues.length ? noteValues : undefined,
              }
            : undefined,
        notes: noteValues.length ? noteValues : undefined,
      };

      return {
        lemma,
        pos: 'Präp',
        level: normaliseLevel(data.level),
        english: normaliseString(data.english),
        exampleDe,
        exampleEn,
        gender: null,
        plural: null,
        separable: null,
        aux: null,
        praesensIch: null,
        praesensEr: null,
        praeteritum: null,
        partizipIi: null,
        perfekt: null,
        comparative: null,
        superlative: null,
        translations: null,
        examples,
        posAttributes,
        enrichmentAppliedAt: null,
        enrichmentMethod: null,
        approved: normaliseBoolean(data.approved) ?? false,
      } satisfies RawWordRow;
    },
  },
  {
    filename: 'conjunctions.jsonl',
    pos: 'Konj',
    map: (record) => {
      const data = record as BasePosJsonRecord;
      const lemma = normaliseString(data.lemma);
      if (!lemma) return null;

      const { exampleDe, exampleEn, examples } = normaliseExamples(data.examples, createExampleFallback(data));

      return {
        lemma,
        pos: 'Konj',
        level: normaliseLevel(data.level),
        english: normaliseString(data.english),
        exampleDe,
        exampleEn,
        gender: null,
        plural: null,
        separable: null,
        aux: null,
        praesensIch: null,
        praesensEr: null,
        praeteritum: null,
        partizipIi: null,
        perfekt: null,
        comparative: null,
        superlative: null,
        translations: null,
        examples,
        posAttributes: null,
        enrichmentAppliedAt: null,
        enrichmentMethod: null,
        approved: normaliseBoolean(data.approved) ?? false,
      } satisfies RawWordRow;
    },
  },
  {
    filename: 'pronouns.jsonl',
    pos: 'Pron',
    map: (record) => {
      const data = record as BasePosJsonRecord;
      const lemma = normaliseString(data.lemma);
      if (!lemma) return null;

      const { exampleDe, exampleEn, examples } = normaliseExamples(data.examples, createExampleFallback(data));

      return {
        lemma,
        pos: 'Pron',
        level: normaliseLevel(data.level),
        english: normaliseString(data.english),
        exampleDe,
        exampleEn,
        gender: null,
        plural: null,
        separable: null,
        aux: null,
        praesensIch: null,
        praesensEr: null,
        praeteritum: null,
        partizipIi: null,
        perfekt: null,
        comparative: null,
        superlative: null,
        translations: null,
        examples,
        posAttributes: null,
        enrichmentAppliedAt: null,
        enrichmentMethod: null,
        approved: normaliseBoolean(data.approved) ?? false,
      } satisfies RawWordRow;
    },
  },
  {
    filename: 'particles.jsonl',
    pos: 'Part',
    map: (record) => {
      const data = record as BasePosJsonRecord;
      const lemma = normaliseString(data.lemma);
      if (!lemma) return null;

      const { exampleDe, exampleEn, examples } = normaliseExamples(data.examples, createExampleFallback(data));

      return {
        lemma,
        pos: 'Part',
        level: normaliseLevel(data.level),
        english: normaliseString(data.english),
        exampleDe,
        exampleEn,
        gender: null,
        plural: null,
        separable: null,
        aux: null,
        praesensIch: null,
        praesensEr: null,
        praeteritum: null,
        partizipIi: null,
        perfekt: null,
        comparative: null,
        superlative: null,
        translations: null,
        examples,
        posAttributes: null,
        enrichmentAppliedAt: null,
        enrichmentMethod: null,
        approved: normaliseBoolean(data.approved) ?? false,
      } satisfies RawWordRow;
    },
  },
];

async function loadPosWordRowsFromDisk(rootDir: string): Promise<RawWordRow[]> {
  const posDir = path.join(rootDir, 'data', 'pos');
  const results: RawWordRow[] = [];
  const seen = new Map<string, { file: string; line: number }>();

  for (const definition of POS_FILE_DEFINITIONS) {
    const filePath = path.join(posDir, definition.filename);
    let content: string;
    try {
      content = await fs.readFile(filePath, 'utf8');
    } catch (error) {
      const err = error as NodeJS.ErrnoException;
      if (err?.code === 'ENOENT') {
        continue;
      }
      throw error;
    }

    const records: Array<{ record: PosJsonRecord; line: number }> = [];
    const lines = content.split(/\r?\n/);
    for (const [index, rawLine] of lines.entries()) {
      const line = rawLine.trim();
      if (!line) {
        continue;
      }
      try {
        records.push({ record: JSON.parse(line) as PosJsonRecord, line: index + 1 });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        throw new Error(`Failed to parse ${filePath}:${index + 1}: ${message}`);
      }
    }

    for (const { record, line } of records) {
      const row = definition.map(record);
      if (row) {
        const key = keyFor(row.lemma, row.pos);
        const existing = seen.get(key);
        if (existing) {
          throw new Error(
            `Duplicate word ${row.lemma} (${row.pos}) in ${filePath}:${line} (also defined at ${existing.file}:${existing.line})`,
          );
        }
        seen.set(key, { file: filePath, line });
        results.push(row);
      }
    }
  }

  return results;
}

function pickLatestTimestamp(a: string | null, b: string | null): string | null {
  const candidates = [a, b]
    .filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
    .map((value) => new Date(value).getTime())
    .filter((value) => Number.isFinite(value));
  if (!candidates.length) {
    return a ?? b ?? null;
  }
  const max = Math.max(...candidates);
  return new Date(max).toISOString();
}

function isEnglishLanguage(language?: string | null): boolean {
  if (!language) {
    return true;
  }
  const normalised = language.trim().toLowerCase();
  if (!normalised) {
    return true;
  }
  if (normalised === 'en' || normalised === 'eng' || normalised === 'english') {
    return true;
  }
  const sanitized = normalised.replace(/[_\s]/g, '-');
  return sanitized.startsWith('en-') || normalised.startsWith('english');
}

function addAuxCandidate(target: Set<'haben' | 'sein'>, value: string | null | undefined): void {
  if (!value) {
    return;
  }
  const normalised = value.trim().toLowerCase();
  if (!normalised) {
    return;
  }
  if (normalised.includes('haben') && normalised.includes('sein')) {
    target.add('haben');
    target.add('sein');
    return;
  }
  if (normalised.startsWith('hab')) {
    target.add('haben');
    return;
  }
  if (normalised.startsWith('sein') || normalised.startsWith('ist')) {
    target.add('sein');
  }
}

function determineAuxFromSet(auxiliaries: Set<'haben' | 'sein'>): string | null {
  if (!auxiliaries.size) {
    return null;
  }
  if (auxiliaries.size > 1) {
    return 'haben / sein';
  }
  const [value] = auxiliaries;
  return value ?? null;
}

function toDateOrNull(value: string | null | undefined): Date | null {
  if (!value) {
    return null;
  }
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date : null;
}

async function aggregateWords(rootDir: string): Promise<AggregatedWordWithKey[]> {
  const posRows = await loadPosWordRowsFromDisk(rootDir);
  const aggregated = new Map<string, RawWordRow>();

  const upsertAggregatedRow = (row: RawWordRow | null | undefined) => {
    if (!row) {
      return;
    }
    const key = keyFor(row.lemma, row.pos);
    const existing = aggregated.get(key) ?? null;
    const merged = mergeWord(existing, row);
    aggregated.set(key, merged);
  };

  for (const row of posRows) {
    upsertAggregatedRow(row);
  }

  const wordsWithMetadata: AggregatedWordWithKey[] = [];
  for (const [key, value] of aggregated.entries()) {
    const complete = computeCompleteness(value);
    const approved = Boolean(value.approved);
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
      approved,
      complete,
      translations: value.translations ?? null,
      examples: value.examples ?? null,
      enrichmentAppliedAt: value.enrichmentAppliedAt ?? null,
      enrichmentMethod: value.enrichmentMethod ?? null,
    });
  }

  return wordsWithMetadata;
}

async function seedLegacyWords(db: DatabaseClient, wordsToUpsert: AggregatedWordWithKey[]): Promise<void> {
  const existing = await db.select({ lemma: words.lemma, pos: words.pos }).from(words);
  const desiredKeys = new Set(wordsToUpsert.map((word) => word.key));

  const wordsToDelete = existing.filter(
    (row) => !desiredKeys.has(keyFor(row.lemma, row.pos)),
  );

  if (wordsToDelete.length > 0) {
    for (const batch of chunkArray(wordsToDelete, WORDS_BATCH_SIZE)) {
      const tupleList = sql.join(
        batch.map((row) => sql`(${row.lemma}, ${row.pos})`),
        sql`, `,
      );

      await db.execute(
        sql`DELETE FROM "words" WHERE ("lemma", "pos") IN (${tupleList})`,
      );
    }
  }

  if (wordsToUpsert.length === 0) {
    return;
  }

  for (const batch of chunkArray(wordsToUpsert, WORDS_BATCH_SIZE)) {
    await db
      .insert(words)
      .values(
        batch.map((word) => ({
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
          approved: word.approved,
          complete: word.complete,
          translations: word.translations ?? null,
          examples: word.examples ?? null,
          enrichmentAppliedAt: toDateOrNull(word.enrichmentAppliedAt),
          enrichmentMethod: word.enrichmentMethod ?? null,
        })),
      )
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
          approved: sql`excluded.approved`,
          complete: sql`excluded.complete`,
          translations: sql`excluded.translations`,
          examples: sql`excluded.examples`,
          enrichmentAppliedAt: sql`excluded.enrichment_applied_at`,
          enrichmentMethod: sql`excluded.enrichment_method`,
          updatedAt: sql`now()`,
        },
      });
  }
}

export async function seedDatabase(
  rootDir: string,
  db: DatabaseClient = ensureDatabase(),
  options: SeedOptions = {},
): Promise<{
  aggregatedCount: number;
  lexemeCount: number;
  inflectionCount: number;
}> {
  await ensureLegacySchema(db);

  if (options.reset) {
    console.log('Resetting seeded lexemes, inflections, and legacy words before seeding…');
    await resetSeededContent(db);
  }

  const aggregated = await aggregateWords(rootDir);
  await seedLegacyWords(db, aggregated);

  const inventory = buildLexemeInventory(aggregated);
  await upsertLexemeInventory(db, inventory);

  const lexemeCount = inventory.lexemes.length;
  const inflectionCount = inventory.inflections.length;

  return {
    aggregatedCount: aggregated.length,
    lexemeCount,
    inflectionCount,
  };
}

async function main(): Promise<void> {
  const __filename = fileURLToPath(import.meta.url);
  const root = path.resolve(path.dirname(__filename), '..');

  console.log('Applying database migrations before seeding…');
  const pool = getPool();
  await applyMigrations(pool);

  const options = parseSeedOptions(process.argv.slice(2));
  const database = ensureDatabase();
  const { aggregatedCount, lexemeCount, inflectionCount } = await seedDatabase(
    root,
    database,
    options,
  );

  console.log(`Seeded ${aggregatedCount} words into legacy table.`);
  console.log(`Upserted ${lexemeCount} lexemes and ${inflectionCount} inflections.`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  main()
    .then(() => {
      console.log('Word seeding completed');
    })
    .catch((error) => {
      console.error('Failed to seed content', error);
      process.exit(1);
    });
}
