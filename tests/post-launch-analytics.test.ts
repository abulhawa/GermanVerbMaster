import { describe, expect, it, vi, afterEach } from 'vitest';

import { computePostLaunchAnalytics } from '../server/analytics/post-launch.js';
import type { PracticeAttemptAnalytics, SchedulingSnapshotAnalytics, TelemetrySnapshotAnalytics } from '../server/analytics/post-launch.js';

const ORIGINAL_TZ = process.env.TZ;

describe('computePostLaunchAnalytics', () => {
  afterEach(() => {
    if (typeof ORIGINAL_TZ === 'string') {
      process.env.TZ = ORIGINAL_TZ;
    } else {
      delete process.env.TZ;
    }
    vi.useRealTimers();
  });

  it('keeps practice attempts in the same UTC bucket regardless of local timezone', () => {
    process.env.TZ = 'Asia/Tokyo';

    const practiceAttempts: PracticeAttemptAnalytics[] = [
      {
        taskId: 'task:verb-timezone',
        lexemeId: 'lex:verb-timezone',
        pos: 'verb',
        taskType: 'conjugate_form',
        renderer: 'verb_renderer',
        deviceId: 'device-timezone',
        userId: '42',
        result: 'correct',
        responseMs: 2000,
        submittedAt: new Date('2025-01-01T10:00:00.000Z'),
        answeredAt: new Date('2025-01-01T09:59:59.000Z'),
        hintsUsed: false,
        metadata: null,
      },
    ];

    const report = computePostLaunchAnalytics({
      practiceAttempts,
      schedulingSnapshots: [],
      telemetrySnapshots: []: [],
    });

    const januaryFirst = report.posAdoption.dailyActiveDevices.find(
      (metric) => metric.date === '2025-01-01' && metric.pos === 'verb',
    );

    expect(januaryFirst).toBeDefined();
    expect(januaryFirst!.devices).toBe(1);
  });

  it('summarises adoption, scheduler health, and content quality metrics', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2025-01-05T00:00:00.000Z'));

    const practiceAttempts: PracticeAttemptAnalytics[] = [
      {
        taskId: 'task:verb-1',
        lexemeId: 'lex:verb-1',
        pos: 'verb',
        taskType: 'conjugate_form',
        renderer: 'verb_renderer',
        deviceId: 'device-a',
        userId: '1',
        result: 'correct',
        responseMs: 1500,
        submittedAt: new Date('2025-01-01T10:00:00.000Z'),
        hintsUsed: false,
      },
      {
        taskId: 'task:noun-1',
        lexemeId: 'lex:noun-1',
        pos: 'noun',
        taskType: 'noun_case_declension',
        renderer: 'noun_renderer',
        deviceId: 'device-a',
        userId: '1',
        result: 'incorrect',
        responseMs: 3200,
        submittedAt: new Date('2025-01-01T10:05:00.000Z'),
        hintsUsed: true,
      },
      {
        taskId: 'task:verb-2',
        lexemeId: 'lex:verb-2',
        pos: 'verb',
        taskType: 'conjugate_form',
        renderer: 'verb_renderer',
        deviceId: 'device-b',
        userId: null,
        result: 'incorrect',
        responseMs: 2100,
        submittedAt: new Date('2025-01-01T11:00:00.000Z'),
        hintsUsed: false,
      },
      {
        taskId: 'task:noun-1',
        lexemeId: 'lex:noun-1',
        pos: 'noun',
        taskType: 'noun_case_declension',
        renderer: 'noun_renderer',
        deviceId: 'device-b',
        userId: null,
        result: 'correct',
        responseMs: 2800,
        submittedAt: new Date('2025-01-02T09:00:00.000Z'),
        hintsUsed: false,
      },
      {
        taskId: 'task:adj-1',
        lexemeId: 'lex:adj-1',
        pos: 'adjective',
        taskType: 'adj_ending',
        renderer: 'adj_renderer',
        deviceId: 'device-b',
        userId: null,
        result: 'incorrect',
        responseMs: 4500,
        submittedAt: new Date('2025-01-02T09:30:00.000Z'),
        hintsUsed: false,
      },
      {
        taskId: 'task:noun-1',
        lexemeId: 'lex:noun-1',
        pos: 'noun',
        taskType: 'noun_case_declension',
        renderer: 'noun_renderer',
        deviceId: 'device-c',
        userId: null,
        result: 'incorrect',
        responseMs: 3600,
        submittedAt: new Date('2025-01-03T10:00:00.000Z'),
        hintsUsed: false,
      },
    ];

    const schedulingSnapshots: SchedulingSnapshotAnalytics[] = [
      {
        taskId: 'task:verb-1',
        deviceId: 'device-a',
        pos: 'verb',
        taskType: 'conjugate_form',
        leitnerBox: 2,
        priorityScore: 0.9,
        dueAt: new Date('2025-01-02T08:00:00.000Z'),
        updatedAt: new Date('2025-01-01T10:05:00.000Z'),
        totalAttempts: 3,
        correctAttempts: 2,
        averageResponseMs: 1800,
        accuracyWeight: 0.6,
        latencyWeight: 0.4,
        stabilityWeight: 0.5,
      },
      {
        taskId: 'task:noun-1',
        deviceId: 'device-b',
        pos: 'noun',
        taskType: 'noun_case_declension',
        leitnerBox: 1,
        priorityScore: 0.7,
        dueAt: new Date('2024-12-31T23:00:00.000Z'),
        updatedAt: new Date('2025-01-01T11:00:00.000Z'),
        totalAttempts: 4,
        correctAttempts: 2,
        averageResponseMs: 2500,
        accuracyWeight: 0.5,
        latencyWeight: 0.6,
        stabilityWeight: 0.3,
      },
    ];

    const telemetrySnapshots: TelemetrySnapshotAnalytics[] = [
      {
        taskId: 'task:verb-1',
        pos: 'verb',
        sampledAt: new Date('2025-01-01T11:30:00.000Z'),
        priorityScore: 0.8,
        accuracyWeight: 0.55,
        latencyWeight: 0.4,
        stabilityWeight: 0.5,
        metadata: { responseMs: 1800 },
      },
      {
        taskId: 'task:noun-1',
        pos: 'noun',
        sampledAt: new Date('2025-01-01T12:00:00.000Z'),
        priorityScore: 0.6,
        accuracyWeight: 0.4,
        latencyWeight: 0.7,
        stabilityWeight: 0.3,
        metadata: { responseMs: 8200 },
      },
      {
        taskId: 'task:noun-1',
        pos: 'noun',
        sampledAt: new Date('2025-01-02T12:00:00.000Z'),
        priorityScore: 0.65,
        accuracyWeight: 0.45,
        latencyWeight: 0.6,
        stabilityWeight: 0.35,
        metadata: { responseMs: 1800 },
      },
      {
        taskId: 'task:noun-1',
        pos: 'noun',
        sampledAt: new Date('2025-01-02T13:00:00.000Z'),
        priorityScore: 0.62,
        accuracyWeight: 0.43,
        latencyWeight: 0.6,
        stabilityWeight: 0.32,
        metadata: { responseMs: 1800 },
      },
      {
        taskId: 'task:noun-1',
        pos: 'noun',
        sampledAt: new Date('2025-01-03T13:00:00.000Z'),
        priorityScore: 0.64,
        accuracyWeight: 0.44,
        latencyWeight: 0.58,
        stabilityWeight: 0.33,
        metadata: { responseMs: 1800 },
      },
    ];

    const report = computePostLaunchAnalytics({
      practiceAttempts,
      schedulingSnapshots,
      telemetrySnapshots,
    });

    expect(report.generatedAt).toMatch(/2025-01-05/);

    const januaryFirstVerb = report.posAdoption.dailyActiveDevices.find(
      (item) => item.date === '2025-01-01' && item.pos === 'verb',
    );
    expect(januaryFirstVerb?.devices).toBe(2);

    const nounPerformance = report.posAdoption.taskPerformance.find(
      (item) => item.pos === 'noun' && item.taskType === 'noun_case_declension',
    );
    expect(nounPerformance).toBeDefined();
    expect(nounPerformance!.attempts).toBe(3);
    expect(nounPerformance!.accuracy).toBeCloseTo(33.33, 2);

    const nounHeat = report.schedulerHealth.priorityHeatmap.find(
      (item) => item.pos === 'noun' && item.leitnerBox === 1,
    );
    expect(nounHeat).toBeDefined();
    expect(nounHeat!.tasks).toBe(1);

    const dueJanuarySecond = report.schedulerHealth.dueVsCompleted.find((item) => item.date === '2025-01-02');
    expect(dueJanuarySecond).toBeDefined();
    expect(dueJanuarySecond!.dueTasks).toBe(1);
    expect(dueJanuarySecond!.completedTasks).toBe(2);

    const nounDistribution = report.schedulerHealth.weightDistribution.find((item) => item.pos === 'noun');
    expect(nounDistribution).toBeDefined();
    expect(nounDistribution!.latency.average).toBeGreaterThan(0.6);

    const nounOverdue = report.schedulerHealth.overdueSummary.find((item) => item.pos === 'noun');
    expect(nounOverdue).toBeDefined();
    expect(nounOverdue!.overduePercentage).toBe(100);

    expect(report.contentQuality).not.toHaveProperty('packAccuracy');

    expect(report.contentQuality.topChallenges[0]).toMatchObject({
      taskId: 'task:noun-1',
      incorrectAttempts: 2,
      totalAttempts: 3,
    });

    expect(report.contentQuality.telemetryAnomalies[0]).toMatchObject({
      taskId: 'task:noun-1',
    });
    expect(Math.abs(report.contentQuality.telemetryAnomalies[0]!.zScore)).toBeGreaterThanOrEqual(2);
  });
});
