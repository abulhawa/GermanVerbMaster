import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { inArray, sql } from 'drizzle-orm';

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
import { chunkArray, stableStringify, sha1 } from './utils';

const INFLECTION_DELETE_CHUNK_SIZE = 500;
const TASK_DELETE_CHUNK_SIZE = 1000;

const LOG_VALIDATION_WARNINGS =
  process.env.GOLDEN_LOG_VALIDATION_WARNINGS?.toLowerCase() === 'true';

export interface LexemeSeed {
  id: string;
  lemma: string;
  language: string;
  pos: LexemePos;
  gender: string | null;
  metadata: Record<string, unknown>;
  frequencyRank: number | null;
  sourceIds: string[];
}

export interface InflectionSeed {
  id: string;
  lexemeId: string;
  form: string;
  features: Record<string, unknown>;
  audioAsset: string | null;
  sourceRevision: string | null;
  checksum: string | null;
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
}

export interface TaskInventory {
  tasks: TaskSpecSeed[];
}

interface TaskTemplateDefinition {
  key: string;
  taskType: TaskType;
  isAvailable(word: AggregatedWord): boolean;
  buildPrompt(word: AggregatedWord, pos: LexemePos): Record<string, unknown>;
  buildSolution(word: AggregatedWord): Record<string, unknown> & { form: string };
  buildMetadata?(word: AggregatedWord): Record<string, unknown> | null | undefined;
  buildHints?(word: AggregatedWord): unknown[];
}

export interface LexemeInventory {
  lexemes: LexemeSeed[];
  inflections: InflectionSeed[];
  attribution: AttributionEntry[];
}

type DrizzleDatabase = NodePgDatabase<typeof import('@db/schema')>;

const TASK_TEMPLATE_REGISTRY: Partial<Record<LexemePos, readonly TaskTemplateDefinition[]>> = {
  verb: [
    {
      key: 'praesens_ich',
      taskType: 'conjugate_form',
      isAvailable: (word) => Boolean(word.praesensIch),
      buildPrompt: (word, pos) => ({
        lemma: word.lemma,
        pos,
        requestedForm: {
          tense: 'present',
          mood: 'indicative',
          person: 1,
          number: 'singular',
        },
        cefrLevel: word.level ?? undefined,
        instructions: `Konjugiere "${word.lemma}" in der Präsensform (ich).`,
        example: normaliseExample(word.exampleDe, word.exampleEn),
      }),
      buildSolution: (word) => ({ form: word.praesensIch! }),
      buildMetadata: (word) => ({
        aux: word.aux ?? undefined,
        separable: word.separable ?? undefined,
      }),
    },
    {
      key: 'praesens_er',
      taskType: 'conjugate_form',
      isAvailable: (word) => Boolean(word.praesensEr),
      buildPrompt: (word, pos) => ({
        lemma: word.lemma,
        pos,
        requestedForm: {
          tense: 'present',
          mood: 'indicative',
          person: 3,
          number: 'singular',
        },
        cefrLevel: word.level ?? undefined,
        instructions: `Konjugiere "${word.lemma}" in der Präsensform (er/sie/es).`,
        example: normaliseExample(word.exampleDe, word.exampleEn),
      }),
      buildSolution: (word) => ({ form: word.praesensEr! }),
      buildMetadata: (word) => ({
        aux: word.aux ?? undefined,
        separable: word.separable ?? undefined,
      }),
    },
    {
      key: 'praeteritum',
      taskType: 'conjugate_form',
      isAvailable: (word) => Boolean(word.praeteritum),
      buildPrompt: (word, pos) => ({
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
      }),
      buildSolution: (word) => ({ form: word.praeteritum! }),
      buildMetadata: (word) => ({
        aux: word.aux ?? undefined,
        separable: word.separable ?? undefined,
      }),
    },
    {
      key: 'partizip_ii',
      taskType: 'conjugate_form',
      isAvailable: (word) => Boolean(word.partizipIi),
      buildPrompt: (word, pos) => ({
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
      }),
      buildSolution: (word) => ({ form: word.partizipIi! }),
      buildMetadata: (word) => ({
        aux: word.aux ?? undefined,
        separable: word.separable ?? undefined,
      }),
    },
  ],
  noun: [
    {
      key: 'accusative_plural',
      taskType: 'noun_case_declension',
      isAvailable: (word) => Boolean(word.plural),
      buildPrompt: (word, pos) => ({
        lemma: word.lemma,
        pos,
        gender: word.gender ?? undefined,
        requestedCase: 'accusative',
        requestedNumber: 'plural',
        cefrLevel: word.level ?? undefined,
        instructions: `Bilde die Akkusativ Plural-Form von "${word.lemma}".`,
        example: normaliseExample(word.exampleDe, word.exampleEn),
      }),
      buildSolution: (word) => ({
        form: word.plural!,
        article: word.gender ?? undefined,
      }),
      buildMetadata: (word) => ({
        article: word.gender ?? undefined,
      }),
    },
  ],
  adjective: [
    {
      key: 'comparative',
      taskType: 'adj_ending',
      isAvailable: (word) => Boolean(word.comparative),
      buildPrompt: (word, pos) => ({
        lemma: word.lemma,
        pos,
        degree: 'comparative',
        cefrLevel: word.level ?? undefined,
        instructions: `Bilde den Komparativ von "${word.lemma}".`,
        example: normaliseExample(word.exampleDe, word.exampleEn),
        syntacticFrame: 'Der ____ Wagen ist schneller.',
      }),
      buildSolution: (word) => ({ form: word.comparative! }),
    },
    {
      key: 'superlative',
      taskType: 'adj_ending',
      isAvailable: (word) => Boolean(word.superlative),
      buildPrompt: (word, pos) => ({
        lemma: word.lemma,
        pos,
        degree: 'superlative',
        cefrLevel: word.level ?? undefined,
        instructions: `Bilde den Superlativ von "${word.lemma}".`,
        example: normaliseExample(word.exampleDe, word.exampleEn),
        syntacticFrame: 'Das ist der ____ Moment.',
      }),
      buildSolution: (word) => ({ form: word.superlative! }),
    },
  ],
};

