import { getDb, getPool } from "@db/client";
import { enrichmentProviderSnapshots, words } from "@db/schema";
import { and, eq, inArray, isNotNull, sql } from "drizzle-orm";

async function main(): Promise<void> {
  const purge = process.argv.includes("--purge");
  const db = getDb();

  const [{ count: total }] = await db
    .select({ count: sql<number>`count(*)` })
    .from(enrichmentProviderSnapshots)
    .where(eq(enrichmentProviderSnapshots.trigger, "apply"));

  const [{ count: linked }] = await db
    .select({ count: sql<number>`count(*)` })
    .from(enrichmentProviderSnapshots)
    .innerJoin(words, eq(words.id, enrichmentProviderSnapshots.wordId))
    .where(
      and(
        eq(enrichmentProviderSnapshots.trigger, "apply"),
        isNotNull(words.enrichmentMethod),
      ),
    );

  let purged = 0;

  if (purge && Number(total ?? 0) > 0) {
    const distinctWordIds = await db
      .selectDistinct({ wordId: enrichmentProviderSnapshots.wordId })
      .from(enrichmentProviderSnapshots)
      .innerJoin(words, eq(words.id, enrichmentProviderSnapshots.wordId))
      .where(
        and(
          eq(enrichmentProviderSnapshots.trigger, "apply"),
          isNotNull(words.enrichmentMethod),
        ),
      );

    const wordIds = distinctWordIds
      .map((row) => row.wordId)
      .filter((value): value is number => typeof value === "number");

    if (wordIds.length > 0) {
      const deleted = await db
        .delete(enrichmentProviderSnapshots)
        .where(
          and(
            eq(enrichmentProviderSnapshots.trigger, "apply"),
            inArray(enrichmentProviderSnapshots.wordId, wordIds),
          ),
        )
        .returning({ id: enrichmentProviderSnapshots.id });

      purged = deleted.length;
    }
  }

  const summary: Record<string, number | undefined> = {
    remainingAppliedSnapshots: Number(total ?? 0),
    remainingLinkedToWordsWithMethod: Number(linked ?? 0),
  };

  if (purge) {
    summary.purgedSnapshots = purged;
  }

  console.log(JSON.stringify(summary, null, 2));
}

main()
  .catch((error) => {
    console.error("Failed to inspect applied snapshots", error);
    process.exitCode = 1;
  })
  .finally(() => {
    const pool = getPool();
    return pool.end().catch((error) => {
      console.warn("Failed to close database pool cleanly", error);
    });
  });
