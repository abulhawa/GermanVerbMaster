import { rm } from "node:fs/promises";
import path from "node:path";

import { and, eq, isNotNull } from "drizzle-orm";

import { db } from "@db";
import { enrichmentProviderSnapshots, words } from "@db/schema";
import type { EnrichmentProviderSnapshot } from "@shared/enrichment";

import { persistProviderSnapshotToFile } from "./storage";

function parseArgs(argv: string[]): { clean: boolean } {
  return {
    clean: argv.includes("--clean") || argv.includes("-c"),
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
    mode: (record.mode as EnrichmentProviderSnapshot["mode"]) ?? "non-canonical",
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

async function loadAppliedSnapshots(): Promise<EnrichmentProviderSnapshot[]> {
  const rows = await db
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

  return Array.from(latestByProvider.values()).map(toSnapshot);
}

async function cleanOutputDir(rootDir: string): Promise<void> {
  const outputDir = path.resolve(rootDir, "data", "enrichment");
  await rm(outputDir, { force: true, recursive: true });
}

async function main(): Promise<void> {
  const { clean } = parseArgs(process.argv.slice(2));
  const rootDir = process.cwd();

  if (clean) {
    await cleanOutputDir(rootDir);
  }

  const snapshots = await loadAppliedSnapshots();
  if (!snapshots.length) {
    console.log("No applied enrichment snapshots found.");
    return;
  }

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
  for (const snapshot of snapshots) {
    await persistProviderSnapshotToFile(snapshot);
    successCount += 1;
  }

  console.log(`Persisted ${successCount} provider snapshots to data/enrichment`);
}

main().catch((error) => {
  console.error("Failed to export applied enrichment snapshots", error);
  process.exit(1);
});
