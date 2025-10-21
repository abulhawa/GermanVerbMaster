import { getDb, getPool } from "@db/client";
import { enrichmentProviderSnapshots } from "@db/schema";
import { sql } from "drizzle-orm";

async function main(): Promise<void> {
  const db = getDb();
  const rows = await db
    .select({
      trigger: enrichmentProviderSnapshots.trigger,
      count: sql<number>`count(*)`,
    })
    .from(enrichmentProviderSnapshots)
    .groupBy(enrichmentProviderSnapshots.trigger)
    .orderBy(enrichmentProviderSnapshots.trigger);

  const total = rows.reduce((sum, row) => sum + Number(row.count ?? 0), 0);
  console.log(
    JSON.stringify(
      {
        totalsByTrigger: rows.map((row) => ({
          trigger: row.trigger,
          count: Number(row.count ?? 0),
        })),
        totalSnapshots: total,
      },
      null,
      2,
    ),
  );
}

main()
  .catch((error) => {
    console.error("Failed to inspect snapshot counts", error);
    process.exitCode = 1;
  })
  .finally(() => {
    const pool = getPool();
    return pool.end().catch((error) => {
      console.warn("Failed to close database pool cleanly", error);
    });
  });
