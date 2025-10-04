import { createHash } from 'node:crypto';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { inArray, sql } from 'drizzle-orm';
import fs from 'node:fs/promises';
import path from 'node:path';

import type { PartOfSpeech } from '@shared';
import {
  type LexemePos,
  taskTypeRegistry,
  validateTaskAgainstRegistry,
  type TaskType,
} from '@shared/task-registry';

import {
  contentPacks,
  inflections as inflectionsTable,
  lexemes as lexemesTable,
  packLexemeMap as packLexemeMapTable,
  taskSpecs as taskSpecsTable,
} from '@db/schema';

const STABLE_TIMESTAMP = Math.floor(new Date('2025-01-01T00:00:00Z').getTime() / 1000);

type TimestampSeed = { createdAt: number; updatedAt: number };

function toDate(timestamp: number): Date {
  return new Date(timestamp * 1000);
}

function withDateColumns<T extends TimestampSeed>(
  rows: T[],
): Array<Omit<T, 'createdAt' | 'updatedAt'> & { createdAt: Date; updatedAt: Date }> {
  return rows.map((row) => ({
    ...row,
    createdAt: toDate(row.createdAt),
    updatedAt: toDate(row.updatedAt),
  }));
}

export interface AggregatedWord {
  lemma: string;
  pos: PartOfSpeech;
  level: string | null;
  english: string | null;
  exampleDe: string | null;
  exampleEn: string | null;
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
  canonical: boolean;
  complete: boolean;
  sourcesCsv: string | null;
  sourceNotes: string | null;
}

export interface LexemeSeed {
  id: string;
  lemma: string;
  language: string;
  pos: LexemePos;
  gender: string | null;
  metadata: Record<string, unknown>;
  frequencyRank: number | null;
  sourceIds: string[];
  createdAt: number;
  updatedAt: number;
}

export interface InflectionSeed {
  id: string;
  lexemeId: string;
  form: string;
  features: Record<string, unknown>;
  audioAsset: string | null;
  sourceRevision: string | null;
  checksum: string | null;
  createdAt: number;
  updatedAt: number;
}

export interface TaskSpecSeed {
  id: string;
  lexemeId: string;
  pos: LexemePos;
  taskType: TaskType;
  renderer: string;
  prompt: Record<string, unknown>;
  solution: Record<string, unknown>;
  hints: unknown[] | null;
  metadata: Record<string, unknown> | null;
  revision: number;
  sourcePack: string;
  createdAt: number;
  updatedAt: number;
}

export interface PackSeed {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  language: string;
  posScope: LexemePos | 'mixed';
  license: string;
  licenseNotes: string | null;
  version: number;
  checksum: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: number;
  updatedAt: number;
}

export interface PackLexemeSeed {
  packId: string;
  lexemeId: string;
  primaryTaskId: string | null;
  position: number;
  notes: string | null;
  createdAt: number;
  updatedAt: number;
}

export interface PackBundle {
  pack: PackSeed;
  lexemes: LexemeSeed[];
  inflections: InflectionSeed[];
  tasks: TaskSpecSeed[];
  packLexemes: PackLexemeSeed[];
}

type DrizzleDatabase = NodePgDatabase<typeof import('@db/schema')>;

export function buildGoldenBundles(words: AggregatedWord[]): PackBundle[] {
  const verbs = selectVerbs(words);
  const nouns = selectNouns(words);
  const adjectives = selectAdjectives(words);

  const verbBundle = createPackBundle({
    slug: 'verbs-foundation',
    name: 'Verbs – Foundation',
    description: 'Core German verbs with Präteritum and Partizip II practice prompts.',
    posScope: 'verb',
    license: 'CC-BY-SA-4.0',
    words: verbs,
    taskType: 'conjugate_form',
  });

  const nounBundle = createPackBundle({
    slug: 'nouns-foundation',
    name: 'Nouns – Foundation',
    description: 'High-frequency nouns focusing on plural formation and case marking.',
    posScope: 'noun',
    license: 'CC-BY-SA-4.0',
    words: nouns,
    taskType: 'noun_case_declension',
  });

  const adjectiveBundle = createPackBundle({
    slug: 'adjectives-foundation',
    name: 'Adjectives – Foundation',
    description: 'Comparative and superlative tasks for common adjectives.',
    posScope: 'adjective',
    license: 'CC-BY-SA-4.0',
    words: adjectives,
    taskType: 'adj_ending',
  });

  return [verbBundle, nounBundle, adjectiveBundle].filter(
    (bundle): bundle is PackBundle => bundle.lexemes.length > 0,
  );
}

