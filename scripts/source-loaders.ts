import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { parse } from 'csv-parse/sync';

export type ExternalPartOfSpeech =
  | 'N'
  | 'V'
  | 'Adj'
  | 'Adv'
  | 'Pron'
  | 'Det'
  | 'Präp'
  | 'Konj'
  | 'Num'
  | 'Part';

export interface ExternalWordRow {
  lemma: string;
  pos: ExternalPartOfSpeech;
  level?: string;
  english?: string;
  example_de?: string;
  example_en?: string;
  gender?: string;
  plural?: string;
  separable?: boolean;
  aux?: string;
  praesens_ich?: string;
  praesens_er?: string;
  praeteritum?: string;
  partizip_ii?: string;
  perfekt?: string;
  comparative?: string;
  superlative?: string;
  sources_csv?: string;
  source_notes?: string;
}

const WORTART_MAP = new Map<string, ExternalPartOfSpeech>([
  ['Substantiv', 'N'],
  ['Verb', 'V'],
  ['Adjektiv', 'Adj'],
  ['Adverb', 'Adv'],
  ['Präposition', 'Präp'],
  ['Konjunktion', 'Konj'],
  ['Artikel', 'Det'],
  ['Pronomen', 'Pron'],
  ['Numerale', 'Num'],
  ['Partikel', 'Part'],
]);

const GENDER_MAP = new Map<string, string>([
  ['mask.', 'der'],
  ['fem.', 'die'],
  ['neut.', 'das'],
  ['mask./fem.', 'der/die'],
  ['mask./neut.', 'der/das'],
  ['fem./neut.', 'die/das'],
]);

type Errno = NodeJS.ErrnoException;

type DwdsRecord = {
  Lemma?: unknown;
  Wortart?: unknown;
  Artikel?: unknown;
  Genus?: unknown;
  URL?: unknown;
};

type LearnDeutschModule = {
  vocabulary?: {
    nouns?: Array<Record<string, unknown>>;
    verbs?: Array<Record<string, unknown>>;
    modalVerbs?: Array<Record<string, unknown>>;
  };
};

function normaliseString(value: unknown): string | undefined {
  if (value === undefined || value === null) return undefined;
  const trimmed = String(value).trim();
  return trimmed.length ? trimmed : undefined;
}

function normaliseLevel(level: unknown): string | undefined {
  const value = normaliseString(level);
  return value ? value.toUpperCase() : undefined;
}

function deriveGender(record: DwdsRecord): string | undefined {
  const article = normaliseString(record.Artikel);
  if (article) return article;
  const genus = normaliseString(record.Genus);
  if (!genus) return undefined;
  const mapped = GENDER_MAP.get(genus);
  if (mapped) return mapped;
  if (genus.startsWith('mask')) return 'der';
  if (genus.startsWith('fem')) return 'die';
  if (genus.startsWith('neut')) return 'das';
  return undefined;
}

interface WordRecordArgs {
  lemma?: string;
  pos?: ExternalPartOfSpeech;
  level?: string;
  english?: string;
  exampleDe?: string;
  exampleEn?: string;
  gender?: string;
  plural?: string;
  separable?: boolean;
  aux?: string;
  praesensIch?: string;
  praesensEr?: string;
  praeteritum?: string;
  partizipIi?: string;
  perfekt?: string;
  comparative?: string;
  superlative?: string;
  source?: string;
  notes?: string;
}

function createWordRecord(args: WordRecordArgs): ExternalWordRow | undefined {
  const { lemma, pos } = args;
  if (!lemma || !pos) return undefined;
  return {
    lemma,
    pos,
    level: args.level ?? undefined,
    english: args.english ?? undefined,
    example_de: args.exampleDe ?? undefined,
    example_en: args.exampleEn ?? undefined,
    gender: args.gender ?? undefined,
    plural: args.plural ?? undefined,
    separable: typeof args.separable === 'boolean' ? args.separable : undefined,
    aux: args.aux ?? undefined,
    praesens_ich: args.praesensIch ?? undefined,
    praesens_er: args.praesensEr ?? undefined,
    praeteritum: args.praeteritum ?? undefined,
    partizip_ii: args.partizipIi ?? undefined,
    perfekt: args.perfekt ?? undefined,
    comparative: args.comparative ?? undefined,
    superlative: args.superlative ?? undefined,
    sources_csv: args.source ?? undefined,
    source_notes: args.notes ?? undefined,
  };
}

function loadDwdsFileContent(
  content: string,
  { level, source }: { level?: string; source: string },
): ExternalWordRow[] {
  const records = parse(content, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
  }) as DwdsRecord[];

  return records
    .map((record) => {
      const lemma = normaliseString(record.Lemma);
      const wortart = normaliseString(record.Wortart);
      const pos = wortart ? WORTART_MAP.get(wortart) : undefined;
      if (!lemma || !pos) return undefined;

      return createWordRecord({
        lemma,
        pos,
        level,
        gender: pos === 'N' ? deriveGender(record) : undefined,
        source,
        notes: normaliseString(record.URL),
      });
    })
    .filter((value): value is ExternalWordRow => Boolean(value));
}

