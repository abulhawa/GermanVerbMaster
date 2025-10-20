import { createHash } from 'node:crypto';

import {
  taskTypeRegistry,
  validateTaskAgainstRegistry,
  type LexemePos,
  type TaskRegistryEntry,
  type TaskType,
} from '@shared/task-registry';

export interface TaskTemplateSource {
  lexemeId: string;
  lemma: string;
  pos: LexemePos;
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
}

export interface GeneratedTaskSpec {
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

interface TaskTemplateDefinition {
  key: string;
  taskType: TaskType;
  isAvailable(source: TaskTemplateSource): boolean;
  buildPrompt(source: TaskTemplateSource): Record<string, unknown>;
  buildSolution(source: TaskTemplateSource): Record<string, unknown> & { form: string };
  buildMetadata?(source: TaskTemplateSource): Record<string, unknown> | null | undefined;
  buildHints?(source: TaskTemplateSource): unknown[];
}

const TASK_TEMPLATE_REGISTRY: Partial<Record<LexemePos, readonly TaskTemplateDefinition[]>> = {
  verb: [
    {
      key: 'praesens_ich',
      taskType: 'conjugate_form',
      isAvailable: (source) => Boolean(source.praesensIch),
      buildPrompt: (source) => ({
        lemma: source.lemma,
        pos: source.pos,
        requestedForm: {
          tense: 'present',
          mood: 'indicative',
          person: 1,
          number: 'singular',
        },
        cefrLevel: source.level ?? undefined,
        instructions: `Konjugiere "${source.lemma}" in der Präsensform (ich).`,
        example: normaliseExample(source.exampleDe, source.exampleEn),
      }),
      buildSolution: (source) => ({ form: source.praesensIch! }),
      buildMetadata: (source) => ({
        aux: source.aux ?? undefined,
        separable: source.separable ?? undefined,
      }),
    },
    {
      key: 'praesens_er',
      taskType: 'conjugate_form',
      isAvailable: (source) => Boolean(source.praesensEr),
      buildPrompt: (source) => ({
        lemma: source.lemma,
        pos: source.pos,
        requestedForm: {
          tense: 'present',
          mood: 'indicative',
          person: 3,
          number: 'singular',
        },
        cefrLevel: source.level ?? undefined,
        instructions: `Konjugiere "${source.lemma}" in der Präsensform (er/sie/es).`,
        example: normaliseExample(source.exampleDe, source.exampleEn),
      }),
      buildSolution: (source) => ({ form: source.praesensEr! }),
      buildMetadata: (source) => ({
        aux: source.aux ?? undefined,
        separable: source.separable ?? undefined,
      }),
    },
    {
      key: 'praeteritum',
      taskType: 'conjugate_form',
      isAvailable: (source) => Boolean(source.praeteritum),
      buildPrompt: (source) => ({
        lemma: source.lemma,
        pos: source.pos,
        requestedForm: {
          tense: 'past',
          mood: 'indicative',
          person: 3,
          number: 'singular',
        },
        cefrLevel: source.level ?? undefined,
        instructions: `Konjugiere "${source.lemma}" in der Präteritumform (er/sie/es).`,
        example: normaliseExample(source.exampleDe, source.exampleEn),
      }),
      buildSolution: (source) => ({ form: source.praeteritum! }),
      buildMetadata: (source) => ({
        aux: source.aux ?? undefined,
        separable: source.separable ?? undefined,
      }),
    },
    {
      key: 'partizip_ii',
      taskType: 'conjugate_form',
      isAvailable: (source) => Boolean(source.partizipIi),
      buildPrompt: (source) => ({
        lemma: source.lemma,
        pos: source.pos,
        requestedForm: {
          tense: 'participle',
          mood: 'indicative',
          voice: 'active',
        },
        cefrLevel: source.level ?? undefined,
        instructions: `Gib das Partizip II von "${source.lemma}" an.`,
        example: normaliseExample(source.exampleDe, source.exampleEn),
      }),
      buildSolution: (source) => ({ form: source.partizipIi! }),
      buildMetadata: (source) => ({
        aux: source.aux ?? undefined,
        separable: source.separable ?? undefined,
      }),
    },
  ],
  noun: [
    {
      key: 'accusative_plural',
      taskType: 'noun_case_declension',
      isAvailable: (source) => Boolean(source.plural),
      buildPrompt: (source) => ({
        lemma: source.lemma,
        pos: source.pos,
        gender: source.gender ?? undefined,
        requestedCase: 'accusative',
        requestedNumber: 'plural',
        cefrLevel: source.level ?? undefined,
        instructions: `Bilde die Akkusativ Plural-Form von "${source.lemma}".`,
        example: normaliseExample(source.exampleDe, source.exampleEn),
      }),
      buildSolution: (source) => ({
        form: source.plural!,
        article: source.gender ?? undefined,
      }),
      buildMetadata: (source) => ({
        article: source.gender ?? undefined,
      }),
    },
  ],
  adjective: [
    {
      key: 'comparative',
      taskType: 'adj_ending',
      isAvailable: (source) => Boolean(source.comparative),
      buildPrompt: (source) => ({
        lemma: source.lemma,
        pos: source.pos,
        degree: 'comparative',
        cefrLevel: source.level ?? undefined,
        instructions: `Bilde den Komparativ von "${source.lemma}".`,
        example: normaliseExample(source.exampleDe, source.exampleEn),
        syntacticFrame: 'Der ____ Wagen ist schneller.',
      }),
      buildSolution: (source) => ({ form: source.comparative! }),
    },
    {
      key: 'superlative',
      taskType: 'adj_ending',
      isAvailable: (source) => Boolean(source.superlative),
      buildPrompt: (source) => ({
        lemma: source.lemma,
        pos: source.pos,
        degree: 'superlative',
        cefrLevel: source.level ?? undefined,
        instructions: `Bilde den Superlativ von "${source.lemma}".`,
        example: normaliseExample(source.exampleDe, source.exampleEn),
        syntacticFrame: 'Das ist der ____ Moment.',
      }),
      buildSolution: (source) => ({ form: source.superlative! }),
    },
  ],
};

function sha1(value: string): string {
  return createHash('sha1').update(value).digest('hex');
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

function normaliseExample(exampleDe: string | null, exampleEn: string | null):
  | {
      de?: string;
      en?: string;
    }
  | undefined {
  const payload: { de?: string; en?: string } = {};
  if (exampleDe) {
    payload.de = exampleDe;
  }
  if (exampleEn) {
    payload.en = exampleEn;
  }
  return Object.keys(payload).length ? payload : undefined;
}

function pruneUndefined<T extends Record<string, unknown>>(value: T): T {
  const entries = Object.entries(value).filter(([, v]) => v !== undefined && v !== null);
  return Object.fromEntries(entries) as T;
}

function buildHints(source: TaskTemplateSource): unknown[] {
  const hints: unknown[] = [];
  if (source.exampleDe) {
    hints.push({ type: 'example_de', value: source.exampleDe });
  }
  if (source.exampleEn) {
    hints.push({ type: 'example_en', value: source.exampleEn });
  }
  if (source.perfekt && source.aux) {
    hints.push({ type: 'auxiliary', value: source.aux });
  }
  return hints;
}

export function generateTaskSpecs(source: TaskTemplateSource): GeneratedTaskSpec[] {
  const templates = TASK_TEMPLATE_REGISTRY[source.pos] ?? [];
  if (templates.length === 0) {
    return [];
  }

  const tasks: GeneratedTaskSpec[] = [];
  let revision = 0;

  for (const template of templates) {
    if (!template.isAvailable(source)) {
      continue;
    }

    const prompt = pruneUndefined(template.buildPrompt(source));
    const solution = pruneUndefined(template.buildSolution(source));

    const registryEntry: TaskRegistryEntry | undefined = taskTypeRegistry[template.taskType];
    if (!registryEntry) {
      continue;
    }

    validateTaskAgainstRegistry(template.taskType, source.pos, registryEntry.renderer, prompt, solution);

    revision += 1;

    const taskId = createTaskId(source.lexemeId, template.taskType, revision, template.key);
    const hints = template.buildHints ? template.buildHints(source) : buildHints(source);
    const hintList = Array.isArray(hints) ? hints : buildHints(source);
    const metadata = template.buildMetadata ? template.buildMetadata(source) : undefined;
    const metadataPayload = metadata && Object.keys(metadata).length ? pruneUndefined(metadata) : null;

    tasks.push({
      id: taskId,
      lexemeId: source.lexemeId,
      pos: source.pos,
      taskType: template.taskType,
      renderer: registryEntry.renderer,
      prompt,
      solution,
      hints: hintList.length ? hintList : null,
      metadata: metadataPayload,
      revision,
    });
  }

  return tasks;
}
