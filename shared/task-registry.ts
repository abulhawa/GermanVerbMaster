import { z } from 'zod';

export const conjugatePromptSchema = z.object({
  lemma: z.string().min(1),
  pos: z.literal('verb'),
  requestedForm: z.object({
    tense: z.enum(['present', 'past', 'participle']),
    mood: z.enum(['indicative', 'subjunctive']).optional(),
    person: z.number().int().min(1).max(3).optional(),
    number: z.enum(['singular', 'plural']).optional(),
    voice: z.enum(['active', 'passive']).optional(),
  }),
  cefrLevel: z.string().optional(),
  instructions: z.string().min(1),
  example: z
    .object({
      de: z.string().optional(),
      en: z.string().optional(),
    })
    .optional(),
});

export const conjugateSolutionSchema = z.object({
  form: z.string().min(1),
  alternateForms: z.array(z.string().min(1)).optional(),
});

export const nounDeclensionPromptSchema = z.object({
  lemma: z.string().min(1),
  pos: z.literal('noun'),
  gender: z.enum(['der', 'die', 'das', 'der/die', 'der/das', 'die/das']).optional(),
  requestedCase: z.enum(['nominative', 'accusative', 'dative', 'genitive']),
  requestedNumber: z.enum(['singular', 'plural']),
  instructions: z.string().min(1),
  cefrLevel: z.string().optional(),
  example: z
    .object({
      de: z.string().optional(),
      en: z.string().optional(),
    })
    .optional(),
});

export const nounDeclensionSolutionSchema = z.object({
  form: z.string().min(1),
  article: z.string().optional(),
});

export const adjectiveEndingPromptSchema = z.object({
  lemma: z.string().min(1),
  pos: z.literal('adjective'),
  degree: z.enum(['positive', 'comparative', 'superlative']),
  syntacticFrame: z.string().optional(),
  instructions: z.string().min(1),
  cefrLevel: z.string().optional(),
  example: z
    .object({
      de: z.string().optional(),
      en: z.string().optional(),
    })
    .optional(),
});

export const adjectiveEndingSolutionSchema = z.object({
  form: z.string().min(1),
});

export type LexemePos = 'verb' | 'noun' | 'adjective';

interface TaskRegistryEntryBase {
  readonly taskType: string;
  readonly supportedPos: ReadonlyArray<LexemePos>;
  readonly renderer: string;
  readonly promptSchema: z.ZodTypeAny;
  readonly solutionSchema: z.ZodTypeAny;
  readonly defaultQueueCap: number;
}

export const taskTypeRegistry = {
  conjugate_form: {
    taskType: 'conjugate_form',
    supportedPos: ['verb'],
    renderer: 'conjugate_form',
    promptSchema: conjugatePromptSchema,
    solutionSchema: conjugateSolutionSchema,
    defaultQueueCap: 30,
  },
  noun_case_declension: {
    taskType: 'noun_case_declension',
    supportedPos: ['noun'],
    renderer: 'noun_case_declension',
    promptSchema: nounDeclensionPromptSchema,
    solutionSchema: nounDeclensionSolutionSchema,
    defaultQueueCap: 25,
  },
  adj_ending: {
    taskType: 'adj_ending',
    supportedPos: ['adjective'],
    renderer: 'adj_ending',
    promptSchema: adjectiveEndingPromptSchema,
    solutionSchema: adjectiveEndingSolutionSchema,
    defaultQueueCap: 20,
  },
} as const satisfies Record<string, TaskRegistryEntryBase>;

export type TaskRegistry = typeof taskTypeRegistry;

export type TaskType = keyof TaskRegistry;

export type TaskRegistryEntry = TaskRegistry[TaskType];

export interface RegistryValidationResult {
  taskType: TaskType;
  pos: LexemePos;
  renderer: TaskRegistryEntry['renderer'];
}

export function validateTaskAgainstRegistry(
  taskType: string,
  pos: string,
  renderer: string,
  prompt: unknown,
  solution: unknown,
): RegistryValidationResult {
  const entry = taskTypeRegistry[taskType as TaskType];
  if (!entry) {
    throw new Error(`Unsupported task type: ${taskType}`);
  }

  const supportedPos = entry.supportedPos as ReadonlyArray<LexemePos>;
  if (!supportedPos.includes(pos as LexemePos)) {
    throw new Error(
      `Task type ${taskType} does not support part of speech ${pos}. Supported: ${entry.supportedPos.join(', ')}`,
    );
  }

  if (entry.renderer !== renderer) {
    throw new Error(
      `Renderer mismatch for ${taskType}: expected ${entry.renderer} but received ${renderer}`,
    );
  }

  entry.promptSchema.parse(prompt);
  entry.solutionSchema.parse(solution);

  return {
    taskType: entry.taskType,
    pos: pos as LexemePos,
    renderer,
  };
}
