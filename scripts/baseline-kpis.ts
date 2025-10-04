import { count, eq, gte } from 'drizzle-orm';

import { db } from '@db';
import { verbPracticeHistory } from '@db/schema';

type PracticeRow = {
  deviceId: string | null;
  userId: number;
  result: 'correct' | 'incorrect';
  timeSpent: number;
  level: string;
  createdAt: Date;
};

type PracticeTotals = {
  totalAttempts: number;
  correctAttempts: number;
  timeSpentMs: number;
  byDay: Map<string, number>;
};

async function loadPracticeRows(since: Date): Promise<PracticeRow[]> {
  const baseQuery = db
    .select({
      deviceId: verbPracticeHistory.deviceId,
      userId: verbPracticeHistory.userId,
      result: verbPracticeHistory.result,
      timeSpent: verbPracticeHistory.timeSpent,
      level: verbPracticeHistory.level,
      createdAt: verbPracticeHistory.createdAt,
    })
    .from(verbPracticeHistory)
    .orderBy(verbPracticeHistory.createdAt);

  const recent = await baseQuery.where(gte(verbPracticeHistory.createdAt, since));
  const rows = recent.length > 0 ? recent : await baseQuery;

  return rows.map((row) => ({
    deviceId: row.deviceId,
    userId: row.userId ?? 0,
    result: row.result,
    timeSpent: row.timeSpent,
    level: row.level ?? 'unknown',
    createdAt: row.createdAt ?? new Date(),
  }));
}

async function main(): Promise<void> {
  const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;
  const cutoff = new Date(Date.now() - THIRTY_DAYS_MS);

  const rows = await loadPracticeRows(cutoff);
  const dataWindow = rows.some((row) => row.createdAt >= cutoff) ? '30d' : 'all-time';

  const byDevice = new Set(rows.map((row) => row.deviceId ?? `anon-${row.userId}`));
  const byUser = new Set(rows.filter((row) => row.userId !== 0).map((row) => row.userId));

  const totals = rows.reduce<PracticeTotals>(
    (acc, row) => {
      acc.totalAttempts += 1;
      if (row.result === 'correct') acc.correctAttempts += 1;
      acc.timeSpentMs += row.timeSpent;
      const day = row.createdAt.toISOString().slice(0, 10);
      acc.byDay.set(day, (acc.byDay.get(day) || 0) + 1);
      return acc;
    },
    { totalAttempts: 0, correctAttempts: 0, timeSpentMs: 0, byDay: new Map() },
  );

  const activeDays = totals.byDay.size || 1;
  const avgDailyAttempts = totals.totalAttempts / activeDays;
  const accuracy = totals.totalAttempts
    ? (totals.correctAttempts / totals.totalAttempts) * 100
    : 0;
  const avgTimeSeconds = totals.totalAttempts ? totals.timeSpentMs / totals.totalAttempts / 1000 : 0;

  const levelStats = rows.reduce<Map<string, { attempts: number; correct: number }>>((map, row) => {
    const entry = map.get(row.level) ?? { attempts: 0, correct: 0 };
    entry.attempts += 1;
    if (row.result === 'correct') entry.correct += 1;
    map.set(row.level, entry);
    return map;
  }, new Map());

  const levelBreakdown = Array.from(levelStats.entries()).map(([level, stats]) => ({
    level,
    attempts: stats.attempts,
    accuracy: stats.attempts ? (stats.correct / stats.attempts) * 100 : 0,
  }));

  const totalCorrect = await db
    .select({ total: count() })
    .from(verbPracticeHistory)
    .where(eq(verbPracticeHistory.result, 'correct'));

  console.log(
    JSON.stringify(
      {
        window: dataWindow,
        totalAttempts: totals.totalAttempts,
        activeLearners: {
          devices: byDevice.size,
          users: byUser.size,
        },
        avgDailyAttempts,
        accuracy,
        avgTimeSeconds,
        activeDays,
        levelBreakdown,
        totalCorrectSubmissions: Number(totalCorrect[0]?.total ?? 0),
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error('Failed to compute baseline KPIs', error);
  process.exit(1);
});
