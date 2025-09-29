import Database from "better-sqlite3";

interface PracticeRow {
  device_id: string | null;
  user_id: number;
  result: "correct" | "incorrect";
  time_spent: number;
  level: string;
  created_at: number;
}

interface PracticeTotals {
  totalAttempts: number;
  correctAttempts: number;
  timeSpent: number;
  byDay: Map<string, number>;
}

const db = new Database("db/data.sqlite", { readonly: true });
const nowTs = Math.floor(Date.now() / 1000);
const THIRTY_DAYS = 30 * 24 * 60 * 60;
const cutoff = nowTs - THIRTY_DAYS;

const rows = db
  .prepare(`
    SELECT device_id, COALESCE(user_id, 0) AS user_id, result, time_spent, level, created_at
    FROM verb_practice_history
    WHERE created_at >= ?
    ORDER BY created_at ASC
  `)
  .all(cutoff) as PracticeRow[];

const windowRows: PracticeRow[] = rows.length > 0
  ? rows
  : (db.prepare(`
      SELECT device_id, COALESCE(user_id, 0) AS user_id, result, time_spent, level, created_at
      FROM verb_practice_history
      ORDER BY created_at ASC
    `).all() as PracticeRow[]);

const dataWindow = rows.length > 0 ? "30d" : "all-time";

const byDevice = new Set<string>(
  windowRows.map((row) => row.device_id ?? `anon-${row.user_id}`),
);
const byUser = new Set<number>(
  windowRows.filter((row) => row.user_id !== 0).map((row) => row.user_id),
);

const totals = windowRows.reduce<PracticeTotals>(
  (acc, row) => {
    acc.totalAttempts += 1;
    if (row.result === "correct") acc.correctAttempts += 1;
    acc.timeSpent += row.time_spent;
    const day = new Date(row.created_at * 1000).toISOString().slice(0, 10);
    acc.byDay.set(day, (acc.byDay.get(day) || 0) + 1);
    return acc;
  },
  { totalAttempts: 0, correctAttempts: 0, timeSpent: 0, byDay: new Map<string, number>() },
);

const activeDays = totals.byDay.size || 1;
const avgDailyAttempts = totals.totalAttempts / activeDays;
const accuracy = totals.totalAttempts
  ? (totals.correctAttempts / totals.totalAttempts) * 100
  : 0;
const avgTimeSeconds = totals.totalAttempts ? totals.timeSpent / totals.totalAttempts / 1000 : 0;

const levelStats = windowRows.reduce<Map<string, { attempts: number; correct: number }>>((map, row) => {
  const entry = map.get(row.level) ?? { attempts: 0, correct: 0 };
  entry.attempts += 1;
  if (row.result === "correct") entry.correct += 1;
  map.set(row.level, entry);
  return map;
}, new Map());

const levelBreakdown = Array.from(levelStats.entries()).map(([level, stats]) => ({
  level,
  attempts: stats.attempts,
  accuracy: stats.attempts ? (stats.correct / stats.attempts) * 100 : 0,
}));

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
    },
    null,
    2
  )
);