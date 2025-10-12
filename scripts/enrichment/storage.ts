import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { createClient } from "@supabase/supabase-js";

import type {
  EnrichmentProviderSnapshot,
  PersistedProviderEntry,
  PersistedProviderFile,
  PersistedProviderFileMeta,
  PersistedWordData,
  SupabaseStorageObjectSummary,
  SupabaseStorageSyncFailure,
} from "@shared/enrichment";

type SupabaseClient = ReturnType<typeof createClient>;

type SupabaseStorageListEntry = {
  id: string | null;
  name: string;
  created_at: string | null;
  updated_at: string | null;
  last_accessed_at: string | null;
  metadata: { size?: number } | null;
};

const STORAGE_SCHEMA_VERSION = 1;
const PROVIDER_PRIORITY: readonly string[] = [
  "wiktextract",
  "kaikki",
  "mymemory",
  "tatoeba",
  "openthesaurus",
  "openai",
];

function resolveEnrichmentDataDir(): string {
  return path.resolve(process.cwd(), "data", "enrichment");
}

function toPosSegment(pos: string | number | null | undefined): string {
  if (!pos) {
    return "unknown";
  }
  return String(pos).toLowerCase();
}

function providerFilePath(providerId: string | number, pos: string | number | null | undefined): string {
  const posSegment = toPosSegment(pos);
  const providerSegment = String(providerId).toLowerCase();
  return path.join(resolveEnrichmentDataDir(), posSegment, `${providerSegment}.json`);
}

export class SupabaseStorageNotConfiguredError extends Error {
  constructor() {
    super("Supabase Storage is not configured");
    this.name = "SupabaseStorageNotConfiguredError";
  }
}

export interface SupabaseStorageConfig {
  url: string;
  serviceRoleKey: string;
  bucket: string;
  pathPrefix: string | null;
}

export interface SupabaseStorageListOptions {
  path?: string;
  limit?: number;
  offset?: number;
}

export interface SupabaseStorageListResult {
  config: SupabaseStorageConfig;
  path: string;
  limit: number;
  offset: number;
  items: SupabaseStorageObjectSummary[];
  hasMore: boolean;
}

export interface SupabaseStorageSyncResult {
  config: SupabaseStorageConfig;
  totalFiles: number;
  uploaded: number;
  failed: SupabaseStorageSyncFailure[];
}

export function getSupabaseStorageConfigFromEnv(): SupabaseStorageConfig | null {
  const url = process.env.SUPABASE_URL?.trim();
  const serviceRoleKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() || process.env.SUPABASE_SECRET_KEY?.trim();
  const bucket = process.env.ENRICHMENT_SUPABASE_BUCKET?.trim();
  if (!url || !serviceRoleKey || !bucket) {
    return null;
  }

  const rawPrefix = process.env.ENRICHMENT_SUPABASE_PATH_PREFIX?.trim();
  const pathPrefix = rawPrefix ? rawPrefix.replace(/^\/+|\/+$/g, "") : null;

  return { url, serviceRoleKey, bucket, pathPrefix } satisfies SupabaseStorageConfig;
}

