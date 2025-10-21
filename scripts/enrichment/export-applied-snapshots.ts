import { rm } from "node:fs/promises";
import path from "node:path";

import { and, eq, inArray, isNotNull } from "drizzle-orm";

import { getDb, getPool } from "@db/client";
import { enrichmentProviderSnapshots, words } from "@db/schema";
import type { EnrichmentProviderSnapshot } from "@shared/enrichment";

import {
  persistProviderSnapshotToFile,
  SupabaseStorageNotConfiguredError,
  syncEnrichmentDirectoryToSupabase,
} from "./storage";
import { writeWordsBackupToDisk } from "./backup";

function parseArgs(argv: string[]): { clean: boolean; purge: boolean } {
  return {
    clean: argv.includes("--clean") || argv.includes("-c"),
    purge: argv.includes("--purge") || argv.includes("-p"),
  };
}

function toSnapshot(record: typeof enrichmentProviderSnapshots.$inferSelect): EnrichmentProviderSnapshot {
  return {
    id: record.id,
    wordId: record.wordId,
    lemma: record.lemma,
    pos: record.pos,
    providerId: record.providerId,
    providerLabel: record.providerLabel ?? undefined,
    status: record.status as EnrichmentProviderSnapshot["status"],
    error: record.error ?? undefined,
    trigger: (record.trigger as EnrichmentProviderSnapshot["trigger"]) ?? "preview",
    mode: (record.mode as EnrichmentProviderSnapshot["mode"]) ?? "pending",
    translations: (record.translations as EnrichmentProviderSnapshot["translations"]) ?? null,
    examples: (record.examples as EnrichmentProviderSnapshot["examples"]) ?? null,
    synonyms: (record.synonyms as EnrichmentProviderSnapshot["synonyms"]) ?? null,
    englishHints: (record.englishHints as EnrichmentProviderSnapshot["englishHints"]) ?? null,
    verbForms: (record.verbForms as EnrichmentProviderSnapshot["verbForms"]) ?? null,
    nounForms: (record.nounForms as EnrichmentProviderSnapshot["nounForms"]) ?? null,
    adjectiveForms: (record.adjectiveForms as EnrichmentProviderSnapshot["adjectiveForms"]) ?? null,
    prepositionAttributes:
      (record.prepositionAttributes as EnrichmentProviderSnapshot["prepositionAttributes"]) ?? null,
    rawPayload: record.rawPayload ?? undefined,
    collectedAt: serialiseDate(record.collectedAt),
    createdAt: serialiseDate(record.createdAt),
  } satisfies EnrichmentProviderSnapshot;
}

function serialiseDate(value: Date | string | null): string {
  if (!value) {
    return new Date().toISOString();
  }
  if (value instanceof Date) {
    return value.toISOString();
  }
  return new Date(value).toISOString();
}

interface LoadedSnapshot {
  id: number;
  snapshot: EnrichmentProviderSnapshot;
}

async function loadAppliedSnapshots(): Promise<LoadedSnapshot[]> {
  const database = getDb();
  const rows = await database
    .select({ snapshot: enrichmentProviderSnapshots })
    .from(enrichmentProviderSnapshots)
    .innerJoin(words, eq(words.id, enrichmentProviderSnapshots.wordId))
    .where(
      and(eq(enrichmentProviderSnapshots.trigger, "apply"), isNotNull(words.enrichmentMethod)),
    );

  const latestByProvider = new Map<string, typeof enrichmentProviderSnapshots.$inferSelect>();

  for (const row of rows) {
    const record = row.snapshot;
    const lemmaKey = record.lemma.trim().toLowerCase();
    const posKey = record.pos.trim().toLowerCase();
    const key = `${lemmaKey}::${posKey}::${record.providerId}`;
    const existing = latestByProvider.get(key);
    if (!existing) {
      latestByProvider.set(key, record);
      continue;
    }
    const existingTime = new Date(existing.collectedAt ?? existing.createdAt ?? existing.id).getTime();
    const candidateTime = new Date(record.collectedAt ?? record.createdAt ?? record.id).getTime();
    if (candidateTime >= existingTime) {
      latestByProvider.set(key, record);
    }
  }

  return Array.from(latestByProvider.values()).map((record) => ({
    id: record.id,
    snapshot: toSnapshot(record),
  }));
}