export function buildTaskInventory(words: AggregatedWord[]): TaskInventory {
  const tasks: TaskSpecSeed[] = [];

  for (const word of words) {
    const validation = validateWord(word);
    if (LOG_VALIDATION_WARNINGS && validation.errors.length > 0) {
      console.warn(
        `[etl] lexeme ${word.lemma} (${word.pos}) has validation issues: ${validation.errors.join(', ')}`,
      );
    }

    const lexeme = createLexemeSeed(word);
    const lexemeTasks = createTasksForWord(word, lexeme.id);
    tasks.push(...lexemeTasks);
  }

  const ordered = tasks.sort((a, b) => {
    const lexemeCompare = a.lexemeId.localeCompare(b.lexemeId);
    if (lexemeCompare !== 0) return lexemeCompare;
    return a.id.localeCompare(b.id);
  });

  return { tasks: ordered };
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
      .values(inventory.lexemes)
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

  const inflectionsByLexeme = new Map<string, Set<string>>();
  for (const inflection of inventory.inflections) {
    let ids = inflectionsByLexeme.get(inflection.lexemeId);
    if (!ids) {
      ids = new Set<string>();
      inflectionsByLexeme.set(inflection.lexemeId, ids);
    }
    ids.add(inflection.id);
  }

  if (inflectionsByLexeme.size > 0) {
    const lexemeIds = Array.from(inflectionsByLexeme.keys());
    const existing = await db
      .select({
        id: inflectionsTable.id,
        lexemeId: inflectionsTable.lexemeId,
      })
      .from(inflectionsTable)
      .where(inArray(inflectionsTable.lexemeId, lexemeIds));

    const staleIds = existing
      .filter(({ id, lexemeId }) => {
        const incoming = inflectionsByLexeme.get(lexemeId);
        return !incoming || !incoming.has(id);
      })
      .map((row) => row.id);

    if (staleIds.length > 0) {
      for (const chunk of chunkArray(staleIds, INFLECTION_DELETE_CHUNK_SIZE)) {
        await db.delete(inflectionsTable).where(inArray(inflectionsTable.id, chunk));
      }
    }
  }

  if (inventory.inflections.length > 0) {
    await db
      .insert(inflectionsTable)
      .values(inventory.inflections)
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

export async function upsertTaskInventory(
  db: DrizzleDatabase,
  inventory: TaskInventory,
): Promise<void> {
  if (inventory.tasks.length === 0) return;

  const lexemeIds = Array.from(new Set(inventory.tasks.map((task) => task.lexemeId)));
  if (lexemeIds.length > 0) {
    for (const chunk of chunkArray(lexemeIds, TASK_DELETE_CHUNK_SIZE)) {
      await db.delete(taskSpecsTable).where(inArray(taskSpecsTable.lexemeId, chunk));
    }
  }

  await db
    .insert(taskSpecsTable)
    .values(inventory.tasks)
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

function createTasksForWord(word: AggregatedWord, lexemeId: string): TaskSpecSeed[] {
  const pos = mapPos(word.pos);
  const templates = TASK_TEMPLATE_REGISTRY[pos] ?? [];
  const tasks: TaskSpecSeed[] = [];

  let revision = 0;
  for (const template of templates) {
    if (!template.isAvailable(word)) {
      continue;
    }

    const prompt = pruneUndefined(template.buildPrompt(word, pos));
    const solution = template.buildSolution(word);
    const renderer = taskTypeRegistry[template.taskType].renderer;

    validateTaskAgainstRegistry(template.taskType, pos, renderer, prompt, solution);

    revision += 1;
    const taskId = createTaskId(lexemeId, template.taskType, revision, template.key);
    const hints = template.buildHints ? template.buildHints(word) : buildHints(word);
    const hintList = Array.isArray(hints) ? hints : buildHints(word);
    const metadata = template.buildMetadata ? template.buildMetadata(word) : undefined;
    const metadataPayload = metadata && Object.keys(metadata).length ? pruneUndefined(metadata) : null;

    tasks.push({
      id: taskId,
      lexemeId,
      pos,
      taskType: template.taskType,
      renderer,
      prompt,
      solution: pruneUndefined(solution),
      hints: hintList.length ? hintList : null,
      metadata: metadataPayload,
      revision,
    });
  }

  return tasks;
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
      throw new Error(`Unsupported part of speech in task inventory: ${pos}`);
  }
}