async function loadDwdsGoetheSources(externalDir: string): Promise<ExternalWordRow[]> {
  const dwdsFiles = [
    { name: 'dwds-goethe-A1.csv', level: 'A1' },
    { name: 'dwds-goethe-A2.csv', level: 'A2' },
    { name: 'dwds-goethe-B1.csv', level: 'B1' },
  ];

  const results: ExternalWordRow[] = [];
  for (const file of dwdsFiles) {
    const filePath = path.join(externalDir, file.name);
    try {
      const content = await fs.readFile(filePath, 'utf8');
      const words = loadDwdsFileContent(content, {
        level: normaliseLevel(file.level),
        source: file.name,
      });
      results.push(...words);
    } catch (error) {
      const err = error as Errno;
      if (err?.code === 'ENOENT') continue;
      throw error;
    }
  }
  return results;
}

async function loadLearnDeutschVocabulary(externalDir: string): Promise<ExternalWordRow[]> {
  const filePath = path.join(externalDir, 'learn-deutsch-data.js');
  try {
    const moduleUrl = pathToFileURL(filePath).href;
    const dataModule = (await import(moduleUrl)) as LearnDeutschModule;
    const vocabulary = dataModule.vocabulary ?? {};
    const collected: Array<ExternalWordRow | undefined> = [];

    const nouns = Array.isArray(vocabulary.nouns) ? vocabulary.nouns : [];
    for (const entry of nouns) {
      collected.push(
        createWordRecord({
          lemma: normaliseString(entry.word),
          pos: 'N',
          level: normaliseLevel(entry.level),
          english: normaliseString(entry.english),
          gender: normaliseString(entry.article),
          plural: normaliseString(entry.plural),
          source: 'learn-deutsch-data:nouns',
          notes: normaliseString(entry.details),
        }),
      );
    }

    const verbs = Array.isArray(vocabulary.verbs) ? vocabulary.verbs : [];
    for (const entry of verbs) {
      collected.push(
        createWordRecord({
          lemma: normaliseString(entry.infinitive),
          pos: 'V',
          level: normaliseLevel(entry.level),
          english: normaliseString(entry.english),
          separable: entry.type === 'separable',
          praesensIch: normaliseString(entry.conjugation?.ich),
          praesensEr: normaliseString(entry.conjugation?.['er/sie/es']),
          source: 'learn-deutsch-data:verbs',
          notes: normaliseString(entry.details),
        }),
      );
    }

    const modalVerbs = Array.isArray(vocabulary.modalVerbs) ? vocabulary.modalVerbs : [];
    for (const entry of modalVerbs) {
      collected.push(
        createWordRecord({
          lemma: normaliseString(entry.infinitive),
          pos: 'V',
          level: normaliseLevel(entry.level),
          english: normaliseString(entry.english),
          praesensIch: normaliseString(entry.conjugation?.ich),
          praesensEr: normaliseString(entry.conjugation?.['er/sie/es']),
          source: 'learn-deutsch-data:modal',
          notes: normaliseString(entry.pronunciation ?? entry.details),
        }),
      );
    }

    return collected.filter((value): value is ExternalWordRow => Boolean(value));
  } catch (error) {
    const err = error as Errno;
    if (err?.code === 'ENOENT') return [];
    throw error;
  }
}

export async function loadExternalWordRows(externalDir: string): Promise<ExternalWordRow[]> {
  const [dwds, learnDeutsch] = await Promise.all([
    loadDwdsGoetheSources(externalDir),
    loadLearnDeutschVocabulary(externalDir),
  ]);

  return [...dwds, ...learnDeutsch];
}

export async function snapshotExternalSources(
  destinationPath: string,
  rows: ExternalWordRow[],
): Promise<void> {
  const columns: Array<keyof ExternalWordRow> = [
    'lemma',
    'pos',
    'level',
    'english',
    'example_de',
    'example_en',
    'gender',
    'plural',
    'separable',
    'aux',
    'praesens_ich',
    'praesens_er',
    'praeteritum',
    'partizip_ii',
    'perfekt',
    'comparative',
    'superlative',
    'sources_csv',
    'source_notes',
  ];

  const encodeValue = (value: unknown): string => {
    if (value === null || value === undefined) return '';
    const stringValue = String(value);
    if (stringValue.includes('"') || stringValue.includes(',') || stringValue.includes('\n')) {
      return `"${stringValue.replaceAll('"', '""')}"`;
    }
    return stringValue;
  };

  const header = columns.join(',');
  const lines = [header];
  for (const row of rows) {
    const values = columns.map((column) => encodeValue(row?.[column] ?? ''));
    lines.push(values.join(','));
  }

  await fs.writeFile(destinationPath, `${lines.join('\n')}\n`, 'utf8');
}

export async function loadManualWordRows(filePath: string): Promise<Record<string, string>[]> {
  try {
    const content = await fs.readFile(filePath, 'utf8');
    return parse(content, {
      columns: true,
      skip_empty_lines: true,
      trim: true,
    }) as Record<string, string>[];
  } catch (error) {
    const err = error as Errno;
    if (err?.code === 'ENOENT') return [];
    throw error;
  }
}
