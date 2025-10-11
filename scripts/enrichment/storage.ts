import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";

import type {
  EnrichmentProviderSnapshot,
  PersistedProviderEntry,
  PersistedProviderFile,
  PersistedWordData,
} from "@shared/enrichment";

const STORAGE_SCHEMA_VERSION = 1;
const ENRICHMENT_DATA_DIR = path.resolve(process.cwd(), "data", "enrichment");
const PROVIDER_PRIORITY: readonly string[] = [
  "wiktextract",
  "kaikki",
  "mymemory",
  "tatoeba",
  "openthesaurus",
  "openai",
];

function toPosSegment(pos: string | number | null | undefined): string {
  if (!pos) {
    return "unknown";
  }
  return String(pos).toLowerCase();
}

function providerFilePath(providerId: string | number, pos: string | number | null | undefined): string {
  const posSegment = toPosSegment(pos);
  const providerSegment = String(providerId).toLowerCase();
  return path.join(ENRICHMENT_DATA_DIR, posSegment, `${providerSegment}.json`);
}

async function readJsonFile<T>(filePath: string): Promise<T | null> {
  try {
    const raw = await readFile(filePath, "utf8");
    return JSON.parse(raw) as T;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return null;
    }
    throw error;
  }
}

function normaliseProviderFile(
  file: PersistedProviderFile | null,
  snapshot: EnrichmentProviderSnapshot,
): PersistedProviderFile {
  if (!file) {
    return {
      schemaVersion: STORAGE_SCHEMA_VERSION,
      providerId: snapshot.providerId,
      providerLabel: snapshot.providerLabel ?? null,
      pos: snapshot.pos,
      updatedAt: new Date().toISOString(),
      entries: {},
      meta: {
        createdAt: new Date().toISOString(),
      },
    } satisfies PersistedProviderFile;
  }

  const schemaVersion = typeof file.schemaVersion === "number" ? file.schemaVersion : STORAGE_SCHEMA_VERSION;
  const providerId = file.providerId ?? snapshot.providerId;
  const providerLabel = file.providerLabel ?? snapshot.providerLabel ?? null;
  const pos = file.pos ?? snapshot.pos;
  const meta = typeof file.meta === "object" && file.meta !== null ? file.meta : {};

  return {
    schemaVersion,
    providerId,
    providerLabel,
    pos,
    updatedAt: file.updatedAt ?? new Date().toISOString(),
    entries: typeof file.entries === "object" && file.entries !== null ? file.entries : {},
    meta,
  } satisfies PersistedProviderFile;
}

function buildPersistedEntry(snapshot: EnrichmentProviderSnapshot): PersistedProviderEntry {
  const metadata: Record<string, unknown> = {
    trigger: snapshot.trigger,
    mode: snapshot.mode,
    snapshotId: snapshot.id,
    wordId: snapshot.wordId,
    createdAt: snapshot.createdAt,
  };

  if (snapshot.trigger === "apply") {
    metadata.enrichmentMethod = "bulk";
    metadata.appliedAt = snapshot.collectedAt;
  }

  return {
    lemma: snapshot.lemma,
    pos: snapshot.pos,
    providerId: snapshot.providerId,
    providerLabel: snapshot.providerLabel ?? null,
    status: snapshot.status,
    error: snapshot.error ?? null,
    collectedAt: snapshot.collectedAt,
    translations: snapshot.translations ?? null,
    examples: snapshot.examples ?? null,
    synonyms: snapshot.synonyms ?? null,
    englishHints: snapshot.englishHints ?? null,
    verbForms: snapshot.verbForms ?? null,
    rawPayload: snapshot.rawPayload,
    wordId: snapshot.wordId,
    metadata,
  } satisfies PersistedProviderEntry;
}

export async function persistProviderSnapshotToFile(
  snapshot: EnrichmentProviderSnapshot,
): Promise<void> {
  const filePath = providerFilePath(snapshot.providerId, snapshot.pos);
  await mkdir(path.dirname(filePath), { recursive: true });

  const existing = await readJsonFile<PersistedProviderFile>(filePath);
  const payload = normaliseProviderFile(existing, snapshot);

  const key = snapshot.lemma.trim().toLowerCase();
  payload.entries = payload.entries ?? {};
  payload.entries[key] = buildPersistedEntry(snapshot);
  payload.providerLabel = snapshot.providerLabel ?? payload.providerLabel ?? null;
  payload.updatedAt = new Date().toISOString();

  await writeFile(filePath, JSON.stringify(payload, null, 2), "utf8");
}

async function safeReaddir(dirPath: string): Promise<string[]> {
  try {
    const entries = await readdir(dirPath, { withFileTypes: true });
    return entries.filter((entry) => entry.isFile()).map((entry) => entry.name);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return [];
    }
    throw error;
  }
}

