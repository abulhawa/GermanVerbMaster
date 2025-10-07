import { z } from 'zod';
import {
  taskTypeRegistry as sharedTaskRegistry,
  validateTaskAgainstRegistry,
  type LexemePos,
  type TaskRegistry,
  type TaskRegistryEntry,
  type TaskType,
} from '@shared/task-registry';
import { getDeviceId } from '@/lib/device';
import type { GermanVerb } from '@shared';

const DEFAULT_TASK_LIMIT = 25;

export type TaskPrompt<T extends TaskType = TaskType> = z.infer<(typeof sharedTaskRegistry)[T]['promptSchema']>;
export type TaskSolution<T extends TaskType = TaskType> = z.infer<(typeof sharedTaskRegistry)[T]['solutionSchema']>;

export interface PracticeTask<T extends TaskType = TaskType> {
  taskId: string;
  lexemeId: string;
  taskType: T;
  pos: LexemePos;
  renderer: (typeof sharedTaskRegistry)[T]['renderer'];
  prompt: TaskPrompt<T>;
  expectedSolution?: TaskSolution<T>;
  queueCap: number;
  lexeme: {
    id: string;
    lemma: string;
    metadata: Record<string, unknown> | null;
  };
  pack: {
    id: string;
    slug: string;
    name: string;
  } | null;
  assignedAt: string;
  source: 'scheduler' | 'seed' | 'review';
}

export interface TaskFetchOptions {
  pos?: LexemePos;
  taskType?: TaskType;
  packSlug?: string;
  limit?: number;
  signal?: AbortSignal;
  deviceId?: string;
  /**
   * Controls whether the legacy `/api/quiz/verbs` endpoint should be used when the new task feed fails.
   * Defaults to `true` for backwards compatibility while POS work is in flight.
   */
  enableLegacyFallback?: boolean;
}

const rawTaskSchema = z.object({
  id: z.string().min(1),
  taskType: z.string().min(1),
  renderer: z.string().min(1),
  pos: z.string().min(1),
  prompt: z.unknown(),
  solution: z.unknown().optional(),
  queueCap: z.number().int().positive(),
  lexeme: z.object({
    id: z.string().min(1),
    lemma: z.string().min(1),
    metadata: z.record(z.string(), z.unknown()).nullable().optional(),
  }),
  pack: z
    .object({
      id: z.string().min(1),
      slug: z.string().min(1),
      name: z.string().min(1),
    })
    .nullable()
    .optional(),
});

const tasksResponseSchema = z.object({
  tasks: z.array(rawTaskSchema),
});

type RawTaskPayload = z.infer<typeof rawTaskSchema>;

const legacyVerbSchema = z.object({
  infinitive: z.string(),
  english: z.string(),
  präteritum: z.string(),
  partizipII: z.string(),
  auxiliary: z.enum(['haben', 'sein']),
  level: z.enum(['A1', 'A2', 'B1', 'B2', 'C1', 'C2']),
  präteritumExample: z.string(),
  partizipIIExample: z.string(),
  source: z.object({
    name: z.string(),
    levelReference: z.string(),
  }),
  pattern: z
    .object({
      type: z.string(),
      group: z.string().optional(),
    })
    .nullish(),
  praesensIch: z.string().nullish(),
  praesensEr: z.string().nullish(),
  perfekt: z.string().nullish(),
  separable: z.boolean().nullish(),
});

const legacyVerbArraySchema = z.array(legacyVerbSchema);

function normaliseVerbPayload(payload: z.infer<typeof legacyVerbSchema>): GermanVerb {
  return {
    ...payload,
    pattern: payload.pattern ?? null,
    praesensIch: payload.praesensIch ?? null,
    praesensEr: payload.praesensEr ?? null,
    perfekt: payload.perfekt ?? null,
    separable: payload.separable ?? null,
  };
}

export interface LegacyEndpointNotice {
  reason: string;
  warningHeader: string | null;
  deprecationHeader: string | null;
  linkHeader: string | null;
  timestamp: string;
}

let lastLegacyEndpointNotice: LegacyEndpointNotice | null = null;
let legacyWarningEmitted = false;