export async function upsertGoldenBundles(
  db: DrizzleDatabase,
  bundles: PackBundle[],
): Promise<void> {
  if (bundles.length === 0) return;
  const allLexemeIds = bundles.flatMap((bundle) => bundle.lexemes.map((lexeme) => lexeme.id));
  const allTaskIds = bundles.flatMap((bundle) => bundle.tasks.map((task) => task.id));
  const allPackIds = bundles.map((bundle) => bundle.pack.id);

  if (allPackIds.length) {
    await db.delete(packLexemeMapTable).where(inArray(packLexemeMapTable.packId, allPackIds));
    await db.delete(contentPacks).where(inArray(contentPacks.id, allPackIds));
  }
  if (allTaskIds.length) {
    await db.delete(taskSpecsTable).where(inArray(taskSpecsTable.id, allTaskIds));
  }
  if (allLexemeIds.length) {
    await db.delete(inflectionsTable).where(inArray(inflectionsTable.lexemeId, allLexemeIds));
    await db.delete(lexemesTable).where(inArray(lexemesTable.id, allLexemeIds));
  }

  for (const bundle of bundles) {
    if (bundle.lexemes.length > 0) {
      await db
        .insert(lexemesTable)
        .values(withDateColumns(bundle.lexemes))
        .onConflictDoUpdate({
          target: lexemesTable.id,
          set: {
            lemma: sql`excluded.lemma`,
            pos: sql`excluded.pos`,
            gender: sql`excluded.gender`,
            metadata: sql`excluded.metadata`,
            sourceIds: sql`excluded.source_ids`,
            updatedAt: sql`now()`,
          },
        });
    }

    if (bundle.inflections.length > 0) {
      await db
        .insert(inflectionsTable)
        .values(withDateColumns(bundle.inflections))
        .onConflictDoUpdate({
          target: inflectionsTable.id,
          set: {
            form: sql`excluded.form`,
            features: sql`excluded.features`,
            checksum: sql`excluded.checksum`,
            updatedAt: sql`now()`,
          },
        });
    }

    if (bundle.tasks.length > 0) {
      await db
        .insert(taskSpecsTable)
        .values(withDateColumns(bundle.tasks))
        .onConflictDoUpdate({
          target: taskSpecsTable.id,
          set: {
            prompt: sql`excluded.prompt`,
            solution: sql`excluded.solution`,
            hints: sql`excluded.hints`,
            metadata: sql`excluded.metadata`,
            updatedAt: sql`now()`,
          },
        });
    }

    await db
      .insert(contentPacks)
      .values(withDateColumns([bundle.pack]))
      .onConflictDoUpdate({
        target: contentPacks.id,
        set: {
          name: sql`excluded.name`,
          description: sql`excluded.description`,
          checksum: sql`excluded.checksum`,
          metadata: sql`excluded.metadata`,
          updatedAt: sql`now()`,
        },
      });

    if (bundle.packLexemes.length > 0) {
      await db.insert(packLexemeMapTable).values(withDateColumns(bundle.packLexemes));
    }
  }
}

