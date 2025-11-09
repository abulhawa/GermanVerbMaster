import fs from 'node:fs/promises';
import path from 'node:path';

import type { PartOfSpeech, WordPosAttributes } from '@shared/types';

import { LEVEL_ORDER } from '../constants';
import {
  createExampleFallback,
  mergeExamples,
  mergeTranslations,
  mergeWordPosAttributes,
  normaliseBoolean,
  normaliseExamples,
  normaliseLevel,
  normaliseString,
  normalizeStringArray,
  pickLatestTimestamp,
} from '../normalizers';
import type { AggregatedWordWithKey, BasePosJsonRecord, RawWordRow } from '../types';

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

interface PosFileDefinition {
  filename: string;
  pos: PartOfSpeech;
  map(record: PosJsonRecord): RawWordRow | null;
}

export function keyFor(lemma: string, pos: string): string {
  return `${lemma.toLowerCase()}::${pos}`;
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

function computeCompleteness(word: RawWordRow & { pos: PartOfSpeech }): boolean {
  const english = word.english ?? null;
  const exampleDe = word.exampleDe ?? null;
  const exampleEn = word.exampleEn ?? null;
  const examples = word.examples ?? [];
  const hasExamplePair = Boolean(
    (exampleDe?.trim() && exampleEn?.trim()) ||
      examples.some((entry) => entry?.exampleDe?.trim() && entry?.exampleEn?.trim()),
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

const POS_FILE_DEFINITIONS: PosFileDefinition[] = [
  {
    filename: 'verbs.jsonl',
    pos: 'V',
    map: (record) => {
      const data = record as VerbJsonRecord;
      const lemma = normaliseString(data.lemma);
      if (!lemma) return null;

      const { exampleDe, exampleEn, examples } = normaliseExamples(
        data.examples,
        createExampleFallback(data),
      );
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

      const { exampleDe, exampleEn, examples } = normaliseExamples(
        data.examples,
        createExampleFallback(data),
      );
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

      const { exampleDe, exampleEn, examples } = normaliseExamples(
        data.examples,
        createExampleFallback(data),
      );
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

      const { exampleDe, exampleEn, examples } = normaliseExamples(
        data.examples,
        createExampleFallback(data),
      );
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

      const { exampleDe, exampleEn, examples } = normaliseExamples(
        data.examples,
        createExampleFallback(data),
      );
      const preposition = (data.preposition ?? {}) as NonNullable<PrepositionJsonRecord['preposition']>;

      const normalizedCases = Array.isArray(preposition.cases)
        ? normalizeStringArray(
            preposition.cases.map((value) =>
              value === null || value === undefined ? null : String(value),
            ),
          )
        : [];
      const normalizedNotes = Array.isArray(preposition.notes)
        ? normalizeStringArray(
            preposition.notes.map((value) =>
              value === null || value === undefined ? null : String(value),
            ),
          )
        : [];

      const posAttributes: WordPosAttributes = {
        pos: 'Präp',
        preposition:
          normalizedCases.length || normalizedNotes.length
            ? {
                cases: normalizedCases.length ? normalizedCases : undefined,
                notes: normalizedNotes.length ? normalizedNotes : undefined,
              }
            : undefined,
        notes: normalizedNotes.length ? normalizedNotes : undefined,
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

      const { exampleDe, exampleEn, examples } = normaliseExamples(
        data.examples,
        createExampleFallback(data),
      );

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

      const { exampleDe, exampleEn, examples } = normaliseExamples(
        data.examples,
        createExampleFallback(data),
      );

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

      const { exampleDe, exampleEn, examples } = normaliseExamples(
        data.examples,
        createExampleFallback(data),
      );

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

export async function loadPosWordRowsFromDisk(rootDir: string): Promise<RawWordRow[]> {
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

export async function aggregateWords(rootDir: string): Promise<AggregatedWordWithKey[]> {
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
      pos: value.pos as AggregatedWordWithKey['pos'],
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