function createSupabaseStorageClient(config: SupabaseStorageConfig): SupabaseClient {
  return createClient(config.url, config.serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

async function uploadProviderFileToSupabase(
  filePath: string,
  fileContents: string,
  clientOverride?: SupabaseClient,
  configOverride?: SupabaseStorageConfig | null,
): Promise<void> {
  const config = configOverride ?? getSupabaseStorageConfigFromEnv();
  if (!config) {
    return;
  }

  const client = clientOverride ?? createSupabaseStorageClient(config);

  const relativePath = path
    .relative(resolveEnrichmentDataDir(), filePath)
    .split(path.sep)
    .filter((segment) => segment.length)
    .join("/");

  const objectPath = config.pathPrefix ? `${config.pathPrefix}/${relativePath}` : relativePath;

  const { error } = await client.storage
    .from(config.bucket)
    .upload(objectPath, Buffer.from(fileContents, "utf8"), {
      contentType: "application/json",
      upsert: true,
    });

  if (error) {
    throw new Error(`Failed to upload provider file to Supabase Storage: ${error.message}`);
  }
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

type ProviderFileMeta = PersistedProviderFileMeta & Record<string, unknown>;

function ensureMeta(meta: PersistedProviderFile["meta"]): ProviderFileMeta {
  if (meta && typeof meta === "object") {
    return { ...meta } as ProviderFileMeta;
  }
  return {};
}

function upgradeProviderFile(file: PersistedProviderFile | null): PersistedProviderFile | null {
  if (!file) return null;

  const currentVersion = typeof file.schemaVersion === "number" ? file.schemaVersion : 0;
  const meta = ensureMeta(file.meta);

  if (currentVersion < STORAGE_SCHEMA_VERSION) {
    const history = new Set<number>(
      Array.isArray(meta.previousSchemaVersions)
        ? meta.previousSchemaVersions.filter((value): value is number => typeof value === "number")
        : [],
    );
    if (Number.isFinite(currentVersion)) {
      history.add(currentVersion);
    }
    meta.previousSchemaVersions = Array.from(history).sort((a, b) => a - b);
    meta.lastUpgradedAt = new Date().toISOString();
  }

  return {
    ...file,
    schemaVersion: STORAGE_SCHEMA_VERSION,
    meta,
  } satisfies PersistedProviderFile;
}

function normaliseProviderFile(
  file: PersistedProviderFile | null,
  snapshot: EnrichmentProviderSnapshot,
): PersistedProviderFile {
  const now = new Date().toISOString();
  if (!file) {
    return {
      schemaVersion: STORAGE_SCHEMA_VERSION,
      providerId: snapshot.providerId,
      providerLabel: snapshot.providerLabel ?? null,
      pos: snapshot.pos,
      updatedAt: now,
      entries: {},
      meta: {
        createdAt: now,
      },
    } satisfies PersistedProviderFile;
  }

  const upgraded = upgradeProviderFile(file) ?? file;
  const providerId = upgraded.providerId ?? snapshot.providerId;
  const providerLabel = upgraded.providerLabel ?? snapshot.providerLabel ?? null;
  const pos = upgraded.pos ?? snapshot.pos;
  const entries =
    typeof upgraded.entries === "object" && upgraded.entries !== null ? upgraded.entries : ({} as PersistedProviderFile["entries"]);
  const meta = ensureMeta(upgraded.meta);
  if (!meta.createdAt) {
    meta.createdAt = now;
  }

  return {
    schemaVersion: STORAGE_SCHEMA_VERSION,
    providerId,
    providerLabel,
    pos,
    updatedAt: upgraded.updatedAt ?? now,
    entries,
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
    nounForms: snapshot.nounForms ?? null,
    adjectiveForms: snapshot.adjectiveForms ?? null,
    prepositionAttributes: snapshot.prepositionAttributes ?? null,
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

  const fileContents = JSON.stringify(payload, null, 2);

  await writeFile(filePath, fileContents, "utf8");
  await uploadProviderFileToSupabase(filePath, fileContents);
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

function normaliseListPath(config: SupabaseStorageConfig, rawPath?: string): string {
  const segments = [config.pathPrefix, rawPath]
    .filter((segment): segment is string => Boolean(segment && segment.trim().length))
    .map((segment) => segment.trim().replace(/^\/+|\/+$/g, ""))
    .filter((segment) => segment.length > 0);
  return segments.join("/");
}

function normaliseOffset(value: number | undefined): number {
  if (!Number.isFinite(value) || (value ?? 0) < 0) {
    return 0;
  }
  return Math.floor(value ?? 0);
}

function normaliseLimit(value: number | undefined, fallback: number): number {
  if (!Number.isFinite(value) || (value ?? 0) <= 0) {
    return fallback;
  }
  return Math.min(Math.floor(value ?? fallback), 1000);
}

export async function listSupabaseBucketObjects(
  options: SupabaseStorageListOptions = {},
): Promise<SupabaseStorageListResult> {
  const config = getSupabaseStorageConfigFromEnv();
  if (!config) {
    throw new SupabaseStorageNotConfiguredError();
  }

  const limit = normaliseLimit(options.limit, 50);
  const offset = normaliseOffset(options.offset);
  const listPath = normaliseListPath(config, options.path);
  const client = createSupabaseStorageClient(config);

  const { data, error } = await client.storage
    .from(config.bucket)
    .list(listPath || undefined, {
      limit,
      offset,
      sortBy: { column: "name", order: "asc" },
    });

  if (error) {
    throw new Error(`Failed to list Supabase Storage bucket: ${error.message}`);
  }

  const items = (data ?? []).map((item: SupabaseStorageListEntry) => {
    const metadata = item.metadata;
    const size = typeof metadata?.size === "number" ? metadata.size : null;
    const type: "file" | "folder" = size === null ? "folder" : "file";
    const pathSuffix = listPath ? `${listPath}/${item.name}` : item.name;
    return {
      id: item.id ?? null,
      name: item.name,
      path: pathSuffix,
      type,
      size,
      createdAt: item.created_at ?? null,
      updatedAt: item.updated_at ?? null,
      lastAccessedAt: item.last_accessed_at ?? null,
    } satisfies SupabaseStorageObjectSummary;
  });

  const hasMore = items.length === limit;

  return {
    config,
    path: listPath,
    limit,
    offset,
    items,
    hasMore,
  } satisfies SupabaseStorageListResult;
}

async function collectProviderFiles(rootDir: string): Promise<string[]> {
  const results: string[] = [];
  const stack = [rootDir];

  while (stack.length > 0) {
    const current = stack.pop();
    if (!current) continue;
    let entries: Array<{ name: string; isFile(): boolean; isDirectory(): boolean }> = [];
    try {
      entries = await readdir(current, { withFileTypes: true });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        continue;
      }
      throw error;
    }

    for (const entry of entries) {
      const entryPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        stack.push(entryPath);
      } else if (entry.isFile() && entry.name.endsWith(".json")) {
        results.push(entryPath);
      }
    }
  }

  return results.sort();
}

export async function syncEnrichmentDirectoryToSupabase(
  rootDir: string = process.cwd(),
): Promise<SupabaseStorageSyncResult> {
  const config = getSupabaseStorageConfigFromEnv();
  if (!config) {
    throw new SupabaseStorageNotConfiguredError();
  }

  const dataDir = path.resolve(rootDir, "data", "enrichment");
  const files = await collectProviderFiles(dataDir);
  if (!files.length) {
    return {
      config,
      totalFiles: 0,
      uploaded: 0,
      failed: [],
    } satisfies SupabaseStorageSyncResult;
  }

  const client = createSupabaseStorageClient(config);
  const failures: SupabaseStorageSyncFailure[] = [];
  let uploaded = 0;

  for (const filePath of files) {
    try {
      const contents = await readFile(filePath, "utf8");
      await uploadProviderFileToSupabase(filePath, contents, client, config);
      uploaded += 1;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      failures.push({
        path: path.relative(dataDir, filePath) || path.basename(filePath),
        error: message,
      });
    }
  }

  return {
    config,
    totalFiles: files.length,
    uploaded,
    failed: failures,
  } satisfies SupabaseStorageSyncResult;
}
