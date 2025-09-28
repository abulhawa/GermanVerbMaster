import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parse } from 'csv-parse/sync';

const WORTART_MAP = new Map([
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

const GENDER_MAP = new Map([
  ['mask.', 'der'],
  ['fem.', 'die'],
  ['neut.', 'das'],
  ['mask./fem.', 'der/die'],
  ['mask./neut.', 'der/das'],
  ['fem./neut.', 'die/das'],
]);

function normaliseString(value) {
  if (value === undefined || value === null) return undefined;
  const trimmed = String(value).trim();
  return trimmed.length ? trimmed : undefined;
}

function normaliseLevel(level) {
  const value = normaliseString(level);
  if (!value) return undefined;
  return value.toUpperCase();
}

function deriveGender(record) {
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

function createWordRecord({
  lemma,
  pos,
  level,
  english,
  exampleDe,
  exampleEn,
  gender,
  plural,
  separable,
  aux,
  praesensIch,
  praesensEr,
  praeteritum,
  partizipIi,
  perfekt,
  comparative,
  superlative,
  source,
  notes,
}) {
  if (!lemma || !pos) return undefined;
  return {
    lemma,
    pos,
    level: level ?? undefined,
    english: english ?? undefined,
    example_de: exampleDe ?? undefined,
    example_en: exampleEn ?? undefined,
    gender: gender ?? undefined,
    plural: plural ?? undefined,
    separable: typeof separable === 'boolean' ? separable : undefined,
    aux: aux ?? undefined,
    praesens_ich: praesensIch ?? undefined,
    praesens_er: praesensEr ?? undefined,
    praeteritum: praeteritum ?? undefined,
    partizip_ii: partizipIi ?? undefined,
    perfekt: perfekt ?? undefined,
    comparative: comparative ?? undefined,
    superlative: superlative ?? undefined,
    sources_csv: source ?? undefined,
    source_notes: notes ?? undefined,
  };
}

function loadDwdsFileContent(content, { level, source }) {
  const records = parse(content, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
  });

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
    .filter(Boolean);
}

async function loadDwdsGoetheSources(externalDir) {
  const dwdsFiles = [
    { name: 'dwds-goethe-A1.csv', level: 'A1' },
    { name: 'dwds-goethe-A2.csv', level: 'A2' },
    { name: 'dwds-goethe-B1.csv', level: 'B1' },
  ];

  const results = [];
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
      if (error.code === 'ENOENT') continue;
      throw error;
    }
  }
  return results;
}

async function loadLearnDeutschVocabulary(externalDir) {
  const filePath = path.join(externalDir, 'learn-deutsch-data.js');
  try {
    const moduleUrl = pathToFileURL(filePath).href;
    const dataModule = await import(moduleUrl);
    const vocabulary = dataModule.vocabulary ?? {};
    const collected = [];

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
          praesensIch: entry.conjugation?.ich ? normaliseString(entry.conjugation.ich) : undefined,
          praesensEr: entry.conjugation?.['er/sie/es'] ? normaliseString(entry.conjugation['er/sie/es']) : undefined,
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
          praesensIch: entry.conjugation?.ich ? normaliseString(entry.conjugation.ich) : undefined,
          praesensEr: entry.conjugation?.['er/sie/es'] ? normaliseString(entry.conjugation['er/sie/es']) : undefined,
          source: 'learn-deutsch-data:modal',
          notes: normaliseString(entry.pronunciation ?? entry.details),
        }),
      );
    }

    return collected.filter(Boolean);
  } catch (error) {
    if (error.code === 'ENOENT') return [];
    throw error;
  }
}

export async function loadExternalWordRows(externalDir) {
  const [dwds, learnDeutsch] = await Promise.all([
    loadDwdsGoetheSources(externalDir),
    loadLearnDeutschVocabulary(externalDir),
  ]);

  return [...dwds, ...learnDeutsch];
}

export async function snapshotExternalSources(destinationPath, rows) {
  const columns = [
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

  const encodeValue = (value) => {
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

export async function loadManualWordRows(filePath) {
  try {
    const content = await fs.readFile(filePath, 'utf8');
    return parse(content, {
      columns: true,
      skip_empty_lines: true,
      trim: true,
    });
  } catch (error) {
    if (error.code === 'ENOENT') return [];
    throw error;
  }
}
