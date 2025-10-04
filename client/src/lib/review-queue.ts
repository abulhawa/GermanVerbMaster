import { resolveLocalStorage } from '@/lib/storage';
import type { PracticeTask } from '@/lib/tasks';
import type { CEFRLevel, PracticeTaskQueueItem } from '@shared';

const QUEUE_STORAGE_KEY = 'practice.tasks.queue';
const LEGACY_QUEUE_KEY = 'focus-review-queue';
const MIGRATION_MARKER_KEY = 'practice.tasks.queue.migrated';
const STORAGE_CONTEXT = 'review queue';

interface EnqueueOptions {
  randomize?: boolean;
  replace?: boolean;
}

interface LegacyQueueItem {
  value: string;
  enqueuedAt: string;
}

function isBrowser(): boolean {
  return typeof window !== 'undefined';
}

const getStorage = () => resolveLocalStorage({ context: STORAGE_CONTEXT });

function sanitizeLegacyVerbs(values: unknown): LegacyQueueItem[] {
  if (!Array.isArray(values)) {
    return [];
  }

  const now = new Date().toISOString();
  const unique = new Map<string, string>();

  for (const value of values) {
    if (typeof value !== 'string') {
      continue;
    }
    const trimmed = value.trim();
    if (!trimmed) {
      continue;
    }
    const key = trimmed.toLowerCase();
    if (!unique.has(key)) {
      unique.set(key, trimmed);
    }
  }

  return Array.from(unique.values()).map((value) => ({ value, enqueuedAt: now }));
}

function createLegacyQueueEntry(item: LegacyQueueItem): PracticeTaskQueueItem {
  const taskId = `legacy:verb:${item.value}`;
  return {
    taskId,
    lexemeId: taskId,
    taskType: 'conjugate_form',
    pos: 'verb',
    renderer: 'conjugate_form',
    source: 'review',
    enqueuedAt: item.enqueuedAt,
    metadata: {
      lemma: item.value,
      legacyVerbInfinitive: item.value,
      packId: null,
      packSlug: null,
      packName: null,
    },
    pack: null,
  };
}

function migrateLegacyQueue(storage: Storage): PracticeTaskQueueItem[] {
  const marker = storage.getItem(MIGRATION_MARKER_KEY);
  if (marker === '1') {
    return [];
  }

  const legacyRaw = storage.getItem(LEGACY_QUEUE_KEY);
  if (!legacyRaw) {
    storage.setItem(MIGRATION_MARKER_KEY, '1');
    return [];
  }

  try {
    const parsed = JSON.parse(legacyRaw);
    const migrated = sanitizeLegacyVerbs(parsed).map(createLegacyQueueEntry);
    if (migrated.length) {
      storage.setItem(QUEUE_STORAGE_KEY, JSON.stringify(migrated));
    } else {
      storage.removeItem(QUEUE_STORAGE_KEY);
    }
    storage.setItem(MIGRATION_MARKER_KEY, '1');
    storage.removeItem(LEGACY_QUEUE_KEY);
    return migrated;
  } catch (error) {
    console.warn('Failed to migrate legacy review queue, clearing storage', error);
    storage.removeItem(QUEUE_STORAGE_KEY);
    storage.removeItem(LEGACY_QUEUE_KEY);
    storage.setItem(MIGRATION_MARKER_KEY, '1');
    return [];
  }
}

function readQueue(storage: Storage): PracticeTaskQueueItem[] {
  const raw = storage.getItem(QUEUE_STORAGE_KEY);
  if (!raw) {
    return [];
  }

  try {
    const parsed = JSON.parse(raw) as PracticeTaskQueueItem[];
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed;
  } catch (error) {
    console.warn('Failed to parse review queue, resetting storage', error);
    storage.removeItem(QUEUE_STORAGE_KEY);
    return [];
  }
}

function writeQueue(storage: Storage, queue: PracticeTaskQueueItem[]): void {
  try {
    storage.setItem(QUEUE_STORAGE_KEY, JSON.stringify(queue));
    storage.setItem(MIGRATION_MARKER_KEY, '1');
  } catch (error) {
    console.warn('Failed to persist review queue', error);
  }
}

