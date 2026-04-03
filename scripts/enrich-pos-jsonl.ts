import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { and, asc, eq, inArray } from 'drizzle-orm';

import { getDb, getPool, words, type Word } from '@db';

import { updateWordById } from '../server/routes/admin/services.js';
import { buildGroqWordEnrichment } from '../server/services/groq-word-enrichment.js';
import { rebuildTaskSpecs } from './build-tasks.js';
import { applyMigrations } from './db-push.js';
import { exportPos } from './export-pos-jsonl.js';
import { seedDatabase } from './seed.js';

type SupportedPos = 'V' | 'N' | 'Adj';

interface BatchOptions {
  pos: SupportedPos[] | null;
  level: string | null;
  limit: number;
  overwrite: boolean;
  approvedOnly: boolean;
}

interface EnrichmentSummary {
  selected: number;
  updated: number;
  exportedPos: SupportedPos[];
}

const COMMON_UPDATE_KEYS = ['english', 'exampleDe', 'exampleEn'] as const;
const POS_UPDATE_KEYS: Record<SupportedPos, readonly string[]> = {
  V: ['aux', 'separable', 'praesensIch', 'praesensEr', 'praeteritum', 'partizipIi', 'perfekt'],
  N: ['gender', 'plural'],
  Adj: ['comparative', 'superlative'],
};

interface BatchDeps {
  applyMigrations(): Promise<void>;
  seedDatabase(rootDir: string): Promise<void>;
  listWords(options: BatchOptions): Promise<Word[]>;
  buildGroqWordEnrichment(word: Word, options: { overwrite?: boolean }): Promise<Record<string, unknown>>;
  updateWordById(
    id: number,
    data: Record<string, unknown>,
    options: { rebuildDerivedContent?: boolean },
  ): Promise<unknown>;
  exportPos(pos: SupportedPos, outputDir: string): Promise<{ count: number; file: string }>;
  rebuildTaskSpecs(): Promise<void>;
}

const SUPPORTED_POS: SupportedPos[] = ['V', 'N', 'Adj'];

function parseBooleanFlag(argv: readonly string[], flag: string): boolean {
  return argv.includes(flag);
}

function parseStringOption(argv: readonly string[], prefix: string): string | null {
  const match = argv.find((value) => value.startsWith(prefix));
  if (!match) {
    return null;
  }
  const value = match.slice(prefix.length).trim();
  return value.length > 0 ? value : null;
}

function parsePosFilters(raw: string | null): SupportedPos[] | null {
  if (!raw) {
    return null;
  }

  const values = raw
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => entry.toUpperCase());

  const resolved = values.flatMap<SupportedPos>((entry) => {
    if (entry === 'V' || entry === 'VERB') return ['V'];
    if (entry === 'N' || entry === 'NOUN') return ['N'];
    if (entry === 'ADJ' || entry === 'ADJECTIVE') return ['Adj'];
    return [];
  });

  const unique = Array.from(new Set(resolved));
  return unique.length > 0 ? unique : null;
}

function parseArgs(argv: readonly string[]): BatchOptions {
  const rawPos = parseStringOption(argv, '--pos=');
  const rawLevel = parseStringOption(argv, '--level=');
  const rawLimit = parseStringOption(argv, '--limit=');

  const parsedLimit = rawLimit ? Number.parseInt(rawLimit, 10) : 25;
  const limit = Number.isFinite(parsedLimit) && parsedLimit > 0 ? parsedLimit : 25;

  return {
    pos: parsePosFilters(rawPos),
    level: rawLevel ? rawLevel.toUpperCase() : null,
    limit,
    overwrite: parseBooleanFlag(argv, '--overwrite'),
    approvedOnly: !parseBooleanFlag(argv, '--include-unapproved'),
  };
}

function hasText(value: string | null | undefined): boolean {
  return typeof value === 'string' && value.trim().length > 0;
}

export function needsEnrichment(word: Pick<
  Word,
  | 'pos'
  | 'english'
  | 'exampleDe'
  | 'exampleEn'
  | 'gender'
  | 'plural'
  | 'aux'
  | 'praesensIch'
  | 'praesensEr'
  | 'praeteritum'
  | 'partizipIi'
  | 'perfekt'
  | 'comparative'
  | 'superlative'
>): boolean {
  if (!hasText(word.english) || !hasText(word.exampleDe) || !hasText(word.exampleEn)) {
    return true;
  }

  switch (word.pos) {
    case 'V':
      return !hasText(word.aux) ||
        !hasText(word.praeteritum) ||
        !hasText(word.partizipIi) ||
        !hasText(word.perfekt);
    case 'N':
      return !hasText(word.gender) || !hasText(word.plural);
    case 'Adj':
      return !hasText(word.comparative) || !hasText(word.superlative);
    default:
      return false;
  }
}

