import type { PracticeResult } from "@shared";
import type { LexemePos } from "@shared";

export interface PracticeAttemptAnalytics {
  readonly taskId: string;
  readonly lexemeId: string;
  readonly pos: string;
  readonly taskType: string;
  readonly renderer: string;
  readonly deviceId: string;
  readonly userId: string | null;
  readonly result: PracticeResult;
  readonly responseMs: number;
  readonly submittedAt: Date;
  readonly answeredAt?: Date | null;
  readonly hintsUsed?: boolean | null;
  readonly packId?: string | null;
  readonly metadata?: Record<string, unknown> | null;
}

export interface SchedulingSnapshotAnalytics {
  readonly taskId: string;
  readonly deviceId: string;
  readonly pos: string;
  readonly taskType: string;
  readonly leitnerBox: number;
  readonly priorityScore: number | null;
  readonly dueAt: Date | null;
  readonly updatedAt: Date;
  readonly totalAttempts: number;
  readonly correctAttempts: number;
  readonly averageResponseMs: number;
  readonly accuracyWeight: number;
  readonly latencyWeight: number;
  readonly stabilityWeight: number;
}

export interface TelemetrySnapshotAnalytics {
  readonly taskId: string;
  readonly pos: string;
  readonly sampledAt: Date;
  readonly priorityScore: number;
  readonly accuracyWeight: number;
  readonly latencyWeight: number;
  readonly stabilityWeight: number;
  readonly metadata?: Record<string, unknown> | null;
}

export interface PackMembershipAnalytics {
  readonly packId: string;
  readonly packName: string;
  readonly posScope: string;
  readonly lexemeId: string;
}

export interface PostLaunchAnalyticsInput {
  readonly practiceAttempts: PracticeAttemptAnalytics[];
  readonly schedulingSnapshots: SchedulingSnapshotAnalytics[];
  readonly telemetrySnapshots: TelemetrySnapshotAnalytics[];
  readonly packMemberships: PackMembershipAnalytics[];
}

export interface DailyActiveDeviceMetric {
  readonly date: string;
  readonly pos: string;
  readonly devices: number;
}

export interface TaskPerformanceMetric {
  readonly pos: string;
  readonly taskType: string;
  readonly attempts: number;
  readonly correctAttempts: number;
  readonly accuracy: number;
  readonly averageResponseMs: number;
}

export interface PriorityHeatmapMetric {
  readonly pos: string;
  readonly leitnerBox: number;
  readonly tasks: number;
  readonly averagePriority: number;
}

export interface DueVsCompletedMetric {
  readonly date: string;
  readonly dueTasks: number;
  readonly completedTasks: number;
}

export interface DistributionStats {
  readonly average: number;
  readonly min: number;
  readonly max: number;
  readonly p50: number;
  readonly p90: number;
}

export interface WeightDistributionMetric {
  readonly pos: string;
  readonly accuracy: DistributionStats;
  readonly latency: DistributionStats;
  readonly stability: DistributionStats;
}

export interface OverdueSummaryMetric {
  readonly pos: string;
  readonly overduePercentage: number;
  readonly overdueTasks: number;
  readonly totalTasks: number;
}

export interface PackAccuracyMetric {
  readonly packId: string;
  readonly packName: string;
  readonly posScope: string;
  readonly attempts: number;
  readonly correctAttempts: number;
  readonly accuracy: number;
  readonly hintUsageRate: number;
}

export interface TopChallengeMetric {
  readonly taskId: string;
  readonly pos: string;
  readonly taskType: string;
  readonly incorrectAttempts: number;
  readonly totalAttempts: number;
  readonly averageResponseMs: number;
}

export interface TelemetryAnomalyMetric {
  readonly taskId: string;
  readonly pos: string;
  readonly sampledAt: string;
  readonly responseMs: number;
  readonly zScore: number;
}

export interface PostLaunchAnalyticsReport {
  readonly generatedAt: string;
  readonly posAdoption: {
    readonly dailyActiveDevices: DailyActiveDeviceMetric[];
    readonly taskPerformance: TaskPerformanceMetric[];
  };
  readonly schedulerHealth: {
    readonly priorityHeatmap: PriorityHeatmapMetric[];
    readonly dueVsCompleted: DueVsCompletedMetric[];
    readonly weightDistribution: WeightDistributionMetric[];
    readonly overdueSummary: OverdueSummaryMetric[];
  };
  readonly contentQuality: {
    readonly packAccuracy: PackAccuracyMetric[];
    readonly topChallenges: TopChallengeMetric[];
    readonly telemetryAnomalies: TelemetryAnomalyMetric[];
  };
}

