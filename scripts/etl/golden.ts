import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { eq, inArray, sql } from 'drizzle-orm';
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
  inflections as inflectionsTable,
  lexemes as lexemesTable,
  taskSpecs as taskSpecsTable,
} from '@db/schema';

import type { AggregatedWord } from './types';
import { buildAttributionSummary } from './attribution';
import type { AttributionEntry } from './attribution';
import { collectSources, deriveSourceRevision, primarySourceId } from './sources';
import { validateWord } from './validators';
import { stableStringify, sha1 } from './utils';

const STABLE_TIMESTAMP = Math.floor(new Date('2025-01-01T00:00:00Z').getTime() / 1000);

const LOG_VALIDATION_WARNINGS =
  process.env.GOLDEN_LOG_VALIDATION_WARNINGS?.toLowerCase() === 'true';

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

export interface LexemeInventory {
  lexemes: LexemeSeed[];
  inflections: InflectionSeed[];
  attribution: AttributionEntry[];
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

export function buildLexemeInventory(words: AggregatedWord[]): LexemeInventory {
  const lexemeMap = new Map<string, LexemeSeed>();
  const allInflections: InflectionSeed[] = [];

  for (const word of words) {
    const validation = validateWord(word);
    if (LOG_VALIDATION_WARNINGS && validation.errors.length > 0) {
      console.warn(
        `[etl] lexeme ${word.lemma} (${word.pos}) has validation issues: ${validation.errors.join(', ')}`,
      );
    }
    const lexeme = createLexemeSeed(word);
    if (!lexemeMap.has(lexeme.id)) {
      lexemeMap.set(lexeme.id, lexeme);
    }
    const lexemeInflections = createInflectionsForWord(word, lexeme.id);
    allInflections.push(...lexemeInflections);
  }

  const lexemes = Array.from(lexemeMap.values()).sort((a, b) => {
    const lemmaCompare = a.lemma.localeCompare(b.lemma, 'de');
    if (lemmaCompare !== 0) return lemmaCompare;
    return a.id.localeCompare(b.id);
  });

  const inflections = dedupeInflections(allInflections).sort((a, b) => {
    const lexemeCompare = a.lexemeId.localeCompare(b.lexemeId);
    if (lexemeCompare !== 0) return lexemeCompare;
    return a.form.localeCompare(b.form, 'de');
  });

  return {
    lexemes,
    inflections,
    attribution: buildAttributionSummary(words),
  };
}

export async function upsertLexemeInventory(
  db: DrizzleDatabase,
  inventory: LexemeInventory,
): Promise<void> {
  const incomingLexemeIds = new Set(inventory.lexemes.map((lexeme) => lexeme.id));
  const existingLexemes = await db.select({ id: lexemesTable.id }).from(lexemesTable);

  if (incomingLexemeIds.size === 0) {
    if (existingLexemes.length > 0) {
      await db.delete(lexemesTable);
    }
  } else {
    const staleLexemeIds = existingLexemes
      .map((row) => row.id)
      .filter((id): id is string => Boolean(id) && !incomingLexemeIds.has(id));
    if (staleLexemeIds.length > 0) {
      await db.delete(lexemesTable).where(inArray(lexemesTable.id, staleLexemeIds));
    }
  }

  if (inventory.lexemes.length > 0) {
    await db
      .insert(lexemesTable)
      .values(withDateColumns(inventory.lexemes))
      .onConflictDoUpdate({
        target: lexemesTable.id,
        set: {
          lemma: sql`excluded.lemma`,
          pos: sql`excluded.pos`,
          gender: sql`excluded.gender`,
          metadata: sql`excluded.metadata`,
          frequencyRank: sql`excluded.frequency_rank`,
          sourceIds: sql`excluded.source_ids`,
          updatedAt: sql`now()`,
        },
      });
  }

  const inflectionsByLexeme = new Map<string, string[]>();
  for (const inflection of inventory.inflections) {
    const ids = inflectionsByLexeme.get(inflection.lexemeId) ?? [];
    ids.push(inflection.id);
    inflectionsByLexeme.set(inflection.lexemeId, ids);
  }

  for (const [lexemeId, ids] of inflectionsByLexeme) {
    const existing = await db
      .select({ id: inflectionsTable.id })
      .from(inflectionsTable)
      .where(eq(inflectionsTable.lexemeId, lexemeId));
    const existingIds = new Set(existing.map((row) => row.id));
    for (const id of ids) {
      existingIds.delete(id);
    }
    const staleIds = Array.from(existingIds);
    if (staleIds.length > 0) {
      await db.delete(inflectionsTable).where(inArray(inflectionsTable.id, staleIds));
    }
  }

  if (inventory.inflections.length > 0) {
    await db
      .insert(inflectionsTable)
      .values(withDateColumns(inventory.inflections))
      .onConflictDoUpdate({
        target: inflectionsTable.id,
        set: {
          form: sql`excluded.form`,
          features: sql`excluded.features`,
          audioAsset: sql`excluded.audio_asset`,
          sourceRevision: sql`excluded.source_revision`,
          checksum: sql`excluded.checksum`,
          updatedAt: sql`now()`,
        },
      });
  }
}

export async function upsertGoldenBundles(
  db: DrizzleDatabase,
  bundles: PackBundle[],
): Promise<void> {
  if (bundles.length === 0) return;
  const allTaskIds = bundles.flatMap((bundle) => bundle.tasks.map((task) => task.id));
  if (allTaskIds.length) {
    await db.delete(taskSpecsTable).where(inArray(taskSpecsTable.id, allTaskIds));
  }

  for (const bundle of bundles) {
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

  const attribution = buildAttributionSummary(words);
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
    attribution,
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
    .filter((word) => word.pos === 'V')
    .filter((word) => validateWord(word).errors.length === 0)
    .sort((a, b) => a.lemma.localeCompare(b.lemma, 'de'))
    .slice(0, 50);
}

function selectNouns(words: AggregatedWord[]): AggregatedWord[] {
  return words
    .filter((word) => word.pos === 'N')
    .filter((word) => validateWord(word).errors.length === 0)
    .sort((a, b) => a.lemma.localeCompare(b.lemma, 'de'))
    .slice(0, 50);
}

function selectAdjectives(words: AggregatedWord[]): AggregatedWord[] {
  return words
    .filter((word) => word.pos === 'Adj')
    .filter((word) => validateWord(word).errors.length === 0)
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
  };

  const tags = word.posAttributes?.tags ?? null;
  if (Array.isArray(tags) && tags.length > 0) {
    metadata.tags = Array.from(new Set(tags)).sort();
  }

  const posNotes = word.posAttributes?.notes ?? null;
  if (Array.isArray(posNotes) && posNotes.length > 0) {
    metadata.posNotes = [...posNotes];
  }

  const prepositionAttributes = word.posAttributes?.preposition ?? null;
  if (prepositionAttributes) {
    const payload: Record<string, unknown> = {};
    if (Array.isArray(prepositionAttributes.cases) && prepositionAttributes.cases.length > 0) {
      payload.cases = [...prepositionAttributes.cases];
    }
    if (Array.isArray(prepositionAttributes.notes) && prepositionAttributes.notes.length > 0) {
      payload.notes = [...prepositionAttributes.notes];
    }
    if (Object.keys(payload).length > 0) {
      metadata.preposition = payload;
    }
  }

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
  const sourceRevision = deriveSourceRevision(word);

  if (pos === 'verb') {
    base.push(
      ...createInflectionEntries(
        lexemeId,
        [
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
        ],
        sourceRevision,
      ),
    );
  } else if (pos === 'noun') {
    base.push(
      ...createInflectionEntries(
        lexemeId,
        [
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
        ],
        sourceRevision,
      ),
    );
  } else if (pos === 'adjective') {
    base.push(
      ...createInflectionEntries(
        lexemeId,
        [
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
        ],
        sourceRevision,
      ),
    );
  } else if (pos === 'adverb') {
    base.push(
      ...createInflectionEntries(
        lexemeId,
        [
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
        ],
        sourceRevision,
      ),
    );
  } else if (pos === 'preposition') {
    const governedCases = word.posAttributes?.preposition?.cases ?? null;
    base.push(
      ...createInflectionEntries(
        lexemeId,
        [
          {
            form: word.lemma,
            features: {
              slot: 'lemma',
              governedCases: Array.isArray(governedCases) && governedCases.length > 0 ? governedCases : undefined,
            },
          },
        ],
        sourceRevision,
      ),
    );
  } else {
    base.push(
      ...createInflectionEntries(
        lexemeId,
        [
          {
            form: word.lemma,
            features: { slot: 'lemma' },
          },
        ],
        sourceRevision,
      ),
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
  sourceRevision: string,
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
      sourceRevision,
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

function mapPos(pos: PartOfSpeech): LexemePos {
  switch (pos) {
    case 'V':
      return 'verb';
    case 'N':
      return 'noun';
    case 'Adj':
      return 'adjective';
    case 'Adv':
      return 'adverb';
    case 'Pron':
      return 'pronoun';
    case 'Det':
      return 'determiner';
    case 'Präp':
      return 'preposition';
    case 'Konj':
      return 'conjunction';
    case 'Num':
      return 'numeral';
    case 'Part':
      return 'particle';
    case 'Interj':
      return 'interjection';
    default:
      throw new Error(`Unsupported part of speech for golden pack: ${pos}`);
  }
}
