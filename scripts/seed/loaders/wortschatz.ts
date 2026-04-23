import fs from 'node:fs/promises';
import path from 'node:path';

import { ANDROID_B2_BERUF_SOURCE, ANDROID_B2_BERUF_VERSION } from '@shared/content-sources';
import type { PartOfSpeech } from '@shared/types';

import type { RawWordRow } from '../types';

const EXPECTED_COLUMNS = 6;
const BUNDLED_WORTSCHATZ_LEVEL = 'B2 Beruf';

function normalizeToken(value: string): string {
  return value
    .toLowerCase()
    .replace(/\u00e4/g, 'ae')
    .replace(/\u00f6/g, 'oe')
    .replace(/\u00fc/g, 'ue')
    .replace(/\u00df/g, 'ss')
    .replace(/[^a-z0-9]/g, '');
}

function parseCsvRows(csvText: string): string[][] {
  const rows: string[][] = [];
  const row: string[] = [];
  const field = new StringBuilder();
  let inQuotes = false;
  let index = 0;

  while (index < csvText.length) {
    const character = csvText[index]!;

    if (character === '"') {
      if (inQuotes && index + 1 < csvText.length && csvText[index + 1] === '"') {
        field.append('"');
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (character === ',') {
      if (inQuotes) {
        field.append(character);
      } else {
        row.push(field.toString());
        field.clear();
      }
    } else if (character === '\n') {
      if (inQuotes) {
        field.append(character);
      } else {
        row.push(field.toString());
        field.clear();
        if (row.some((value) => value.trim().length > 0)) {
          rows.push([...row]);
        }
        row.length = 0;
      }
    } else if (character !== '\r') {
      field.append(character);
    }

    index += 1;
  }

  if (field.length > 0 || row.length > 0) {
    row.push(field.toString());
    if (row.some((value) => value.trim().length > 0)) {
      rows.push([...row]);
    }
  }

  return rows;
}

function normalizeColumns(row: string[]): string[] | null {
  const trimmed = row.map((value) => value.trim());
  if (trimmed.length === EXPECTED_COLUMNS) {
    return trimmed;
  }

  if (trimmed.length > EXPECTED_COLUMNS) {
    const article = trimmed[0] ?? '';
    const word = trimmed[1] ?? '';
    const english = trimmed.slice(2, trimmed.length - 3).join(',').trim();
    const exampleDe = trimmed[trimmed.length - 3] ?? '';
    const exampleEn = trimmed[trimmed.length - 2] ?? '';
    const pos = trimmed[trimmed.length - 1] ?? '';
    return [article, word, english, exampleDe, exampleEn, pos];
  }

  return null;
}

function findHeaderIndex(headerMap: Map<string, number>, ...candidates: string[]): number | null {
  for (const candidate of candidates) {
    const index = headerMap.get(candidate);
    if (typeof index === 'number') {
      return index;
    }
  }
  return null;
}

function normalizePos(raw: string): PartOfSpeech | null {
  const token = normalizeToken(raw);
  switch (token) {
    case 'v':
    case 'verb':
    case 'verben':
      return 'V';
    case 'n':
    case 'noun':
    case 'nomen':
    case 'substantiv':
    case 'subst':
    case 'propn':
    case 'propernoun':
      return 'N';
    case 'adj':
    case 'adjective':
    case 'adjektiv':
      return 'Adj';
    case 'adv':
    case 'adverb':
      return 'Adv';
    case 'prep':
    case 'preposition':
    case 'adp':
    case 'praeposition':
      return 'Präp';
    case 'conj':
    case 'conjunction':
    case 'konjunktion':
    case 'cconj':
    case 'sconj':
      return 'Konj';
    case 'pron':
    case 'pronomen':
    case 'pronoun':
      return 'Pron';
    case 'int':
    case 'intj':
    case 'interjektion':
    case 'interjection':
      return 'Interj';
    case 'art':
    case 'article':
    case 'artikel':
    case 'det':
    case 'determiner':
      return 'Det';
    case 'num':
    case 'numerale':
    case 'numeral':
    case 'zahlwort':
      return 'Num';
    default:
      return null;
  }
}

function splitLemmaAndPlural(rawWord: string, pos: PartOfSpeech): [string, string | null] {
  if (pos !== 'N') {
    return [rawWord.trim(), null];
  }

  const [lemma, pluralCandidate] = rawWord.split(',', 2).map((value) => value.trim());
  const plural = pluralCandidate && pluralCandidate !== '-' ? pluralCandidate : null;
  return [lemma ?? '', plural];
}

function inferGender(articlePrefix: string): string | null {
  const normalized = ` ${articlePrefix.toLowerCase()} `
    .replace(/\u00e4/g, 'ae')
    .replace(/\u00f6/g, 'oe')
    .replace(/\u00fc/g, 'ue')
    .replace(/\u00df/g, 'ss');

  const hasDer = /\bder\b/.test(normalized);
  const hasDie = /\bdie\b/.test(normalized);
  const hasDas = /\bdas\b/.test(normalized);

  const genders = [
    hasDer ? 'der' : null,
    hasDie ? 'die' : null,
    hasDas ? 'das' : null,
  ].filter((value): value is 'der' | 'die' | 'das' => Boolean(value));

  return genders.length > 0 ? genders.join('/') : null;
}

export function parseBundledWortschatzCsv(
  csvText: string,
  options: {
    level?: string;
    versionTag?: string;
    sourceTag?: string;
  } = {},
): RawWordRow[] {
  const level = options.level ?? BUNDLED_WORTSCHATZ_LEVEL;
  const versionTag = options.versionTag ?? ANDROID_B2_BERUF_VERSION;
  const sourceTag = options.sourceTag ?? ANDROID_B2_BERUF_SOURCE;
  const rawRows = parseCsvRows(csvText);

  if (!rawRows.length) {
    return [];
  }

  const header = normalizeColumns(rawRows[0] ?? []);
  if (!header) {
    return [];
  }

  const headerMap = new Map(header.map((value, index) => [normalizeToken(value), index] as const));
  const wordIndex = findHeaderIndex(headerMap, 'word', 'wort', 'lemma');
  const englishIndex = findHeaderIndex(headerMap, 'englishtranslation', 'translationenglish', 'english');
  const posIndex = findHeaderIndex(headerMap, 'pos', 'postag', 'wortart');
  const articleIndex = findHeaderIndex(headerMap, 'articleprefix', 'article', 'prefix', 'artikel');
  const exampleDeIndex = findHeaderIndex(headerMap, 'examplesentence', 'examplede', 'beispielsatz', 'satz');
  const exampleEnIndex = findHeaderIndex(
    headerMap,
    'englishtranslationsentence',
    'englishsentence',
    'exampleen',
    'sentenceenglish',
  );

  if (wordIndex === null || englishIndex === null || posIndex === null) {
    return [];
  }

  const dedupe = new Set<string>();
  const rows: RawWordRow[] = [];

  for (const rawRow of rawRows.slice(1)) {
    const row = normalizeColumns(rawRow);
    if (!row) {
      continue;
    }

    const pos = normalizePos(row[posIndex] ?? '');
    if (!pos) {
      continue;
    }

    const rawWord = (row[wordIndex] ?? '').trim();
    const english = (row[englishIndex] ?? '').trim();
    if (!rawWord || !english) {
      continue;
    }

    const [lemma, plural] = splitLemmaAndPlural(rawWord, pos);
    if (!lemma.trim()) {
      continue;
    }

    const articlePrefix = articleIndex !== null ? row[articleIndex] ?? '' : '';
    const exampleDe = exampleDeIndex !== null ? (row[exampleDeIndex] ?? '').trim() || null : null;
    const exampleEn = exampleEnIndex !== null ? (row[exampleEnIndex] ?? '').trim() || null : null;
    const dedupeKey = [
      lemma.toLowerCase(),
      pos,
      english.toLowerCase(),
      articlePrefix.toLowerCase(),
      (exampleDe ?? '').toLowerCase(),
      (exampleEn ?? '').toLowerCase(),
    ].join('|');

    if (dedupe.has(dedupeKey)) {
      continue;
    }
    dedupe.add(dedupeKey);

    rows.push({
      lemma,
      pos,
      level,
      english,
      exampleDe,
      exampleEn,
      gender: pos === 'N' ? inferGender(articlePrefix) : null,
      plural: pos === 'N' ? plural : null,
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
      examples:
        exampleDe || exampleEn
          ? [
              {
                sentence: exampleDe,
                translations: exampleEn ? { en: exampleEn } : null,
              },
            ]
          : null,
      posAttributes: null,
      enrichmentAppliedAt: null,
      enrichmentMethod: null,
      approved: true,
      sourcesCsv: sourceTag,
      sourceNotes: versionTag,
    } satisfies RawWordRow);
  }

  return rows;
}

export async function loadBundledWortschatzRows(rootDir: string): Promise<RawWordRow[]> {
  const filePath = path.join(rootDir, 'data', 'wortschatz', 'b2-beruf.csv');
  try {
    const content = await fs.readFile(filePath, 'utf8');
    return parseBundledWortschatzCsv(content);
  } catch (error) {
    const err = error as NodeJS.ErrnoException;
    if (err?.code === 'ENOENT') {
      return [];
    }
    throw error;
  }
}

class StringBuilder {
  private buffer = '';

  append(value: string): void {
    this.buffer += value;
  }

  clear(): void {
    this.buffer = '';
  }

  get length(): number {
    return this.buffer.length;
  }

  toString(): string {
    return this.buffer;
  }
}