function recordLegacyEndpointUsage(headers: Headers, reason: string): void {
  const notice: LegacyEndpointNotice = {
    reason,
    warningHeader: headers.get('Warning'),
    deprecationHeader: headers.get('Deprecation'),
    linkHeader: headers.get('Link'),
    timestamp: new Date().toISOString(),
  };

  lastLegacyEndpointNotice = notice;

  const logMethod = legacyWarningEmitted ? console.debug : console.warn;
  logMethod('[tasks] Falling back to legacy /api/quiz/verbs endpoint', notice);
  legacyWarningEmitted = true;

  if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') {
    try {
      const eventName = 'gvm:legacy-endpoint-used';
      const CustomEventCtor = typeof window.CustomEvent === 'function' ? window.CustomEvent : null;
      const event = CustomEventCtor
        ? new CustomEventCtor(eventName, { detail: notice })
        : (undefined as unknown as Event);
      if (event) {
        window.dispatchEvent(event);
      }
    } catch (error) {
      console.debug('Unable to dispatch legacy endpoint event', error);
    }
  }
}

export function getLastLegacyEndpointNotice(): LegacyEndpointNotice | null {
  return lastLegacyEndpointNotice;
}

export function __resetLegacyEndpointTelemetryForTests(): void {
  lastLegacyEndpointNotice = null;
  legacyWarningEmitted = false;
}

function mapTaskPayload(task: RawTaskPayload): PracticeTask {
  const validation = validateTaskAgainstRegistry(task.taskType, task.pos, task.renderer, task.prompt, task.solution);
  const registryEntry = sharedTaskRegistry[validation.taskType];
  const prompt = registryEntry.promptSchema.parse(task.prompt);
  const solution =
    typeof task.solution === 'undefined' || task.solution === null
      ? undefined
      : registryEntry.solutionSchema.parse(task.solution);

  return {
    taskId: task.id,
    lexemeId: task.lexeme.id,
    taskType: validation.taskType,
    pos: validation.pos,
    renderer: validation.renderer,
    prompt,
    expectedSolution: solution,
    queueCap: task.queueCap,
    lexeme: {
      id: task.lexeme.id,
      lemma: task.lexeme.lemma,
      metadata: task.lexeme.metadata ?? null,
    },
    pack: task.pack ?? null,
    assignedAt: new Date().toISOString(),
    source: 'scheduler',
  };
}

function shouldUseLegacyFallback(options: TaskFetchOptions): boolean {
  if (options.enableLegacyFallback === false) {
    return false;
  }
  if (options.packSlug) {
    return false;
  }
  if (options.taskType && options.taskType !== 'conjugate_form') {
    return false;
  }
  if (options.pos && options.pos !== 'verb') {
    return false;
  }
  return true;
}

export function createLegacyConjugationTask(verb: GermanVerb): PracticeTask<'conjugate_form'> {
  const registryEntry = sharedTaskRegistry.conjugate_form;
  const primaryForm = verb.partizipII.trim() || verb.präteritum.trim() || verb.infinitive.trim();
  const alternateForms = [verb.präteritum.trim(), verb.perfekt?.trim() ?? '']
    .map((value) => value.trim())
    .filter((value) => value && value !== primaryForm);

  const prompt = registryEntry.promptSchema.parse({
    lemma: verb.infinitive,
    pos: 'verb',
    requestedForm: {
      tense: 'participle',
    },
    instructions: `Gib das Partizip II von „${verb.infinitive}“ an.`,
    cefrLevel: verb.level,
    example: {
      de: verb.partizipIIExample || undefined,
      en: verb.english || undefined,
    },
  });

  const solution = registryEntry.solutionSchema.parse({
    form: primaryForm,
    alternateForms: alternateForms.length ? alternateForms : undefined,
  });

  const metadata: Record<string, unknown> = {
    english: verb.english,
    level: verb.level,
    auxiliary: verb.auxiliary,
    präteritum: verb.präteritum,
    partizipII: verb.partizipII,
    perfekt: verb.perfekt,
  };

  for (const key of Object.keys(metadata)) {
    const value = metadata[key];
    if (value === null || value === undefined || value === '') {
      delete metadata[key];
    }
  }

  const legacyId = `legacy:verb:${verb.infinitive}`;

  return {
    taskId: legacyId,
    lexemeId: legacyId,
    taskType: 'conjugate_form',
    pos: 'verb',
    renderer: registryEntry.renderer,
    prompt,
    expectedSolution: solution,
    queueCap: registryEntry.defaultQueueCap,
    lexeme: {
      id: legacyId,
      lemma: verb.infinitive,
      metadata: Object.keys(metadata).length ? metadata : null,
    },
    pack: null,
    assignedAt: new Date().toISOString(),
    source: 'seed',
  };
}

