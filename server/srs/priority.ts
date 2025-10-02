const MAX_BOX_FALLBACK = 5;

export const MAX_LEITNER_BOX = MAX_BOX_FALLBACK;
export const BOX_INTERVALS_MS: readonly number[] = [
  0,
  12 * 60 * 60 * 1000,
  24 * 60 * 60 * 1000,
  72 * 60 * 60 * 1000,
  7 * 24 * 60 * 60 * 1000,
];

export const TARGET_RESPONSE_MS = 8_000;
export const MIN_LATENCY_WEIGHT = 0.2;
export const PRIORITY_DUE_SOFT_CAP_MS = 6 * 60 * 60 * 1000;

export function clamp(value: number, min: number, max: number): number {
  if (Number.isNaN(value)) return min;
  if (value < min) return min;
  if (value > max) return max;
  return value;
}

export function computeAccuracyWeight(totalAttempts: number, correctAttempts: number): number {
  if (totalAttempts <= 0) {
    return 0.5;
  }
  const ratio = correctAttempts / totalAttempts;
  return Number(clamp(ratio, 0, 1).toFixed(4));
}

export function computeLatencyWeight(averageResponseMs: number): number {
  if (averageResponseMs <= 0) {
    return 1;
  }
  const weight = TARGET_RESPONSE_MS / averageResponseMs;
  return Number(clamp(weight, MIN_LATENCY_WEIGHT, 1).toFixed(4));
}

export function computeStabilityWeight(leitnerBox: number, totalAttempts: number): number {
  const normalizedBox = clamp((leitnerBox - 1) / Math.max(1, MAX_LEITNER_BOX - 1), 0, 1);
  const attemptFactor = clamp(totalAttempts / 10, 0, 1);
  const stability = 0.6 * normalizedBox + 0.4 * attemptFactor;
  return Number(clamp(stability, 0, 1).toFixed(4));
}

export function computeNextDueDate(leitnerBox: number, baseTime = Date.now()): Date {
  const index = clamp(Math.round(leitnerBox), 1, MAX_LEITNER_BOX) - 1;
  const offset = BOX_INTERVALS_MS[index] ?? BOX_INTERVALS_MS[BOX_INTERVALS_MS.length - 1];
  return new Date(baseTime + offset);
}

export function computePredictedIntervalMinutes(leitnerBox: number): number {
  const index = clamp(Math.round(leitnerBox), 1, MAX_LEITNER_BOX) - 1;
  const interval = BOX_INTERVALS_MS[index] ?? BOX_INTERVALS_MS[BOX_INTERVALS_MS.length - 1];
  return Math.max(1, Math.round(interval / 60000));
}

export function computePriorityScore(params: {
  accuracyWeight: number;
  latencyWeight: number;
  stabilityWeight: number;
  leitnerBox: number;
  dueAt: Date | null;
  now?: number;
}): number {
  const now = params.now ?? Date.now();
  const dueTimestamp = params.dueAt?.getTime() ?? now;
  const dueUrgency = dueTimestamp <= now
    ? 1
    : 1 - clamp((dueTimestamp - now) / PRIORITY_DUE_SOFT_CAP_MS, 0, 1);

  const accuracyPenalty = 1 - clamp(params.accuracyWeight, 0, 1);
  const latencyPenalty = 1 - clamp(params.latencyWeight, 0, 1);
  const stabilityPenalty = 1 - clamp(params.stabilityWeight, 0, 1);
  const boxPenalty = 1 - clamp((params.leitnerBox - 1) / Math.max(1, MAX_LEITNER_BOX - 1), 0, 1);

  const rawScore =
    accuracyPenalty * 0.45 +
    latencyPenalty * 0.2 +
    dueUrgency * 0.25 +
    (stabilityPenalty * 0.05 + boxPenalty * 0.05);

  return Number(clamp(rawScore, 0, 1.5).toFixed(6));
}
