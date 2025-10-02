import { describe, expect, it } from 'vitest';

import {
  calculateSubmissionMetrics,
  computeCoverageScore,
  type SchedulingSnapshot,
} from '../server/tasks/scheduler';

describe('scheduler metrics', () => {
  it('computes coverage score with saturation clamp', () => {
    expect(computeCoverageScore(0, 30)).toBe(1);
    expect(computeCoverageScore(15, 30)).toBeCloseTo(0.5, 3);
    expect(computeCoverageScore(45, 30)).toBe(0);
  });

  it('calculates metrics for a first-time correct submission', () => {
    const now = new Date('2025-01-01T00:00:00.000Z');
    const metrics = calculateSubmissionMetrics(null, {
      result: 'correct',
      responseMs: 1800,
      queueCap: 30,
      coverageAssignments: 1,
      now,
    });

    expect(metrics.totalAttempts).toBe(1);
    expect(metrics.correctAttempts).toBe(1);
    expect(metrics.leitnerBox).toBeGreaterThanOrEqual(1);
    expect(metrics.dueAt.getTime()).toBeGreaterThan(now.getTime());
    expect(metrics.basePriority).toBeGreaterThan(0);
    expect(metrics.blendedPriority).toBeGreaterThan(0);
    expect(metrics.coverageScore).toBeCloseTo(0.9667, 3);
  });

  it('reduces Leitner box and boosts weakness on incorrect answers', () => {
    const snapshot: SchedulingSnapshot = {
      id: 1,
      leitnerBox: 3,
      totalAttempts: 4,
      correctAttempts: 2,
      averageResponseMs: 2100,
      accuracyWeight: 0.5,
      latencyWeight: 0.7,
      stabilityWeight: 0.4,
      dueAt: new Date('2024-12-31T23:00:00.000Z'),
      priorityScore: 0.8,
    };

    const now = new Date('2025-01-01T00:00:00.000Z');
    const metrics = calculateSubmissionMetrics(snapshot, {
      result: 'incorrect',
      responseMs: 4200,
      queueCap: 25,
      coverageAssignments: 3,
      now,
    });

    expect(metrics.leitnerBox).toBe(2);
    expect(metrics.totalAttempts).toBe(snapshot.totalAttempts + 1);
    expect(metrics.correctAttempts).toBe(snapshot.correctAttempts);
    expect(metrics.coverageScore).toBeCloseTo(computeCoverageScore(3, 25), 3);
    expect(metrics.weaknessComponent).toBeGreaterThan(snapshot.accuracyWeight);
    expect(metrics.dueAt.getTime()).toBeGreaterThan(now.getTime());
  });
});