export function selectTargets(wordsToFilter: Word[], options: BatchOptions): Word[] {
  const filtered = options.overwrite
    ? wordsToFilter
    : wordsToFilter.filter((word) => needsEnrichment(word));
  return filtered.slice(0, options.limit);
}

async function listWordsForEnrichment(options: BatchOptions): Promise<Word[]> {
  const db = getDb();
  const conditions = [];

  if (options.pos && options.pos.length > 0) {
    conditions.push(inArray(words.pos, options.pos));
  }
  if (options.level) {
    conditions.push(eq(words.level, options.level));
  }
  if (options.approvedOnly) {
    conditions.push(eq(words.approved, true));
  }

  const rows = await db
    .select()
    .from(words)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(asc(words.pos), asc(words.lemma));

  return rows;
}

function didWordChange(before: Word, updates: Record<string, unknown>): boolean {
  return Object.entries(updates).some(([key, value]) => {
    if (key === 'enrichmentAppliedAt' || key === 'enrichmentMethod') {
      return false;
    }
    return before[key as keyof Word] !== value;
  });
}

export function sanitizeEnrichmentUpdates(
  word: Pick<Word, 'pos'>,
  enrichment: Record<string, unknown>,
): Record<string, unknown> {
  const allowed = new Set<string>([
    ...COMMON_UPDATE_KEYS,
    ...(POS_UPDATE_KEYS[word.pos as SupportedPos] ?? []),
  ]);

  const sanitizedEntries = Object.entries(enrichment).filter(([key, value]) => {
    if (key === 'enrichmentAppliedAt' || key === 'enrichmentMethod') {
      return false;
    }
    if (!allowed.has(key)) {
      return false;
    }
    return value !== undefined;
  });

  return Object.fromEntries(sanitizedEntries);
}

export async function runEnrichmentBatch(
  rootDir: string,
  options: BatchOptions,
  deps: BatchDeps,
): Promise<EnrichmentSummary> {
  if (!process.env.GROQ_API_KEY) {
    throw new Error('GROQ_API_KEY is required for batch enrichment.');
  }

  await deps.applyMigrations();
  await deps.seedDatabase(rootDir);

  const available = await deps.listWords(options);
  const targets = selectTargets(available, options);
  const touchedPos = new Set<SupportedPos>();
  let updated = 0;

  for (const word of targets) {
    const enrichment = await deps.buildGroqWordEnrichment(word, {
      overwrite: options.overwrite,
    });
    const sanitized = sanitizeEnrichmentUpdates(word, enrichment);

    if (Object.keys(sanitized).length === 0 || !didWordChange(word, sanitized)) {
      continue;
    }

    await deps.updateWordById(word.id, sanitized, {
      rebuildDerivedContent: false,
    });
    touchedPos.add(word.pos as SupportedPos);
    updated += 1;
  }

  if (updated > 0) {
    for (const pos of touchedPos) {
      await deps.exportPos(pos, path.join(rootDir, 'data', 'pos'));
    }
    await deps.seedDatabase(rootDir);
    await deps.rebuildTaskSpecs();
  }

  return {
    selected: targets.length,
    updated,
    exportedPos: Array.from(touchedPos),
  };
}

const defaultDeps: BatchDeps = {
  applyMigrations: async () => {
    await applyMigrations(getPool());
  },
  seedDatabase: async (rootDir) => {
    await seedDatabase(rootDir);
  },
  listWords: listWordsForEnrichment,
  buildGroqWordEnrichment,
  updateWordById: async (id, data, options) =>
    updateWordById(id, data, options),
  exportPos,
  rebuildTaskSpecs,
};

export async function main(argv: readonly string[] = process.argv.slice(2)): Promise<void> {
  const scriptPath = fileURLToPath(import.meta.url);
  const rootDir = path.resolve(path.dirname(scriptPath), '..');
  const options = parseArgs(argv);
  const pool = getPool();

  try {
    const summary = await runEnrichmentBatch(rootDir, options, defaultDeps);
    console.log(
      `Selected ${summary.selected} words, updated ${summary.updated}, exported ${summary.exportedPos.join(', ') || 'none'}.`,
    );
  } finally {
    await pool.end();
  }
}

const scriptPath = fileURLToPath(import.meta.url);
const invokedPath = path.resolve(process.argv[1] ?? '');

if (scriptPath === invokedPath) {
  main().catch((error) => {
    console.error('Failed to enrich POS JSONL files', error);
    process.exit(1);
  });
}