async function cleanOutputDir(rootDir: string): Promise<void> {
  const outputDir = path.resolve(rootDir, "data", "enrichment");
  await rm(outputDir, { force: true, recursive: true });
}

async function purgeAppliedSnapshots(wordIds: number[]): Promise<number> {
  if (!wordIds.length) {
    return 0;
  }

  const database = getDb();
  const deleted = await database
    .delete(enrichmentProviderSnapshots)
    .where(
      and(
        eq(enrichmentProviderSnapshots.trigger, "apply"),
        inArray(enrichmentProviderSnapshots.wordId, wordIds),
      ),
    )
    .returning({ id: enrichmentProviderSnapshots.id });

  return deleted.length;
}

async function main(): Promise<void> {
  const pool = getPool();
  const { clean, purge } = parseArgs(process.argv.slice(2));
  const rootDir = process.cwd();

  try {
    if (clean) {
      await cleanOutputDir(rootDir);
    }

    const loadedSnapshots = await loadAppliedSnapshots();
    const snapshots = loadedSnapshots.map((entry) => entry.snapshot);
    const exportedWordIds = Array.from(
      new Set(
        loadedSnapshots
          .map((entry) => entry.snapshot.wordId)
          .filter((value): value is number => typeof value === "number"),
      ),
    );

    if (snapshots.length) {
      snapshots.sort((a, b) => {
        if (a.pos !== b.pos) {
          return a.pos.localeCompare(b.pos);
        }
        if (a.providerId !== b.providerId) {
          return a.providerId.localeCompare(b.providerId);
        }
        return a.lemma.localeCompare(b.lemma);
      });

      let successCount = 0;
      const changedFiles = new Set<string>();
      for (const snapshot of snapshots) {
        const { relativePath } = await persistProviderSnapshotToFile(snapshot, { skipUpload: true });
        successCount += 1;
        if (relativePath) {
          changedFiles.add(relativePath);
        }
      }

      console.log(`Persisted ${successCount} provider snapshots to data/enrichment`);

      if (changedFiles.size > 0) {
        try {
          const syncResult = await syncEnrichmentDirectoryToSupabase(rootDir, {
            includeRelativePaths: Array.from(changedFiles),
          });
          console.log(
            `Uploaded ${syncResult.uploaded}/${syncResult.totalFiles} provider files to Supabase Storage`,
          );
          if (syncResult.failed.length > 0) {
            for (const failure of syncResult.failed) {
              console.warn(`Failed to upload ${failure.path}: ${failure.error}`);
            }
          }
        } catch (error) {
          if (error instanceof SupabaseStorageNotConfiguredError) {
            console.log("Supabase Storage is not configured; skipped uploading provider files.");
          } else {
            throw error;
          }
        }
      }

      if (purge) {
        const purgedCount = await purgeAppliedSnapshots(exportedWordIds);
        console.log(
          `Purged ${purgedCount} applied provider snapshots from the database across ${exportedWordIds.length} words`,
        );
      }
    } else {
      console.log("No applied enrichment snapshots found.");
    }

    const backupResult = await writeWordsBackupToDisk({ rootDir });
    console.log(
      `Wrote words backup to ${backupResult.summary.relativePath} (latest alias: ${backupResult.summary.latestRelativePath})`,
    );
  } finally {
    await pool.end().catch((error) => {
      console.warn("Failed to close database pool cleanly", error);
    });
  }
}

main().catch((error) => {
  console.error("Failed to export applied enrichment snapshots", error);
  process.exit(1);
});
