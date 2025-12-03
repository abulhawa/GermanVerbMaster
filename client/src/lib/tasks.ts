import { z } from 'zod';
import {
  taskTypeRegistry as sharedTaskRegistry,
  validateTaskAgainstRegistry,
  type LexemePos,
  type TaskRegistry,
  type TaskRegistryEntry,
  type TaskType,
} from '@shared/task-registry';
import type { CEFRLevel } from '@shared';
import { getDeviceId } from '@/lib/device';
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
  assignedAt: string;
  source: 'seed' | 'review';
}

export interface TaskFetchOptions {
  pos?: LexemePos;
  taskType?: TaskType;
  taskTypes?: TaskType[];
  limit?: number;
  signal?: AbortSignal;
  deviceId?: string;
  level?: CEFRLevel | CEFRLevel[];
  excludeTaskIds?: string[];
  shuffleSeed?: string;
}

const rawTaskSchema = z.object({
  taskId: z.string().min(1),
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
});

const tasksResponseSchema = z.object({
  tasks: z.array(rawTaskSchema).optional(),
  tasksByType: z
    .record(z.string(), z.array(rawTaskSchema))
    .optional(),
});

type RawTaskPayload = z.infer<typeof rawTaskSchema>;

function mapTaskPayload(task: RawTaskPayload): PracticeTask {
  const validation = validateTaskAgainstRegistry(task.taskType, task.pos, task.renderer, task.prompt, task.solution);
  const registryEntry = sharedTaskRegistry[validation.taskType];
  const prompt = registryEntry.promptSchema.parse(task.prompt);
  const solution =
    typeof task.solution === 'undefined' || task.solution === null
      ? undefined
      : registryEntry.solutionSchema.parse(task.solution);

  return {
    taskId: task.taskId,
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
    assignedAt: new Date().toISOString(),
    source: 'seed',
  };
}

function buildTasksQuery(options: TaskFetchOptions): string {
  const params = new URLSearchParams();
  if (options.pos) {
    params.set('pos', options.pos);
  }
  if (options.taskType) {
    params.set('taskType', options.taskType);
  }
  if (options.taskTypes?.length) {
    for (const type of options.taskTypes) {
      params.append('taskTypes', type);
    }
  }
  const limit = options.limit ?? DEFAULT_TASK_LIMIT;
  params.set('limit', String(limit));
  if (options.level) {
    if (Array.isArray(options.level)) {
      for (const level of options.level) {
        params.append('level', level);
      }
    } else {
      params.set('level', options.level);
    }
  }
  if (options.excludeTaskIds?.length) {
    for (const taskId of options.excludeTaskIds) {
      const normalized = taskId?.trim();
      if (normalized) {
        params.append('excludeTaskIds', normalized);
      }
    }
  }
  if (options.shuffleSeed) {
    params.set('shuffleSeed', options.shuffleSeed);
  }
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

interface TaskFeedResult {
  tasks: PracticeTask[];
  tasksByType: Partial<Record<TaskType, PracticeTask[]>> | null;
}

async function fetchFromTaskFeed(options: TaskFetchOptions): Promise<TaskFeedResult> {
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

  const tasks = (parsed.data.tasks ?? []).map(mapTaskPayload);

  const tasksByType = parsed.data.tasksByType
    ? Object.entries(parsed.data.tasksByType).reduce((acc, [type, entries]) => {
        if (!type || !entries) {
          return acc;
        }
        const mapped = entries
          .map(mapTaskPayload)
          .filter((task) => task.taskType === (type as TaskType));
        if (mapped.length) {
          acc[type as TaskType] = mapped;
        }
        return acc;
      }, {} as Partial<Record<TaskType, PracticeTask[]>>)
    : null;

  return { tasks, tasksByType };
}

export async function fetchPracticeTasks(options: TaskFetchOptions = {}): Promise<PracticeTask[]> {
  const resolvedOptions = options.deviceId ? options : { ...options, deviceId: getDeviceId() };
  const result = await fetchFromTaskFeed(resolvedOptions);
  return result.tasks;
}

export interface MultiTaskFetchOptions extends TaskFetchOptions {
  taskTypes: TaskType[];
}

export async function fetchPracticeTasksByType(
  options: MultiTaskFetchOptions,
): Promise<Record<TaskType, PracticeTask[]>> {
  const resolvedOptions = options.deviceId ? options : { ...options, deviceId: getDeviceId() };
  const result = await fetchFromTaskFeed(resolvedOptions);

  const grouped = {} as Record<TaskType, PracticeTask[]>;
  for (const taskType of options.taskTypes) {
    grouped[taskType] = [];
  }

  if (result.tasksByType) {
    for (const [type, tasks] of Object.entries(result.tasksByType)) {
      if (grouped[type as TaskType]) {
        grouped[type as TaskType] = tasks;
      }
    }
  }

  if (options.taskTypes.some((type) => grouped[type].length === 0) && result.tasks.length) {
    for (const task of result.tasks) {
      if (options.taskTypes.includes(task.taskType) && grouped[task.taskType].every((entry) => entry.taskId !== task.taskId)) {
        grouped[task.taskType].push(task);
      }
    }
  }

  return grouped;
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
    url.search = params.toString();
  }
  return url.toString();
}

