import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { asc, inArray } from 'drizzle-orm';

import { getDb } from '@db';
import { words } from '@db/schema';
import type { WordExample, WordPosAttributes } from '@shared/types';

type WordRow = typeof words.$inferSelect;

type SupportedPos = 'V' | 'N' | 'Adj' | 'Adv' | 'Präp' | 'Konj' | 'Pron' | 'Part';

interface ExportDefinition {
  filename: string;
  mapRecord: (row: WordRow) => Record<string, unknown>;
  synonyms?: readonly string[];
}

const POS_EXPORTS: Record<SupportedPos, ExportDefinition> = {
  V: {
    filename: 'verbs.jsonl',
    mapRecord: (row) => {
      const record = createBaseRecord(row);
      const verb: Record<string, unknown> = {};

      assignIfString(verb, 'aux', row.aux);
      assignIfBoolean(verb, 'separable', row.separable);
      assignIfString(verb, 'praeteritum', row.praeteritum);
      assignIfString(verb, 'partizipIi', row.partizipIi);
      assignIfString(verb, 'perfekt', row.perfekt);

      const praesens: Record<string, string> = {};
      assignIfString(praesens, 'ich', row.praesensIch);
      assignIfString(praesens, 'er', row.praesensEr);
      if (Object.keys(praesens).length > 0) {
        verb.praesens = praesens;
      }

      if (Object.keys(verb).length > 0) {
        record.verb = verb;
      }

      return record;
    },
  },
  N: {
    filename: 'nouns.jsonl',
    mapRecord: (row) => {
      const record = createBaseRecord(row);
      const noun: Record<string, unknown> = {};
      assignIfString(noun, 'gender', row.gender);
      assignIfString(noun, 'plural', row.plural);
      if (Object.keys(noun).length > 0) {
        record.noun = noun;
      }
      return record;
    },
  },
  Adj: {
    filename: 'adjectives.jsonl',
    mapRecord: (row) => {
      const record = createBaseRecord(row);
      const adjective: Record<string, unknown> = {};
      assignIfString(adjective, 'comparative', row.comparative);
      assignIfString(adjective, 'superlative', row.superlative);
      if (Object.keys(adjective).length > 0) {
        record.adjective = adjective;
      }
      return record;
    },
  },
  Adv: {
    filename: 'adverbs.jsonl',
    mapRecord: (row) => {
      const record = createBaseRecord(row);
      const adverb: Record<string, unknown> = {};
      assignIfString(adverb, 'comparative', row.comparative);
      assignIfString(adverb, 'superlative', row.superlative);
      if (Object.keys(adverb).length > 0) {
        record.adverb = adverb;
      }
      return record;
    },
  },
  Präp: {
    filename: 'prepositions.jsonl',
    synonyms: ['Praep'],
    mapRecord: (row) => {
      const record = createBaseRecord(row);
      const attributes = row.posAttributes as WordPosAttributes | null;
      const preposition: Record<string, unknown> = {};

      const cases = normalizeStringArray(attributes?.preposition?.cases ?? []);
      if (cases.length) {
        preposition.cases = cases;
      }

      const notes = normalizeStringArray([
        ...(attributes?.preposition?.notes ?? []),
        ...(attributes?.notes ?? []),
      ]);
      if (notes.length) {
        preposition.notes = notes;
      }

      if (Object.keys(preposition).length > 0) {
        record.preposition = preposition;
      }

      return record;
    },
  },
  Konj: {
    filename: 'conjunctions.jsonl',
    mapRecord: (row) => createBaseRecord(row),
  },
  Pron: {
    filename: 'pronouns.jsonl',
    mapRecord: (row) => createBaseRecord(row),
  },
  Part: {
    filename: 'particles.jsonl',
    mapRecord: (row) => createBaseRecord(row),
  },
};