function ensureQueue(storage: Storage): PracticeTaskQueueItem[] {
  const marker = storage.getItem(MIGRATION_MARKER_KEY);
  if (marker !== '1') {
    const migrated = migrateLegacyQueue(storage);
    if (migrated.length) {
      return migrated;
    }
  }

  return readQueue(storage);
}

function shuffle<T>(items: T[]): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

export function getReviewQueue(): PracticeTaskQueueItem[] {
  const storage = getStorage();
  if (!storage) {
    return [];
  }

  return ensureQueue(storage);
}

export function enqueueReviewTasks(
  tasks: PracticeTaskQueueItem[],
  options: EnqueueOptions = {},
): PracticeTaskQueueItem[] {
  const storage = getStorage();
  if (!storage) {
    return tasks;
  }

  const existing = options.replace ? [] : ensureQueue(storage);
  const existingIds = new Set(existing.map((item) => item.taskId));
  const additions = options.randomize ? shuffle(tasks) : tasks;

  for (const item of additions) {
    if (existingIds.has(item.taskId)) {
      continue;
    }
    existingIds.add(item.taskId);
    existing.push({ ...item, enqueuedAt: item.enqueuedAt ?? new Date().toISOString() });
  }

  writeQueue(storage, existing);
  return existing;
}

export function enqueuePracticeTasks(
  tasks: PracticeTask[],
  options: EnqueueOptions = {},
): PracticeTaskQueueItem[] {
  const queueItems = tasks.map<PracticeTaskQueueItem>((task) => ({
    taskId: task.taskId,
    lexemeId: task.lexemeId,
    taskType: task.taskType,
    pos: task.pos,
    renderer: task.renderer,
    source: task.source,
    enqueuedAt: new Date().toISOString(),
    metadata: {
      lemma: task.lexeme.lemma,
      cefrLevel: task.lexeme.metadata?.level as CEFRLevel | undefined,
      packId: task.pack?.id ?? null,
      packSlug: task.pack?.slug ?? null,
      packName: task.pack?.name ?? null,
    },
    pack: task.pack
      ? {
          id: task.pack.id,
          slug: task.pack.slug,
          name: task.pack.name,
        }
      : null,
  }));

  return enqueueReviewTasks(queueItems, options);
}

export function shiftReviewTask(): PracticeTaskQueueItem | undefined {
  const storage = getStorage();
  if (!storage) {
    return undefined;
  }

  const queue = ensureQueue(storage);
  if (!queue.length) {
    return undefined;
  }

  const [first, ...rest] = queue;
  writeQueue(storage, rest);
  return first;
}

export function peekReviewTask(): PracticeTaskQueueItem | undefined {
  const storage = getStorage();
  if (!storage) {
    return undefined;
  }

  const queue = ensureQueue(storage);
  return queue[0];
}

export function clearReviewQueue(): void {
  const storage = getStorage();
  if (!storage) {
    return;
  }

  storage.removeItem(QUEUE_STORAGE_KEY);
  storage.setItem(MIGRATION_MARKER_KEY, '1');
}

export function enqueueReviewVerbs(verbs: string[], options: EnqueueOptions = {}): PracticeTaskQueueItem[] {
  const uniqueVerbs = Array.from(
    new Map(
      verbs
        .map((verb) => verb.trim())
        .filter((verb) => verb.length > 0)
        .map((verb) => [verb.toLowerCase(), verb] as const),
    ).values(),
  );

  const now = new Date().toISOString();
  const queueItems = uniqueVerbs.map((verb) =>
    createLegacyQueueEntry({
      value: verb,
      enqueuedAt: now,
    }),
  );

  return enqueueReviewTasks(queueItems, options);
}

export function peekReviewVerb(): string | undefined {
  const next = peekReviewTask();
  if (!next) {
    return undefined;
  }
  return next.metadata?.legacyVerbInfinitive ?? next.metadata?.lemma;
}

export function shiftReviewVerb(): string | undefined {
  const shifted = shiftReviewTask();
  if (!shifted) {
    return undefined;
  }
  return shifted.metadata?.legacyVerbInfinitive ?? shifted.metadata?.lemma;
}