export async function writeGoldenBundlesToDisk(
  rootDir: string,
  bundles: PackBundle[],
): Promise<void> {
  if (bundles.length === 0) return;
  const packsDir = path.join(rootDir, 'data', 'packs');
  await fs.mkdir(packsDir, { recursive: true });

  for (const bundle of bundles) {
    const filename = `${bundle.pack.slug}.v${bundle.pack.version}.json`;
    const filePath = path.join(packsDir, filename);
    const payload = {
      pack: bundle.pack,
      lexemes: bundle.lexemes,
      inflections: bundle.inflections,
      tasks: bundle.tasks,
      packLexemeMap: bundle.packLexemes,
    };
    await fs.writeFile(filePath, JSON.stringify(payload, null, 2), 'utf8');
  }
}

interface PackBundleConfig {
  slug: string;
  name: string;
  description: string;
  posScope: LexemePos;
  license: string;
  words: AggregatedWord[];
  taskType: TaskType;
}

function createPackBundle(config: PackBundleConfig): PackBundle {
  const { slug, name, description, posScope, license, words, taskType } = config;
  if (words.length === 0) {
    return {
      pack: createEmptyPack(slug, name, description, posScope, license),
      lexemes: [],
      inflections: [],
      tasks: [],
      packLexemes: [],
    };
  }

  const lexemes: LexemeSeed[] = [];
  const inflections: InflectionSeed[] = [];
  const tasks: TaskSpecSeed[] = [];
  const packLexemes: PackLexemeSeed[] = [];

  words.forEach((word, index) => {
    const lexeme = createLexemeSeed(word);
    lexemes.push(lexeme);

    const lexemeInflections = createInflectionsForWord(word, lexeme.id);
    inflections.push(...lexemeInflections);

    const lexemeTasks = createTasksForWord(word, lexeme.id, taskType, slug);
    tasks.push(...lexemeTasks);

    const primaryTaskId = lexemeTasks[0]?.id ?? null;
    packLexemes.push({
      packId: packIdForSlug(slug, 1),
      lexemeId: lexeme.id,
      primaryTaskId,
      position: index + 1,
      notes: null,
      createdAt: STABLE_TIMESTAMP,
      updatedAt: STABLE_TIMESTAMP,
    });
  });

  const packMetadata: Record<string, unknown> = {
    taskTypes: Array.from(new Set(tasks.map((task) => task.taskType))).sort(),
    size: lexemes.length,
    cefrLevels: Array.from(
      new Set(
        lexemes
          .map((lexeme) => (lexeme.metadata.level as string | undefined) ?? null)
          .filter((level): level is string => Boolean(level)),
      ),
    ).sort(),
  };

  const checksumPayload = stableStringify({ lexemes, inflections, tasks });
  const checksum = sha1(checksumPayload);

  const pack: PackSeed = {
    id: packIdForSlug(slug, 1),
    slug,
    name,
    description,
    language: 'de',
    posScope,
    license,
    licenseNotes: null,
    version: 1,
    checksum,
    metadata: packMetadata,
    createdAt: STABLE_TIMESTAMP,
    updatedAt: STABLE_TIMESTAMP,
  };

  return { pack, lexemes, inflections, tasks, packLexemes };
}

function createEmptyPack(
  slug: string,
  name: string,
  description: string,
  posScope: LexemePos,
  license: string,
): PackSeed {
  return {
    id: packIdForSlug(slug, 1),
    slug,
    name,
    description,
    language: 'de',
    posScope,
    license,
    licenseNotes: null,
    version: 1,
    checksum: null,
    metadata: null,
    createdAt: STABLE_TIMESTAMP,
    updatedAt: STABLE_TIMESTAMP,
  };
}
function selectVerbs(words: AggregatedWord[]): AggregatedWord[] {
  return words
    .filter((word) => word.pos === 'V' && Boolean(word.praeteritum) && Boolean(word.partizipIi))
    .sort((a, b) => a.lemma.localeCompare(b.lemma, 'de'))
    .slice(0, 50);
}

function selectNouns(words: AggregatedWord[]): AggregatedWord[] {
  return words
    .filter((word) => word.pos === 'N' && Boolean(word.plural) && Boolean(word.gender))
    .sort((a, b) => a.lemma.localeCompare(b.lemma, 'de'))
    .slice(0, 50);
}

