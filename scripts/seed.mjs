import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parse } from 'csv-parse/sync';
import { and, eq, sql } from 'drizzle-orm';

import {
  loadExternalWordRows,
  loadManualWordRows,
  snapshotExternalSources,
} from './source-loaders.mjs';

const LEVEL_ORDER = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'];
const POS_MAP = new Map([
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

function keyFor(lemma, pos) {
  return `${lemma.toLowerCase()}::${pos}`;
}

function normalisePos(raw) {
  if (!raw) return undefined;
  const value = String(raw).trim();
  if (!value) return undefined;
  const upper = value.toUpperCase();
  if (['V', 'N', 'ADJ', 'ADV', 'PRON', 'DET', 'PRÄP', 'KONJ', 'NUM', 'PART', 'INTERJ'].includes(upper)) {
    return upper === 'ADJ' ? 'Adj'
      : upper === 'ADV' ? 'Adv'
      : upper === 'PRON' ? 'Pron'
      : upper === 'DET' ? 'Det'
      : upper === 'PRÄP' ? 'Präp'
      : upper === 'KONJ' ? 'Konj'
      : upper === 'NUM' ? 'Num'
      : upper === 'PART' ? 'Part'
      : upper === 'INTERJ' ? 'Interj'
      : upper;
  }
  const mapped = POS_MAP.get(value.toLowerCase());
  if (mapped) return mapped;
  throw new Error(`Unsupported part of speech: ${raw}`);
}

function normaliseString(value) {
  if (value === undefined || value === null) return null;
  const trimmed = String(value).trim();
  return trimmed.length ? trimmed : null;
}

function parseBooleanish(value) {
  if (value === undefined || value === null) return null;
  const normalized = String(value).trim().toLowerCase();
  if (!normalized) return null;
  if (['1', 'true', 'yes', 'y', 'ja'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'n', 'nein'].includes(normalized)) return false;
  return null;
}

function compareLevels(a, b) {
  if (!a) return 1;
  if (!b) return -1;
  const indexA = LEVEL_ORDER.indexOf(a.toUpperCase());
  const indexB = LEVEL_ORDER.indexOf(b.toUpperCase());
  if (indexA === -1 && indexB === -1) return a.localeCompare(b);
  if (indexA === -1) return 1;
  if (indexB === -1) return -1;
  return indexA - indexB;
}

function mergeValues(existing, incoming) {
  return existing ?? incoming ?? null;
}

function mergeBoolean(existing, incoming) {
  if (typeof incoming === 'boolean') return incoming;
  return existing ?? null;
}

function dedupeJoin(existing, incoming) {
  const parts = new Set();
  for (const value of [existing, incoming]) {
    if (!value) continue;
    const entries = String(value)
      .split(';')
      .map((entry) => entry.trim())
      .filter(Boolean);
    for (const entry of entries) {
      parts.add(entry);
    }
  }
  return parts.size ? Array.from(parts).join('; ') : null;
}

function computeCompleteness(word) {
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

function normaliseLevel(level) {
  const value = normaliseString(level);
  if (!value) return null;
  const upper = value.toUpperCase();
  if (LEVEL_ORDER.includes(upper)) {
    return upper;
  }
  return value;
}

function mergeWord(existing, incoming) {
  if (!existing) return { ...incoming };
  const merged = { ...existing };

  if (incoming.level) {
    const preferred = compareLevels(incoming.level, existing.level ?? null) < 0 ? incoming.level : existing.level;
    merged.level = preferred ?? null;
  }

  merged.english = mergeValues(existing.english, incoming.english);
  merged.exampleDe = mergeValues(existing.exampleDe, incoming.exampleDe);
  merged.exampleEn = mergeValues(existing.exampleEn, incoming.exampleEn);
  merged.gender = mergeValues(existing.gender, incoming.gender);
  merged.plural = mergeValues(existing.plural, incoming.plural);
  merged.separable = mergeBoolean(existing.separable, incoming.separable);
  merged.aux = mergeValues(existing.aux, incoming.aux);
  merged.praesensIch = mergeValues(existing.praesensIch, incoming.praesensIch);
  merged.praesensEr = mergeValues(existing.praesensEr, incoming.praesensEr);
  merged.praeteritum = mergeValues(existing.praeteritum, incoming.praeteritum);
  merged.partizipIi = mergeValues(existing.partizipIi, incoming.partizipIi);
  merged.perfekt = mergeValues(existing.perfekt, incoming.perfekt);
  merged.comparative = mergeValues(existing.comparative, incoming.comparative);
  merged.superlative = mergeValues(existing.superlative, incoming.superlative);
  merged.sourcesCsv = dedupeJoin(existing.sourcesCsv, incoming.sourcesCsv);
  merged.sourceNotes = dedupeJoin(existing.sourceNotes, incoming.sourceNotes);

  return merged;
}

function mapRow(row) {
  const lemma = normaliseString(row.lemma);
  const rawPos = row.pos ?? row.POS ?? row.part_of_speech;
  const pos = normalisePos(rawPos);
  if (!lemma || !pos) {
    throw new Error(`Invalid row missing lemma or part of speech: ${JSON.stringify(row)}`);
  }

  return {
    lemma,
    pos,
    level: normaliseLevel(row.level ?? row.cefr ?? row.difficulty),
    english: normaliseString(row.english ?? row.translation),
    exampleDe: normaliseString(row.example_de ?? row.exampleDe ?? row.example_deu),
    exampleEn: normaliseString(row.example_en ?? row.exampleEn ?? row.example_eng),
    gender: normaliseString(row.gender ?? row.article),
    plural: normaliseString(row.plural),
    separable: parseBooleanish(row.separable),
    aux: normaliseString(row.aux ?? row.auxiliary),
    praesensIch: normaliseString(row.praesens_ich ?? row.praesensIch ?? row.ich_form),
    praesensEr: normaliseString(row.praesens_er ?? row.praesensEr ?? row.er_form),
    praeteritum: normaliseString(row.praeteritum ?? row.praet ?? row.präteritum),
    partizipIi: normaliseString(row.partizip_ii ?? row.partizipIi ?? row.partizip2),
    perfekt: normaliseString(row.perfekt ?? row.perfect),
    comparative: normaliseString(row.comparative ?? row.komparativ),
    superlative: normaliseString(row.superlative ?? row.superlativ),
    sourcesCsv: normaliseString(row.sources_csv ?? row.source ?? row.sources),
    sourceNotes: normaliseString(row.source_notes ?? row.notes ?? row.sourceNotes),
  };
}

async function loadCsv(filePath) {
  const content = await fs.readFile(filePath, 'utf8');
  return parse(content, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
  });
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function seedWords() {
  const root = path.resolve(__dirname, '..');
  const allSourcesPath = path.join(root, 'data', 'words_all_sources.csv');
  const manualPath = path.join(root, 'data', 'words_manual.csv');
  const externalDir = path.join(root, 'docs', 'external');
  const canonicalPath = path.join(root, 'data', 'words_canonical.csv');

  const [manualRows, externalRows, canonicalRows] = await Promise.all([
    loadManualWordRows(manualPath),
    loadExternalWordRows(externalDir),
    loadCsv(canonicalPath),
  ]);

  const allRows = [...manualRows, ...externalRows];

  await snapshotExternalSources(allSourcesPath, allRows);

  const canonicalSet = new Set(
    canonicalRows.map((row) => {
      const lemma = normaliseString(row.lemma);
      const pos = normalisePos(row.pos ?? row.POS ?? row.part_of_speech);
      if (!lemma || !pos) {
        throw new Error(`Invalid canonical record: ${JSON.stringify(row)}`);
      }
      return keyFor(lemma, pos);
    }),
  );

  const aggregated = new Map();

  for (const row of allRows) {
    const mapped = mapRow(row);
    const recordKey = keyFor(mapped.lemma, mapped.pos);
    const merged = mergeWord(aggregated.get(recordKey), mapped);
    aggregated.set(recordKey, merged);
  }

  const wordsToUpsert = Array.from(aggregated.values()).map((word) => {
    const canonical = canonicalSet.has(keyFor(word.lemma, word.pos));
    const complete = computeCompleteness(word);
    return {
      ...word,
      canonical,
      complete,
    };
  });

  const { db } = await import('../db/index.ts');
  const { words } = await import('../db/schema.ts');

  const existing = await db.select({ lemma: words.lemma, pos: words.pos }).from(words);
  const desiredKeys = new Set(wordsToUpsert.map((word) => keyFor(word.lemma, word.pos)));

  let removed = 0;
  for (const row of existing) {
    const rowKey = keyFor(row.lemma, row.pos);
    if (!desiredKeys.has(rowKey)) {
      await db.delete(words).where(and(eq(words.lemma, row.lemma), eq(words.pos, row.pos)));
      removed += 1;
    }
  }

  if (removed > 0) {
    console.log(`Removed ${removed} stale words`);
  }

  let inserted = 0;
  for (const word of wordsToUpsert) {
    await db
      .insert(words)
      .values({
        lemma: word.lemma,
        pos: word.pos,
        level: word.level ?? null,
        english: word.english ?? null,
        exampleDe: word.exampleDe ?? null,
        exampleEn: word.exampleEn ?? null,
        gender: word.gender ?? null,
        plural: word.plural ?? null,
        separable: word.separable ?? null,
        aux: word.aux ?? null,
        praesensIch: word.praesensIch ?? null,
        praesensEr: word.praesensEr ?? null,
        praeteritum: word.praeteritum ?? null,
        partizipIi: word.partizipIi ?? null,
        perfekt: word.perfekt ?? null,
        comparative: word.comparative ?? null,
        superlative: word.superlative ?? null,
        canonical: word.canonical,
        complete: word.complete,
        sourcesCsv: word.sourcesCsv ?? null,
        sourceNotes: word.sourceNotes ?? null,
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
          updatedAt: sql`unixepoch('now')`,
        },
      });
    inserted += 1;
  }

  console.log(`Upserted ${inserted} words`);

  const qaVerbs = wordsToUpsert
    .filter((word) => word.pos === 'V' && word.canonical && word.complete)
    .sort((a, b) => a.lemma.localeCompare(b.lemma, 'de'));

  const qaPayload = qaVerbs.map((word) => {
    const level = word.level ? String(word.level).toUpperCase() : 'A1';
    const normalisedLevel = LEVEL_ORDER.includes(level) ? level : 'A1';
    const sourceName = word.sourcesCsv ? word.sourcesCsv.split(';')[0]?.trim() || 'words_all_sources' : 'words_all_sources';
    const levelReference = word.sourceNotes?.split(';')[0]?.trim() || normalisedLevel;

    return {
      infinitive: word.lemma,
      english: word.english ?? '',
      präteritum: word.praeteritum ?? '',
      partizipII: word.partizipIi ?? '',
      auxiliary: word.aux === 'sein' ? 'sein' : 'haben',
      level: normalisedLevel,
      präteritumExample: word.exampleDe ?? '',
      partizipIIExample: word.exampleEn ?? '',
      source: {
        name: sourceName,
        levelReference,
      },
      pattern: null,
      praesensIch: word.praesensIch ?? null,
      praesensEr: word.praesensEr ?? null,
      perfekt: word.perfekt ?? null,
      separable: word.separable ?? null,
    };
  });

  const qaDir = path.join(root, 'public', 'verbs');
  const clientQaDir = path.join(root, 'client', 'public', 'verbs');
  const serializedPayload = JSON.stringify(qaPayload, null, 2);
  await fs.mkdir(qaDir, { recursive: true });
  await fs.mkdir(clientQaDir, { recursive: true });
  await fs.writeFile(path.join(qaDir, 'verbs.seed.json'), serializedPayload);
  await fs.writeFile(path.join(clientQaDir, 'verbs.seed.json'), serializedPayload);
  console.log(`Wrote QA bundle with ${qaPayload.length} verbs to ${path.join('public', 'verbs', 'verbs.seed.json')}`);
}

async function main() {
  await seedWords();
}

if (process.argv[1]) {
  const invokedUrl = pathToFileURL(process.argv[1]).href;
  if (import.meta.url === invokedUrl) {
    main()
      .then(() => {
        console.log('Word seeding completed');
        process.exit(0);
      })
      .catch((error) => {
        console.error('Failed to seed words', error);
        process.exit(1);
      });
  }
}
