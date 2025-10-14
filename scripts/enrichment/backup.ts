import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { createClient } from "@supabase/supabase-js";
import { asc, sql } from "drizzle-orm";

import { getDb } from "@db/client";
import { words } from "@db/schema";
import type { Word } from "@db/schema";
import type { WordsBackupEntry, WordsBackupFile, WordsBackupSummary } from "@shared/enrichment";
import {
  getSupabaseStorageConfigFromEnv,
  SupabaseStorageNotConfiguredError,
  type SupabaseStorageConfig,
} from "./storage.js";

export interface WriteWordsBackupOptions {
  rootDir?: string;
  fetchWords?: () => Promise<Word[]>;
}

export interface WordsBackupWriteResult {
  summary: WordsBackupSummary;
  filePath: string;
  relativePath: string;
  latestFilePath: string;
  latestRelativePath: string;
  payload: WordsBackupFile;
}

export interface RestoreWordsBackupOptions {
  objectPath?: string;
  truncate?: boolean;
}

export interface WordsRestoreResult {
  summary: WordsBackupSummary;
  objectPath: string;
  truncated: boolean;
  inserted: number;
  sequenceValue: number | null;
}

const WORDS_BACKUP_SCHEMA_VERSION = 2;

const DEFAULT_LATEST_PATH = "words-latest.json";

function serialiseDate(value: Date | string | null | undefined): string | null {
  if (!value) {
    return null;
  }
  if (value instanceof Date) {
    return value.toISOString();
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }
  return parsed.toISOString();
}

function normaliseWordForBackup(word: Word): WordsBackupEntry {
  return {
    id: word.id,
    lemma: word.lemma,
    pos: word.pos,
    level: word.level ?? null,
    english: word.english ?? null,
    exampleDe: word.exampleDe ?? null,
    exampleEn: word.exampleEn ?? null,
    gender: word.gender ?? null,
    plural: word.plural ?? null,
    separable: word.separable ?? null,
    aux: word.aux ?? null,
    praesensIch: word.praesensIch ?? null,
    praesensEr: word.praesensEr ?? null,
    praeteritum: word.praeteritum ?? null,
    partizipIi: word.partizipIi ?? null,
    perfekt: word.perfekt ?? null,
    comparative: word.comparative ?? null,
    superlative: word.superlative ?? null,
    approved: word.approved,
    complete: word.complete,
    sourcesCsv: word.sourcesCsv ?? null,
    sourceNotes: word.sourceNotes ?? null,
    translations: word.translations ?? null,
    examples: word.examples ?? null,
    posAttributes: word.posAttributes ?? null,
    enrichmentAppliedAt: serialiseDate(word.enrichmentAppliedAt ?? null),
    enrichmentMethod: word.enrichmentMethod ?? null,
    createdAt: serialiseDate(word.createdAt ?? null),
    updatedAt: serialiseDate(word.updatedAt ?? null),
  } satisfies WordsBackupEntry;
}

function ensureForwardSlashes(relativePath: string): string {
  return relativePath.split(path.sep).join("/");
}

function buildSummary(
  payload: WordsBackupFile,
  relativePath: string,
  latestRelativePath: string,
  objectPath?: string,
  latestObjectPath?: string,
): WordsBackupSummary {
  return {
    schemaVersion: payload.schemaVersion,
    generatedAt: payload.generatedAt,
    totalWords: payload.total,
    relativePath,
    latestRelativePath,
    objectPath: objectPath ?? relativePath,
    latestObjectPath: latestObjectPath ?? latestRelativePath,
  } satisfies WordsBackupSummary;
}

async function defaultFetchWords(): Promise<Word[]> {
  const database = getDb();
  return database.select().from(words).orderBy(asc(words.id));
}

function buildBackupPayload(wordsList: Word[]): WordsBackupFile {
  const generatedAt = new Date().toISOString();
  const entries = wordsList.map(normaliseWordForBackup);
  return {
    schemaVersion: WORDS_BACKUP_SCHEMA_VERSION,
    generatedAt,
    total: entries.length,
    words: entries,
  } satisfies WordsBackupFile;
}

export async function writeWordsBackupToDisk(
  options: WriteWordsBackupOptions = {},
): Promise<WordsBackupWriteResult> {
  const rootDir = options.rootDir ?? process.cwd();
  const fetchWords = options.fetchWords ?? defaultFetchWords;
  const wordsList = await fetchWords();
  const payload = buildBackupPayload(wordsList);

  const dataDir = path.resolve(rootDir, "data", "enrichment");
  const backupsDir = path.join(dataDir, "backups");
  await mkdir(backupsDir, { recursive: true });

  const timestamp = payload.generatedAt.replace(/[:.]/g, "-");
  const fileName = `words-${timestamp}.json`;
  const filePath = path.join(backupsDir, fileName);
  const latestFilePath = path.join(dataDir, "words-latest.json");

  const serialised = JSON.stringify(payload, null, 2);
  await writeFile(filePath, serialised, "utf8");
  await writeFile(latestFilePath, serialised, "utf8");

  const relativePath = ensureForwardSlashes(path.relative(dataDir, filePath));
  const latestRelativePath = ensureForwardSlashes(path.relative(dataDir, latestFilePath));

  const summary = buildSummary(payload, relativePath, latestRelativePath);

  return {
    summary,
    filePath,
    relativePath,
    latestFilePath,
    latestRelativePath,
    payload,
  } satisfies WordsBackupWriteResult;
}