function selectAdjectives(words: AggregatedWord[]): AggregatedWord[] {
  return words
    .filter((word) => word.pos === 'Adj' && Boolean(word.comparative) && Boolean(word.superlative))
    .sort((a, b) => a.lemma.localeCompare(b.lemma, 'de'))
    .slice(0, 40);
}

function createLexemeSeed(word: AggregatedWord): LexemeSeed {
  const pos = mapPos(word.pos);
  const lemmaSlug = normaliseLemma(word.lemma);
  const primarySource = primarySourceId(word);
  const idHash = sha1(`${pos}:${lemmaSlug}:${primarySource}`);
  const lexemeId = `de:${pos}:${lemmaSlug}:${idHash.slice(0, 8)}`;

  const metadata: Record<string, unknown> = {
    level: word.level ?? undefined,
    english: word.english ?? undefined,
    example: normaliseExample(word.exampleDe, word.exampleEn),
    separable: word.separable ?? undefined,
    auxiliary: word.aux ?? undefined,
    perfekt: word.perfekt ?? undefined,
    notes: word.sourceNotes ?? undefined,
  };

  if (!metadata.example) {
    delete metadata.example;
  }

  const cleanedMetadata = Object.fromEntries(
    Object.entries(metadata).filter(([, value]) => value !== undefined && value !== null),
  );

  return {
    id: lexemeId,
    lemma: word.lemma,
    language: 'de',
    pos,
    gender: pos === 'noun' ? word.gender ?? null : null,
    metadata: cleanedMetadata,
    frequencyRank: null,
    sourceIds: collectSources(word),
    createdAt: STABLE_TIMESTAMP,
    updatedAt: STABLE_TIMESTAMP,
  };
}

function createInflectionsForWord(word: AggregatedWord, lexemeId: string): InflectionSeed[] {
  const pos = mapPos(word.pos);
  const base: InflectionSeed[] = [];

  if (pos === 'verb') {
    base.push(
      ...createInflectionEntries(lexemeId, [
        {
          form: word.lemma,
          features: { tense: 'infinitive', mood: 'indicative' },
        },
        word.praesensIch
          ? {
              form: word.praesensIch,
              features: { tense: 'present', mood: 'indicative', person: 1, number: 'singular' },
            }
          : undefined,
        word.praesensEr
          ? {
              form: word.praesensEr,
              features: { tense: 'present', mood: 'indicative', person: 3, number: 'singular' },
            }
          : undefined,
        word.praeteritum
          ? {
              form: word.praeteritum,
              features: { tense: 'past', mood: 'indicative', person: 3, number: 'singular' },
            }
          : undefined,
        word.partizipIi
          ? {
              form: word.partizipIi,
              features: { tense: 'participle', aspect: 'perfect' },
            }
          : undefined,
        word.perfekt
          ? {
              form: word.perfekt,
              features: { tense: 'perfect', auxiliary: word.aux ?? undefined },
            }
          : undefined,
      ]),
    );
  } else if (pos === 'noun') {
    base.push(
      ...createInflectionEntries(lexemeId, [
        {
          form: word.lemma,
          features: { case: 'nominative', number: 'singular', gender: word.gender ?? undefined },
        },
        word.plural
          ? {
              form: word.plural,
              features: { case: 'nominative', number: 'plural' },
            }
          : undefined,
      ]),
    );
  } else if (pos === 'adjective') {
    base.push(
      ...createInflectionEntries(lexemeId, [
        {
          form: word.lemma,
          features: { degree: 'positive' },
        },
        word.comparative
          ? {
              form: word.comparative,
              features: { degree: 'comparative' },
            }
          : undefined,
        word.superlative
          ? {
              form: word.superlative,
              features: { degree: 'superlative' },
            }
          : undefined,
      ]),
    );
  }

  const unique = dedupeInflections(base);
  return unique;
}

