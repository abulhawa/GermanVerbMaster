import { describe, expect, it } from 'vitest';
import {
  computeAccuracyWeight,
  computeLatencyWeight,
  computeNextDueDate,
  computePredictedIntervalMinutes,
  computePriorityScore,
  computeStabilityWeight,
} from '../server/srs/priority.js';

describe('adaptive priority calculations', () => {
  it('prioritises verbs with lower accuracy', () => {
    const now = Date.now();
    const lowAccuracy = computePriorityScore({
      accuracyWeight: computeAccuracyWeight(10, 3),
      latencyWeight: 0.9,
      stabilityWeight: 0.4,
      leitnerBox: 1,
      dueAt: new Date(now - 1_000),
      now,
    });

    const highAccuracy = computePriorityScore({
      accuracyWeight: computeAccuracyWeight(10, 9),
      latencyWeight: 0.9,
      stabilityWeight: 0.4,
      leitnerBox: 1,
      dueAt: new Date(now - 1_000),
      now,
    });

    expect(lowAccuracy).toBeGreaterThan(highAccuracy);
  });

  it('reduces priority when the review is far in the future', () => {
    const now = Date.now();
    const dueSoon = computePriorityScore({
      accuracyWeight: 0.6,
      latencyWeight: 0.5,
      stabilityWeight: 0.5,
      leitnerBox: 2,
      dueAt: new Date(now + 30_000),
      now,
    });

    const dueFar = computePriorityScore({
      accuracyWeight: 0.6,
      latencyWeight: 0.5,
      stabilityWeight: 0.5,
      leitnerBox: 2,
      dueAt: new Date(now + 6 * 60 * 60 * 1000),
      now,
    });

    expect(dueSoon).toBeGreaterThan(dueFar);
  });

  it('computes consistent stability and intervals', () => {
    const stability = computeStabilityWeight(3, 12);
    expect(stability).toBeGreaterThan(0.4);

    const intervalMinutes = computePredictedIntervalMinutes(3);
    expect(intervalMinutes).toBeGreaterThan(60);

    const dueDate = computeNextDueDate(3, Date.UTC(2024, 0, 1));
    const fallbackScore = computePriorityScore({
      accuracyWeight: 0.5,
      latencyWeight: computeLatencyWeight(9_500),
      stabilityWeight: stability,
      leitnerBox: 3,
      dueAt: dueDate,
      now: Date.UTC(2024, 0, 1),
    });

    expect(fallbackScore).toBeGreaterThan(0);
  });
});