function ensureLeadingPrefix(config: SupabaseStorageConfig, relativePath: string): string {
  const cleanRelative = ensureForwardSlashes(relativePath).replace(/^\/+/, "");
  if (!config.pathPrefix) {
    return cleanRelative;
  }
  const prefix = config.pathPrefix.replace(/^\/+|\/+$/g, "");
  return `${prefix}/${cleanRelative}`;
}

type WordsBackupEntryWithLegacyApproval = WordsBackupEntry & {
  canonical?: boolean;
};

function normaliseBackupEntry(entry: WordsBackupEntryWithLegacyApproval): WordsBackupEntry {
  if (typeof entry.approved === "boolean") {
    return entry;
  }

  if (typeof entry.canonical === "boolean") {
    const { canonical, ...rest } = entry;
    return {
      ...rest,
      approved: canonical,
    } satisfies WordsBackupEntry;
  }

  throw new Error("Words backup entry is missing approval status");
}

function parseBackupFile(contents: string): WordsBackupFile {
  const parsed = JSON.parse(contents) as WordsBackupFile;
  if (!parsed || typeof parsed !== "object") {
    throw new Error("Invalid words backup payload");
  }
  if (typeof parsed.schemaVersion !== "number") {
    throw new Error("Words backup is missing schema version");
  }
  if (!Array.isArray(parsed.words)) {
    throw new Error("Words backup is missing word entries");
  }
  const words = parsed.words.map((entry) => normaliseBackupEntry(entry));
  return {
    ...parsed,
    words,
  } satisfies WordsBackupFile;
}

export const __internal = {
  parseBackupFile,
  normaliseBackupEntry,
};

function toWordInsert(entry: WordsBackupEntry): typeof words.$inferInsert {
  const convertDate = (value: string | null | undefined): Date | null => {
    if (!value) return null;
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  };

  return {
    id: entry.id,
    lemma: entry.lemma,
    pos: entry.pos,
    level: entry.level ?? null,
    english: entry.english ?? null,
    exampleDe: entry.exampleDe ?? null,
    exampleEn: entry.exampleEn ?? null,
    gender: entry.gender ?? null,
    plural: entry.plural ?? null,
    separable: entry.separable ?? null,
    aux: entry.aux ?? null,
    praesensIch: entry.praesensIch ?? null,
    praesensEr: entry.praesensEr ?? null,
    praeteritum: entry.praeteritum ?? null,
    partizipIi: entry.partizipIi ?? null,
    perfekt: entry.perfekt ?? null,
    comparative: entry.comparative ?? null,
    superlative: entry.superlative ?? null,
    approved: entry.approved,
    complete: entry.complete,
    sourcesCsv: entry.sourcesCsv ?? null,
    sourceNotes: entry.sourceNotes ?? null,
    translations: entry.translations ?? null,
    examples: entry.examples ?? null,
    posAttributes: entry.posAttributes ?? null,
    enrichmentAppliedAt: convertDate(entry.enrichmentAppliedAt),
    enrichmentMethod: entry.enrichmentMethod ?? null,
    createdAt: convertDate(entry.createdAt) ?? new Date(),
    updatedAt: convertDate(entry.updatedAt) ?? new Date(),
  } satisfies typeof words.$inferInsert;
}

export async function restoreWordsBackupFromSupabase(
  options: RestoreWordsBackupOptions = {},
): Promise<WordsRestoreResult> {
  const config = getSupabaseStorageConfigFromEnv();
  if (!config) {
    throw new SupabaseStorageNotConfiguredError();
  }

  const objectPath = ensureLeadingPrefix(config, options.objectPath ?? DEFAULT_LATEST_PATH);
  const client = createClient(config.url, config.serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data, error } = await client.storage.from(config.bucket).download(objectPath);
  if (error || !data) {
    throw new Error(`Failed to download words backup from Supabase Storage: ${error?.message ?? 'Unknown error'}`);
  }

  const contents = await data.text();
  const payload = parseBackupFile(contents);
  const entries = payload.words.map(toWordInsert);
  const ids = entries.map((entry) => entry.id).filter((id): id is number => typeof id === "number");
  const maxId = ids.length ? Math.max(...ids) : null;

  const database = getDb();

  await database.transaction(async (tx) => {
    if (options.truncate !== false) {
      await tx.delete(words);
      await tx.execute(sql`ALTER SEQUENCE words_id_seq RESTART WITH 1`);
    }

    if (entries.length) {
      await tx.insert(words).values(entries);
      if (maxId !== null) {
        await tx.execute(sql`SELECT setval('words_id_seq', ${maxId}, true)`);
      }
    }
  });

  const relativePath = ensureForwardSlashes(options.objectPath ?? DEFAULT_LATEST_PATH);
  const latestRelativePath = ensureForwardSlashes(DEFAULT_LATEST_PATH);
  const summary = buildSummary(
    payload,
    relativePath,
    latestRelativePath,
    objectPath,
    ensureLeadingPrefix(config, DEFAULT_LATEST_PATH),
  );

  return {
    summary,
    objectPath,
    truncated: options.truncate !== false,
    inserted: entries.length,
    sequenceValue: maxId,
  } satisfies WordsRestoreResult;
}

export { buildBackupPayload };