interface TaskDefinition {
  formKey: string;
  solution: string;
  prompt: Record<string, unknown>;
  hints: unknown[];
  metadata: Record<string, unknown>;
}

function createTasksForWord(
  word: AggregatedWord,
  lexemeId: string,
  taskType: keyof typeof taskTypeRegistry,
  sourcePack: string,
): TaskSpecSeed[] {
  const pos = mapPos(word.pos);
  const tasks: TaskDefinition[] = [];

  if (taskType === 'conjugate_form' && word.praeteritum) {
    const prompt = {
      lemma: word.lemma,
      pos,
      requestedForm: {
        tense: 'past',
        mood: 'indicative',
        person: 3,
        number: 'singular',
      },
      cefrLevel: word.level ?? undefined,
      instructions: `Konjugiere "${word.lemma}" in der Präteritumform (er/sie/es).`,
      example: normaliseExample(word.exampleDe, word.exampleEn),
    };

    tasks.push({
      formKey: 'praeteritum',
      solution: word.praeteritum,
      prompt,
      hints: buildHints(word),
      metadata: {
        aux: word.aux ?? undefined,
        separable: word.separable ?? undefined,
      },
    });
  }

  if (taskType === 'conjugate_form' && word.partizipIi) {
    const prompt = {
      lemma: word.lemma,
      pos,
      requestedForm: {
        tense: 'participle',
        mood: 'indicative',
        voice: 'active',
      },
      cefrLevel: word.level ?? undefined,
      instructions: `Gib das Partizip II von "${word.lemma}" an.`,
      example: normaliseExample(word.exampleDe, word.exampleEn),
    };

    tasks.push({
      formKey: 'partizipIi',
      solution: word.partizipIi,
      prompt,
      hints: buildHints(word),
      metadata: {
        aux: word.aux ?? undefined,
      },
    });
  }

  if (taskType === 'noun_case_declension' && word.plural) {
    const prompt = {
      lemma: word.lemma,
      pos,
      gender: word.gender ?? undefined,
      requestedCase: 'accusative',
      requestedNumber: 'plural',
      cefrLevel: word.level ?? undefined,
      instructions: `Bilde die Akkusativ Plural-Form von "${word.lemma}".`,
      example: normaliseExample(word.exampleDe, word.exampleEn),
    };

    tasks.push({
      formKey: 'plural',
      solution: word.plural,
      prompt,
      hints: buildHints(word),
      metadata: {
        article: word.gender ?? undefined,
      },
    });
  }

  if (taskType === 'adj_ending' && word.comparative) {
    const prompt = {
      lemma: word.lemma,
      pos,
      degree: 'comparative',
      cefrLevel: word.level ?? undefined,
      instructions: `Bilde den Komparativ von "${word.lemma}".`,
      example: normaliseExample(word.exampleDe, word.exampleEn),
      syntacticFrame: 'Der ____ Wagen ist schneller.',
    };

    tasks.push({
      formKey: 'comparative',
      solution: word.comparative,
      prompt,
      hints: buildHints(word),
      metadata: {},
    });
  }

  const results: TaskSpecSeed[] = [];

  tasks.forEach((task, index) => {
    validateTaskAgainstRegistry(taskType, pos, taskTypeRegistry[taskType].renderer, task.prompt, {
      form: task.solution,
    });

    const revision = index + 1;
    const taskId = createTaskId(lexemeId, taskType, revision, task.formKey);
    const payload: TaskSpecSeed = {
      id: taskId,
      lexemeId,
      pos,
      taskType,
      renderer: taskTypeRegistry[taskType].renderer,
      prompt: pruneUndefined(task.prompt),
      solution: { form: task.solution },
      hints: task.hints.length ? task.hints : null,
      metadata: Object.keys(task.metadata).length ? pruneUndefined(task.metadata) : null,
      revision,
      sourcePack: sourcePack,
      createdAt: STABLE_TIMESTAMP,
      updatedAt: STABLE_TIMESTAMP,
    };

    results.push(payload);
  });

  return results;
}