async function fetchLegacyVerbTasks(limit: number, reason: string, signal?: AbortSignal): Promise<PracticeTask<'conjugate_form'>[]> {
  const params = new URLSearchParams();
  params.set('limit', String(limit));
  const response = await fetch(createApiUrl('/api/quiz/verbs', params), { signal });
  if (!response.ok) {
    throw new Error(`Legacy verb feed failed with status ${response.status}`);
  }

  const payload = await response.json();
  const verbs = legacyVerbArraySchema.parse(payload).map(normaliseVerbPayload);

  recordLegacyEndpointUsage(response.headers, reason);

  return verbs.map(createLegacyConjugationTask);
}

function buildTasksQuery(options: TaskFetchOptions): string {
  const params = new URLSearchParams();
  if (options.pos) {
    params.set('pos', options.pos);
  }
  if (options.taskType) {
    params.set('taskType', options.taskType);
  }
  if (options.packSlug) {
    params.set('pack', options.packSlug);
  }
  const limit = options.limit ?? DEFAULT_TASK_LIMIT;
  params.set('limit', String(limit));
  const deviceId = options.deviceId?.trim() || getDeviceId();
  params.set('deviceId', deviceId);
  return params.toString();
}

class TaskFeedError extends Error {
  constructor(message: string, readonly cause?: unknown) {
    super(message);
    this.name = 'TaskFeedError';
  }
}

async function fetchFromTaskFeed(options: TaskFetchOptions): Promise<PracticeTask[]> {
  const query = buildTasksQuery(options);
  const response = await fetch(createApiUrl('/api/tasks', query ? new URLSearchParams(query) : undefined), {
    signal: options.signal,
  });

  if (!response.ok) {
    throw new TaskFeedError(`Task feed responded with status ${response.status}`);
  }

  const payload = await response.json().catch((error) => {
    throw new TaskFeedError('Unable to parse task feed payload', error);
  });

  const parsed = tasksResponseSchema.safeParse(payload);
  if (!parsed.success) {
    throw new TaskFeedError('Invalid task feed payload', parsed.error);
  }

  return parsed.data.tasks.map(mapTaskPayload);
}

export async function fetchPracticeTasks(options: TaskFetchOptions = {}): Promise<PracticeTask[]> {
  const resolvedOptions = options.deviceId ? options : { ...options, deviceId: getDeviceId() };
  try {
    return await fetchFromTaskFeed(resolvedOptions);
  } catch (error) {
    if (!shouldUseLegacyFallback(resolvedOptions)) {
      throw error instanceof Error ? error : new Error('Failed to fetch tasks');
    }

    const limit = resolvedOptions.limit ?? DEFAULT_TASK_LIMIT;
    const reason = error instanceof Error ? error.message : 'Unknown task feed failure';

    try {
      return await fetchLegacyVerbTasks(limit, reason, resolvedOptions.signal);
    } catch (fallbackError) {
      const aggregate = new AggregateError([error as Error, fallbackError as Error], 'Unable to fetch practice tasks');
      throw aggregate;
    }
  }
}

export type ClientTaskRegistry = Readonly<TaskRegistry>;

export const clientTaskRegistry = Object.freeze({
  ...sharedTaskRegistry,
}) as ClientTaskRegistry;

export function getClientTaskRegistryEntry(taskType: TaskType): TaskRegistryEntry {
  const entry = clientTaskRegistry[taskType];
  if (!entry) {
    throw new Error(`Unknown task type: ${taskType}`);
  }
  return entry;
}

export function listClientTaskTypes(): TaskType[] {
  return Object.keys(clientTaskRegistry) as TaskType[];
}

function createApiUrl(path: string, params?: URLSearchParams): string {
  const base = typeof window !== 'undefined' && window.location
    ? window.location.origin
    : typeof globalThis !== 'undefined' && 'location' in globalThis && (globalThis.location as Location | undefined)
      ? (globalThis.location as Location).origin
      : 'http://localhost';
  const url = new URL(path, base);
  if (params) {
    for (const [key, value] of params.entries()) {
      url.searchParams.set(key, value);
    }
  }
  return url.toString();
}

