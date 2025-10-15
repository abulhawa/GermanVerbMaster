import { count, eq, gte } from 'drizzle-orm';

import { db } from '@db';
import { practiceHistory } from '@db/schema';

type PracticeRow = {
  deviceId: string | null;
  userId: string | null;
  result: 'correct' | 'incorrect';
  responseMs: number;
  level: string;
  submittedAt: Date;
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
      deviceId: practiceHistory.deviceId,
      userId: practiceHistory.userId,
      result: practiceHistory.result,
      responseMs: practiceHistory.responseMs,
      level: practiceHistory.cefrLevel,
      submittedAt: practiceHistory.submittedAt,
    })
    .from(practiceHistory)
    .orderBy(practiceHistory.submittedAt);

  const recent = await baseQuery.where(gte(practiceHistory.submittedAt, since));
  const rows = recent.length > 0 ? recent : await baseQuery;

  return rows.map((row) => ({
    deviceId: row.deviceId,
    userId: row.userId ?? null,
    result: row.result,
    responseMs: row.responseMs,
    level: row.level ?? 'unknown',
    submittedAt: row.submittedAt ?? new Date(),
  }));
}

async function main(): Promise<void> {
  const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;
  const cutoff = new Date(Date.now() - THIRTY_DAYS_MS);

  const rows = await loadPracticeRows(cutoff);
  const dataWindow = rows.some((row) => row.submittedAt >= cutoff) ? '30d' : 'all-time';

  const byDevice = new Set(
    rows.map((row) => row.deviceId ?? `anon-${row.userId ?? 'unknown'}`),
  );
  const byUser = new Set(rows.filter((row) => row.userId).map((row) => row.userId as string));

  const totals = rows.reduce<PracticeTotals>(
    (acc, row) => {
      acc.totalAttempts += 1;
      if (row.result === 'correct') acc.correctAttempts += 1;
      acc.timeSpentMs += row.responseMs;
      const day = row.submittedAt.toISOString().slice(0, 10);
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
    .from(practiceHistory)
    .where(eq(practiceHistory.result, 'correct'));

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
