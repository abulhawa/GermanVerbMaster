const REVIEW_QUEUE_KEY = "focus-review-queue";

type EnqueueOptions = {
  randomize?: boolean;
  replace?: boolean;
};

function getStorage(): Storage | null {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    return window.localStorage;
  } catch (error) {
    console.warn("Local storage unavailable for review queue:", error);
    return null;
  }
}

function readQueue(): string[] {
  const storage = getStorage();
  if (!storage) return [];

  const raw = storage.getItem(REVIEW_QUEUE_KEY);
  if (!raw) return [];

  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];

    return parsed
      .filter((verb): verb is string => typeof verb === "string")
      .map((verb) => verb.trim())
      .filter((verb) => verb.length > 0);
  } catch (error) {
    console.warn("Failed to parse review queue, resetting:", error);
    storage.removeItem(REVIEW_QUEUE_KEY);
    return [];
  }
}

function writeQueue(queue: string[]) {
  const storage = getStorage();
  if (!storage) return;

  storage.setItem(REVIEW_QUEUE_KEY, JSON.stringify(queue));
}

function shuffle<T>(items: T[]): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function uniqueVerbs(verbs: string[]): string[] {
  const seen = new Set<string>();
  const output: string[] = [];
  for (const verb of verbs) {
    const key = verb.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    output.push(verb);
  }
  return output;
}

export function getReviewQueue(): string[] {
  return readQueue();
}

export function enqueueReviewVerbs(verbs: string[], options: EnqueueOptions = {}): string[] {
  const sanitized = uniqueVerbs(
    verbs
      .map((verb) => verb.trim())
      .filter((verb) => verb.length > 0),
  );

  if (!sanitized.length) {
    return readQueue();
  }

  const base = options.replace ? [] : readQueue();
  const existingKeys = new Set(base.map((verb) => verb.toLowerCase()));
  const additions = options.randomize ? shuffle(sanitized) : sanitized;

  for (const verb of additions) {
    const key = verb.toLowerCase();
    if (existingKeys.has(key)) continue;
    existingKeys.add(key);
    base.push(verb);
  }

  writeQueue(base);
  return base;
}

export function peekReviewVerb(): string | undefined {
  const queue = readQueue();
  return queue[0];
}

export function shiftReviewVerb(): string | undefined {
  const queue = readQueue();
  if (!queue.length) return undefined;

  const [first, ...rest] = queue;
  writeQueue(rest);
  return first;
}

export function clearReviewQueue() {
  writeQueue([]);
}