function parseArgs(argv: readonly string[]): SupportedPos[] | null {
  const positions: SupportedPos[] = [];
  for (const raw of argv) {
    if (!raw || raw === '--') {
      continue;
    }
    if (!raw.startsWith('--pos=')) {
      continue;
    }
    const value = raw.slice('--pos='.length).trim();
    if (!value) {
      continue;
    }
    const normalized = value.replace(/["']/g, '');
    const resolved = normalisePos(normalized);
    if (resolved) {
      positions.push(resolved);
    } else {
      console.warn(`Ignoring unsupported POS filter: ${value}`);
    }
  }
  if (positions.length === 0) {
    return null;
  }
  return Array.from(new Set(positions));
}

function normalisePos(value: string): SupportedPos | null {
  const direct = value as SupportedPos;
  if (POS_EXPORTS[direct]) {
    return direct;
  }
  const lower = value.toLowerCase();
  switch (lower) {
    case 'verb':
    case 'v':
      return 'V';
    case 'noun':
    case 'n':
      return 'N';
    case 'adj':
    case 'adjective':
      return 'Adj';
    case 'adv':
    case 'adverb':
      return 'Adv';
    case 'praep':
    case 'prep':
    case 'präposition':
      return 'Präp';
    case 'konj':
    case 'conjunction':
      return 'Konj';
    case 'pron':
    case 'pronoun':
      return 'Pron';
    case 'part':
    case 'particle':
      return 'Part';
    default:
      return null;
  }
}

function trimValue(value: string | null | undefined): string | null {
  if (value === undefined || value === null) {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length ? trimmed : null;
}

function assignIfString(target: Record<string, unknown>, key: string, value: string | null | undefined): void {
  const trimmed = trimValue(value);
  if (trimmed) {
    target[key] = trimmed;
  }
}

function assignIfBoolean(target: Record<string, unknown>, key: string, value: boolean | null | undefined): void {
  if (typeof value === 'boolean') {
    target[key] = value;
  }
}

function normalizeStringArray(values: Array<string | null | undefined>): string[] {
  const result: string[] = [];
  const seen = new Set<string>();
  for (const value of values) {
    const trimmed = trimValue(value);
    if (!trimmed) {
      continue;
    }
    const key = trimmed.toLowerCase();
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    result.push(trimmed);
  }
  return result;
}

function createBaseRecord(row: WordRow): Record<string, unknown> {
  const record: Record<string, unknown> = {
    lemma: row.lemma,
    approved: row.approved,
  };

  assignIfString(record, 'level', row.level);
  assignIfString(record, 'english', row.english);
  assignIfString(record, 'example_de', row.exampleDe);
  assignIfString(record, 'example_en', row.exampleEn);

  const examples = buildExamples(row);
  if (examples.length) {
    record.examples = examples;
  }

  return record;
}

function buildExamples(row: WordRow): Array<{ de?: string; en?: string }> {
  const examples: Array<{ de?: string; en?: string }> = [];

  if (Array.isArray(row.examples)) {
    for (const entry of row.examples as WordExample[]) {
      if (!entry) {
        continue;
      }
      const deValue = trimValue(entry.sentence ?? entry.exampleDe ?? null);
      const enValue = trimValue(entry.translations?.en ?? entry.exampleEn ?? null);
      if (!deValue && !enValue) {
        continue;
      }
      examples.push({
        de: deValue ?? undefined,
        en: enValue ?? undefined,
      });
    }
  }

  if (examples.length === 0) {
    const fallbackDe = trimValue(row.exampleDe);
    const fallbackEn = trimValue(row.exampleEn);
    if (fallbackDe || fallbackEn) {
      examples.push({
        de: fallbackDe ?? undefined,
        en: fallbackEn ?? undefined,
      });
    }
  }

  return examples;
}

async function exportPos(pos: SupportedPos, outputDir: string): Promise<{ count: number; file: string }> {
  const definition = POS_EXPORTS[pos];
  const db = getDb();
  const filters = definition.synonyms ? [pos, ...definition.synonyms] : [pos];

  const rows = await db
    .select({
      lemma: words.lemma,
      pos: words.pos,
      level: words.level,
      english: words.english,
      approved: words.approved,
      exampleDe: words.exampleDe,
      exampleEn: words.exampleEn,
      gender: words.gender,
      plural: words.plural,
      separable: words.separable,
      aux: words.aux,
      praesensIch: words.praesensIch,
      praesensEr: words.praesensEr,
      praeteritum: words.praeteritum,
      partizipIi: words.partizipIi,
      perfekt: words.perfekt,
      comparative: words.comparative,
      superlative: words.superlative,
      examples: words.examples,
      posAttributes: words.posAttributes,
    })
    .from(words)
    .where(inArray(words.pos, filters))
    .orderBy(asc(words.lemma));

  const entries = rows.map((row) => definition.mapRecord(row as WordRow));
  const serialized = entries.map((entry) => JSON.stringify(entry));
  const filePath = path.join(outputDir, definition.filename);
  const payload = serialized.join('\n') + (serialized.length ? '\n' : '');
  await writeFile(filePath, payload, 'utf8');
  return { count: entries.length, file: filePath };
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const filtered = parseArgs(argv);
  const targets: SupportedPos[] = filtered ?? (Object.keys(POS_EXPORTS) as SupportedPos[]);

  if (targets.length === 0) {
    console.log('No supported POS selected; nothing to export.');
    return;
  }

  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const outputDir = path.join(root, 'data', 'pos');
  await mkdir(outputDir, { recursive: true });

  const results = [];
  for (const pos of targets) {
    const result = await exportPos(pos, outputDir);
    results.push(result);
    console.log(`Exported ${result.count} ${pos} entries -> ${path.relative(root, result.file)}`);
  }

  console.log('POS JSONL export complete.');
}

main().catch((error) => {
  console.error('Failed to export POS JSONL files', error);
  process.exit(1);
});