function toDateKey(value: Date): string {
  const copy = new Date(value);
  copy.setUTCHours(0, 0, 0, 0);
  return copy.toISOString().slice(0, 10);
}

function computePercentile(values: number[], percentile: number): number {
  if (!values.length) {
    return 0;
  }
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.floor((percentile / 100) * (sorted.length - 1))));
  return Number(sorted[index].toFixed(4));
}

function computeDistribution(values: number[]): DistributionStats {
  if (!values.length) {
    return { average: 0, min: 0, max: 0, p50: 0, p90: 0 };
  }
  const total = values.reduce((sum, value) => sum + value, 0);
  const average = Number((total / values.length).toFixed(4));
  const min = Math.min(...values);
  const max = Math.max(...values);
  return {
    average,
    min: Number(min.toFixed(4)),
    max: Number(max.toFixed(4)),
    p50: computePercentile(values, 50),
    p90: computePercentile(values, 90),
  } satisfies DistributionStats;
}

function isCorrect(result: PracticeResult): boolean {
  return result === "correct";
}

function normalizePos(value: string): string {
  return value.toLowerCase() as LexemePos | string;
}

function unique<T>(values: Iterable<T>): T[] {
  return Array.from(new Set(values));
}

export function computePostLaunchAnalytics(input: PostLaunchAnalyticsInput): PostLaunchAnalyticsReport {
  const { practiceAttempts, schedulingSnapshots, telemetrySnapshots, packMemberships } = input;

  const dailyActiveMap = new Map<string, Map<string, Set<string>>>();
  const taskPerformanceMap = new Map<string, { pos: string; taskType: string; attempts: number; correct: number; responseMs: number }>();
  const packByLexeme = new Map<string, PackMembershipAnalytics[]>();
  const packInfo = new Map<string, { packId: string; packName: string; posScope: string }>();

  for (const membership of packMemberships) {
    const list = packByLexeme.get(membership.lexemeId) ?? [];
    list.push(membership);
    packByLexeme.set(membership.lexemeId, list);
    packInfo.set(membership.packId, {
      packId: membership.packId,
      packName: membership.packName,
      posScope: membership.posScope,
    });
  }

  for (const attempt of practiceAttempts) {
    const pos = normalizePos(attempt.pos);
    const dayKey = toDateKey(attempt.submittedAt);

    if (!dailyActiveMap.has(dayKey)) {
      dailyActiveMap.set(dayKey, new Map());
    }
    const posMap = dailyActiveMap.get(dayKey)!;
    if (!posMap.has(pos)) {
      posMap.set(pos, new Set());
    }
    posMap.get(pos)!.add(attempt.deviceId);

    const performanceKey = `${pos}::${attempt.taskType}`;
    const existingPerformance = taskPerformanceMap.get(performanceKey) ?? {
      pos,
      taskType: attempt.taskType,
      attempts: 0,
      correct: 0,
      responseMs: 0,
    };
    existingPerformance.attempts += 1;
    if (isCorrect(attempt.result)) {
      existingPerformance.correct += 1;
    }
    existingPerformance.responseMs += attempt.responseMs;
    taskPerformanceMap.set(performanceKey, existingPerformance);

  }

  const dailyActiveDevices: DailyActiveDeviceMetric[] = Array.from(dailyActiveMap.entries())
    .flatMap(([date, posMap]) =>
      Array.from(posMap.entries()).map(([pos, devices]) => ({
        date,
        pos,
        devices: devices.size,
      } satisfies DailyActiveDeviceMetric)),
    )
    .sort((a, b) => (a.date === b.date ? a.pos.localeCompare(b.pos) : a.date.localeCompare(b.date)));

  const taskPerformance: TaskPerformanceMetric[] = Array.from(taskPerformanceMap.values())
    .map((entry) => ({
      pos: entry.pos,
      taskType: entry.taskType,
      attempts: entry.attempts,
      correctAttempts: entry.correct,
      accuracy: entry.attempts ? Number(((entry.correct / entry.attempts) * 100).toFixed(2)) : 0,
      averageResponseMs: entry.attempts ? Math.round(entry.responseMs / entry.attempts) : 0,
    }))
    .sort((a, b) => (a.pos === b.pos ? b.attempts - a.attempts : a.pos.localeCompare(b.pos)));

  const priorityHeatmapMap = new Map<string, Map<number, { total: number; count: number }>>();
  const duePerDay = new Map<string, number>();
  const overdueByPos = new Map<string, { total: number; overdue: number }>();

  const now = Date.now();
  const overdueThreshold = now - 12 * 60 * 60 * 1000;

  for (const snapshot of schedulingSnapshots) {
    const pos = normalizePos(snapshot.pos);
    const boxMap = priorityHeatmapMap.get(pos) ?? new Map<number, { total: number; count: number }>();
    const boxEntry = boxMap.get(snapshot.leitnerBox) ?? { total: 0, count: 0 };
    const score = Number(snapshot.priorityScore ?? 0);
    boxEntry.total += score;
    boxEntry.count += 1;
    boxMap.set(snapshot.leitnerBox, boxEntry);
    priorityHeatmapMap.set(pos, boxMap);

    if (snapshot.dueAt) {
      const dueDay = toDateKey(snapshot.dueAt);
      duePerDay.set(dueDay, (duePerDay.get(dueDay) ?? 0) + 1);
    }

    const summary = overdueByPos.get(pos) ?? { total: 0, overdue: 0 };
    summary.total += 1;
    if (snapshot.dueAt && snapshot.dueAt.getTime() < overdueThreshold) {
      summary.overdue += 1;
    }
    overdueByPos.set(pos, summary);
  }

  const priorityHeatmap: PriorityHeatmapMetric[] = Array.from(priorityHeatmapMap.entries())
    .flatMap(([pos, boxMap]) =>
      Array.from(boxMap.entries()).map(([leitnerBox, entry]) => ({
        pos,
        leitnerBox,
        tasks: entry.count,
        averagePriority: entry.count ? Number((entry.total / entry.count).toFixed(4)) : 0,
      } satisfies PriorityHeatmapMetric)),
    )
    .sort((a, b) => (a.pos === b.pos ? a.leitnerBox - b.leitnerBox : a.pos.localeCompare(b.pos)));

  const completedPerDay = new Map<string, number>();
  for (const attempt of practiceAttempts) {
    const day = toDateKey(attempt.submittedAt);
    completedPerDay.set(day, (completedPerDay.get(day) ?? 0) + 1);
  }

  const allDays = unique([...completedPerDay.keys(), ...duePerDay.keys()]).sort();
  const dueVsCompleted: DueVsCompletedMetric[] = allDays.map((day) => ({
    date: day,
    dueTasks: duePerDay.get(day) ?? 0,
    completedTasks: completedPerDay.get(day) ?? 0,
  }));

  const weightDistributionByPos = new Map<string, { accuracy: number[]; latency: number[]; stability: number[] }>();
  const telemetryResponseTimes: Array<{ taskId: string; pos: string; sampledAt: Date; responseMs: number }> = [];

  for (const snapshot of telemetrySnapshots) {
    const pos = normalizePos(snapshot.pos);
    const distribution = weightDistributionByPos.get(pos) ?? {
      accuracy: [],
      latency: [],
      stability: [],
    };
    distribution.accuracy.push(snapshot.accuracyWeight);
    distribution.latency.push(snapshot.latencyWeight);
    distribution.stability.push(snapshot.stabilityWeight);
    weightDistributionByPos.set(pos, distribution);

    const responseValue = snapshot.metadata?.responseMs;
    if (typeof responseValue === "number" && Number.isFinite(responseValue)) {
      telemetryResponseTimes.push({
        taskId: snapshot.taskId,
        pos,
        sampledAt: snapshot.sampledAt,
        responseMs: responseValue,
      });
    }
  }

  const weightDistribution: WeightDistributionMetric[] = Array.from(weightDistributionByPos.entries())
    .map(([pos, values]) => ({
      pos,
      accuracy: computeDistribution(values.accuracy),
      latency: computeDistribution(values.latency),
      stability: computeDistribution(values.stability),
    }))
    .sort((a, b) => a.pos.localeCompare(b.pos));

  const overdueSummary: OverdueSummaryMetric[] = Array.from(overdueByPos.entries())
    .map(([pos, summary]) => ({
      pos,
      overdueTasks: summary.overdue,
      totalTasks: summary.total,
      overduePercentage: summary.total
        ? Number(((summary.overdue / summary.total) * 100).toFixed(2))
        : 0,
    }))
    .sort((a, b) => a.pos.localeCompare(b.pos));

  const packAccuracyMap = new Map<string, {
    packId: string;
    packName: string;
    posScope: string;
    attempts: number;
    correct: number;
    hintsUsed: number;
  }>();

  const topChallengesMap = new Map<string, {
    taskId: string;
    pos: string;
    taskType: string;
    attempts: number;
    incorrect: number;
    responseMs: number;
  }>();

  for (const attempt of practiceAttempts) {
    const isAttemptCorrect = isCorrect(attempt.result);
    const packCandidates = new Set<string>();
    if (attempt.packId) {
      packCandidates.add(attempt.packId);
    }
    const memberships = packByLexeme.get(attempt.lexemeId) ?? [];
    for (const membership of memberships) {
      packCandidates.add(membership.packId);
    }

    for (const packId of packCandidates) {
      const info = packInfo.get(packId) ?? { packId, packName: packId, posScope: normalizePos(attempt.pos) };
      const entry = packAccuracyMap.get(packId) ?? {
        packId,
        packName: info.packName,
        posScope: info.posScope,
        attempts: 0,
        correct: 0,
        hintsUsed: 0,
      };
      entry.attempts += 1;
      if (isAttemptCorrect) {
        entry.correct += 1;
      }
      if (attempt.hintsUsed) {
        entry.hintsUsed += 1;
      }
      packAccuracyMap.set(packId, entry);
    }

    const challenge = topChallengesMap.get(attempt.taskId) ?? {
      taskId: attempt.taskId,
      pos: normalizePos(attempt.pos),
      taskType: attempt.taskType,
      attempts: 0,
      incorrect: 0,
      responseMs: 0,
    };
    challenge.attempts += 1;
    if (!isAttemptCorrect) {
      challenge.incorrect += 1;
    }
    challenge.responseMs += attempt.responseMs;
    topChallengesMap.set(attempt.taskId, challenge);
  }

  const packAccuracy: PackAccuracyMetric[] = Array.from(packAccuracyMap.values())
    .map((entry) => ({
      packId: entry.packId,
      packName: entry.packName,
      posScope: entry.posScope,
      attempts: entry.attempts,
      correctAttempts: entry.correct,
      accuracy: entry.attempts ? Number(((entry.correct / entry.attempts) * 100).toFixed(2)) : 0,
      hintUsageRate: entry.attempts ? Number(((entry.hintsUsed / entry.attempts) * 100).toFixed(2)) : 0,
    }))
    .sort((a, b) => b.attempts - a.attempts);

  const topChallenges: TopChallengeMetric[] = Array.from(topChallengesMap.values())
    .map((entry) => ({
      taskId: entry.taskId,
      pos: entry.pos,
      taskType: entry.taskType,
      incorrectAttempts: entry.incorrect,
      totalAttempts: entry.attempts,
      averageResponseMs: entry.attempts ? Math.round(entry.responseMs / entry.attempts) : 0,
    }))
    .sort((a, b) => (b.incorrectAttempts === a.incorrectAttempts ? b.totalAttempts - a.totalAttempts : b.incorrectAttempts - a.incorrectAttempts))
    .slice(0, 20);

  let mean = 0;
  let stdDev = 0;
  if (telemetryResponseTimes.length) {
    mean = telemetryResponseTimes.reduce((sum, item) => sum + item.responseMs, 0) / telemetryResponseTimes.length;
    const variance = telemetryResponseTimes.reduce((sum, item) => sum + (item.responseMs - mean) ** 2, 0) /
      Math.max(1, telemetryResponseTimes.length);
    stdDev = Math.sqrt(variance);
  }

  const telemetryAnomalies: TelemetryAnomalyMetric[] = stdDev > 0
    ? telemetryResponseTimes
        .map((entry) => ({
          taskId: entry.taskId,
          pos: entry.pos,
          sampledAt: entry.sampledAt.toISOString(),
          responseMs: entry.responseMs,
          zScore: Number((((entry.responseMs - mean) / stdDev)).toFixed(4)),
        }))
        .filter((entry) => Math.abs(entry.zScore) >= 2)
        .sort((a, b) => Math.abs(b.zScore) - Math.abs(a.zScore))
    : [];

  return {
    generatedAt: new Date().toISOString(),
    posAdoption: {
      dailyActiveDevices,
      taskPerformance,
    },
    schedulerHealth: {
      priorityHeatmap,
      dueVsCompleted,
      weightDistribution,
      overdueSummary,
    },
    contentQuality: {
      packAccuracy,
      topChallenges,
      telemetryAnomalies,
    },
  } satisfies PostLaunchAnalyticsReport;
}
