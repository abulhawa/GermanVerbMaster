import type { PracticeResult } from '@shared';

const UMLAUT_FALLBACK_MAPPINGS = [
  ['ä', 'ae'],
  ['ö', 'oe'],
  ['ü', 'ue'],
  ['ß', 'ss'],
] as const;

export function normaliseAnswer(value: string): string {
  return value.trim().toLowerCase();
}

export function expandWithUmlautFallbacks(value: string): string[] {
  const normalized = normaliseAnswer(value);
  if (!normalized) {
    return [];
  }

  const variants = new Set<string>([normalized]);
  const queue: string[] = [normalized];

  while (queue.length > 0) {
    const current = queue.pop();
    if (!current) {
      continue;
    }

    for (const [source, fallback] of UMLAUT_FALLBACK_MAPPINGS) {
      if (!current.includes(source)) {
        continue;
      }

      const replaced = current.replaceAll(source, fallback);
      if (!variants.has(replaced)) {
        variants.add(replaced);
        queue.push(replaced);
      }
    }
  }

  return Array.from(variants);
}

export function addExpectedForm(forms: Set<string>, value: unknown): void {
  if (typeof value !== 'string') {
    return;
  }

  for (const variant of expandWithUmlautFallbacks(value)) {
    forms.add(variant);
  }
}

export interface SubmissionContext {
  expectedForms: string[];
  result: PracticeResult;
  submitted: string;
  answeredAt: string;
  timeSpentMs: number;
}

export function createSubmissionContext(expectedForms: string[], submitted: string): SubmissionContext {
  const normalizedSubmitted = normaliseAnswer(submitted);
  const correct = expectedForms.length === 0 ? false : expectedForms.includes(normalizedSubmitted);
  return {
    expectedForms,
    result: correct ? 'correct' : 'incorrect',
    submitted,
    answeredAt: new Date().toISOString(),
    timeSpentMs: 0,
  } satisfies SubmissionContext;
}

export function computeAnsweredAtAndTime(context: SubmissionContext, startedAt: number): SubmissionContext {
  return {
    ...context,
    timeSpentMs: Date.now() - startedAt,
  };
}