async function readProviderFile(dirPath: string, fileName: string): Promise<PersistedProviderFile | null> {
  const filePath = path.join(dirPath, fileName);
  return readJsonFile<PersistedProviderFile>(filePath);
}

function normalisePersistedEntry(
  entry: PersistedProviderEntry,
  file: PersistedProviderFile,
): PersistedProviderEntry {
  const providerId = entry.providerId ?? file.providerId;
  const providerLabel = entry.providerLabel ?? file.providerLabel ?? null;
  const collectedAt = entry.collectedAt ?? file.updatedAt ?? new Date().toISOString();

  const metadata = { ...entry.metadata };
  if (!Object.prototype.hasOwnProperty.call(metadata, "schemaVersion")) {
    metadata.schemaVersion = file.schemaVersion ?? STORAGE_SCHEMA_VERSION;
  }

  return {
    ...entry,
    providerId,
    providerLabel,
    collectedAt,
    metadata,
  } satisfies PersistedProviderEntry;
}

export async function loadPersistedWordData(
  rootDir: string = process.cwd(),
): Promise<PersistedWordData[]> {
  const dataDir = path.resolve(rootDir, "data", "enrichment");
  const results = new Map<string, PersistedWordData>();

  const posEntries = await safeReaddir(dataDir);
  for (const entryName of posEntries) {
    const posDir = path.join(dataDir, entryName.replace(/\.json$/i, ""));
    // If the entry itself is a JSON file (legacy layout), treat it as provider snapshot.
    if (entryName.endsWith(".json")) {
      const file = await readProviderFile(dataDir, entryName);
      if (!file) continue;
      mergeProviderFileIntoResults(results, file);
      continue;
    }
  }

  // After the quick scan above, iterate through subdirectories (per POS).
  const posDirectories = await readdir(dataDir, { withFileTypes: true }).catch((error: unknown) => {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return [];
    }
    throw error;
  });

  for (const dirent of posDirectories) {
    if (!dirent.isDirectory()) {
      continue;
    }
    const posDir = path.join(dataDir, dirent.name);
    const files = await safeReaddir(posDir);
    for (const fileName of files) {
      if (!fileName.endsWith(".json")) {
        continue;
      }
      const file = await readProviderFile(posDir, fileName);
      if (!file) {
        continue;
      }
      mergeProviderFileIntoResults(results, file);
    }
  }

  return Array.from(results.values()).map((record) => ({
    ...record,
    providers: record.providers.sort(compareProviderEntries),
  }));
}

function compareProviderEntries(a: PersistedProviderEntry, b: PersistedProviderEntry): number {
  const rankA = providerPriorityFor(a);
  const rankB = providerPriorityFor(b);
  if (rankA !== rankB) {
    return rankA - rankB;
  }
  const labelA = (a.providerLabel ?? a.providerId ?? "").toString();
  const labelB = (b.providerLabel ?? b.providerId ?? "").toString();
  return labelA.localeCompare(labelB);
}

function providerPriorityFor(entry: PersistedProviderEntry): number {
  const identifier = (entry.providerId ?? "").toString().toLowerCase();
  const index = PROVIDER_PRIORITY.indexOf(identifier);
  return index === -1 ? PROVIDER_PRIORITY.length : index;
}

function mergeProviderFileIntoResults(
  results: Map<string, PersistedWordData>,
  file: PersistedProviderFile,
): void {
  if (!file.entries || typeof file.entries !== "object") {
    return;
  }

  for (const [key, value] of Object.entries(file.entries)) {
    if (!value || typeof value !== "object") {
      continue;
    }
    const lemma = value.lemma ?? key;
    const pos = value.pos ?? file.pos;
    if (!lemma || !pos) {
      continue;
    }
    const mapKey = `${String(lemma).toLowerCase()}::${String(pos).toLowerCase()}`;
    const entry = normalisePersistedEntry(value, file);
    const existing = results.get(mapKey);
    if (!existing) {
      results.set(mapKey, {
        lemma: String(lemma),
        pos: pos,
        providers: [entry],
        updatedAt: entry.collectedAt ?? file.updatedAt ?? new Date().toISOString(),
      });
      continue;
    }
    existing.providers.push(entry);
    existing.updatedAt = mostRecentTimestamp(existing.updatedAt, entry.collectedAt, file.updatedAt);
  }
}

function mostRecentTimestamp(...timestamps: Array<string | null | undefined>): string {
  const valid = timestamps
    .map((value) => (value ? new Date(value).getTime() : 0))
    .filter((value) => Number.isFinite(value) && value > 0);
  if (!valid.length) {
    return new Date().toISOString();
  }
  const max = Math.max(...valid);
  return new Date(max).toISOString();
}