function createInflectionEntries(
  lexemeId: string,
  entries: Array<{ form: string | null; features: Record<string, unknown> } | undefined>,
): InflectionSeed[] {
  const seeds: InflectionSeed[] = [];
  for (const entry of entries) {
    if (!entry?.form) continue;
    const featurePayload = pruneUndefined(entry.features);
    const checksum = sha1(stableStringify({ form: entry.form, features: featurePayload }));
    seeds.push({
      id: createInflectionId(lexemeId, featurePayload, entry.form),
      lexemeId,
      form: entry.form,
      features: featurePayload,
      audioAsset: null,
      sourceRevision: null,
      checksum: checksum.slice(0, 16),
      createdAt: STABLE_TIMESTAMP,
      updatedAt: STABLE_TIMESTAMP,
    });
  }
  return seeds;
}

function dedupeInflections(inflections: InflectionSeed[]): InflectionSeed[] {
  const seen = new Map<string, InflectionSeed>();
  for (const inflection of inflections) {
    if (!seen.has(inflection.id)) {
      seen.set(inflection.id, inflection);
    }
  }
  return Array.from(seen.values());
}

function createInflectionId(
  lexemeId: string,
  features: Record<string, unknown>,
  form: string,
): string {
  const hash = sha1(stableStringify({ lexemeId, features, form })).slice(0, 10);
  return `inf:${lexemeId}:${hash}`;
}

function createTaskId(
  lexemeId: string,
  taskType: string,
  revision: number,
  discriminator: string,
): string {
  const hash = sha1(`${lexemeId}:${taskType}:${revision}:${discriminator}`).slice(0, 8);
  return `task:${lexemeId}:${taskType}:${revision}:${hash}`;
}

function normaliseLemma(lemma: string): string {
  return lemma
    .normalize('NFKD')
    .replace(/[^\w\s-]/g, '')
    .replace(/\s+/g, '-')
    .toLowerCase();
}

function primarySourceId(word: AggregatedWord): string {
  const sources = collectSources(word);
  return sources[0] ?? 'words_all_sources';
}

function collectSources(word: AggregatedWord): string[] {
  if (!word.sourcesCsv) return ['words_all_sources'];
  return word.sourcesCsv
    .split(';')
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function buildHints(word: AggregatedWord): unknown[] {
  const hints: unknown[] = [];
  if (word.exampleDe) {
    hints.push({ type: 'example_de', value: word.exampleDe });
  }
  if (word.exampleEn) {
    hints.push({ type: 'example_en', value: word.exampleEn });
  }
  if (word.perfekt && word.aux) {
    hints.push({ type: 'auxiliary', value: word.aux });
  }
  return hints;
}

function normaliseExample(exampleDe: string | null, exampleEn: string | null):
  | {
      de?: string;
      en?: string;
    }
  | undefined {
  const payload: { de?: string; en?: string } = {};
  if (exampleDe) payload.de = exampleDe;
  if (exampleEn) payload.en = exampleEn;
  return Object.keys(payload).length ? payload : undefined;
}

function pruneUndefined<T extends Record<string, unknown>>(value: T): T {
  const entries = Object.entries(value).filter(([, v]) => v !== undefined && v !== null);
  return Object.fromEntries(entries) as T;
}

function packIdForSlug(slug: string, version: number): string {
  return `pack:${slug}:${version}`;
}

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(',')}]`;
  }
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => a.localeCompare(b));
  return `{${entries
    .map(([key, val]) => `${JSON.stringify(key)}:${stableStringify(val)}`)
    .join(',')}}`;
}

function sha1(payload: string): string {
  return createHash('sha1').update(payload).digest('hex');
}

function mapPos(pos: PartOfSpeech): LexemePos {
  switch (pos) {
    case 'V':
      return 'verb';
    case 'N':
      return 'noun';
    case 'Adj':
      return 'adjective';
    default:
      throw new Error(`Unsupported part of speech for golden pack: ${pos}`);
  }
}
