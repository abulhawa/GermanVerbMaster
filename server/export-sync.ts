import { promises as fs } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  db,
  words,
  enrichmentProviderSnapshots,
  type Word,
} from "@db";
import {
  EXPORT_SCHEMA_VERSION,
  type ExportExample,
  type ExportManifest,
  type ExportManifestEntry,
  type ExportOperation,
  type ExportWordPayload,
} from "@shared";
import {
  makeDedupKey,
  normaliseText,
} from "@shared";
import type { WordExample, WordTranslation } from "@shared";
import {
  and,
  asc,
  count,
  eq,
  inArray,
  lt,
  or,
  sql,
} from "drizzle-orm";

interface ExportWordOptions {
  op?: ExportOperation;
  now?: Date;
  localDir?: string | null;
}

interface SnapshotFragment {
  translations: WordTranslation[] | null;
  examples: WordExample[] | null;
}

interface ExportResult {
  payload: ExportWordPayload;
  wroteLocal: boolean;
}

interface BulkExportParams {
  pos?: string | null;
  limit: number;
  localDir?: string | null;
}

interface BulkExportResult {
  attempted: number;
  succeeded: number;
  failed: number;
  errors: Array<{ wordId: number; message: string }>;
}

interface ExportStatusSummary {
  totalDirty: number;
  oldestDirtyUpdatedAt: string | null;
  perPos: Record<string, { count: number; oldestUpdatedAt: string | null }>;
}

const __dirname = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(__dirname, "..");
const defaultLocalDir = resolve(repositoryRoot, "data", "sync");

function resolveLocalDirectory(provided?: string | null): string | null {
  if (provided === "") {
    return null;
  }
  if (typeof provided === "string" && provided.trim().length > 0) {
    return resolve(provided);
  }
  return defaultLocalDir;
}

function formatPosSlug(pos: string): string {
  const slug = pos.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  return slug.length ? slug : "pos";
}

async function ensureDirectory(path: string): Promise<void> {
  await fs.mkdir(path, { recursive: true });
}

function toIsoTimestamp(value: Date | string): string {
  if (value instanceof Date) {
    return value.toISOString();
  }
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? new Date().toISOString() : parsed.toISOString();
}

function normaliseLanguage(language: string | null | undefined): string {
  const normalised = normaliseText(language);
  return normalised ? normalised.toLowerCase() : "en";
}

function upsertTranslation(
  map: Map<string, { value: string; confidence: number | null }>,
  language: string | null | undefined,
  value: string | null | undefined,
  confidence: number | null | undefined,
): void {
  const normalisedValue = normaliseText(value);
  if (!normalisedValue) {
    return;
  }

  const lang = normaliseLanguage(language);
  const existing = map.get(lang);
  const incomingConfidence = typeof confidence === "number" && Number.isFinite(confidence)
    ? confidence
    : null;

  if (!existing) {
    map.set(lang, { value: normalisedValue, confidence: incomingConfidence });
    return;
  }

  if (existing.confidence === null && incomingConfidence === null) {
    // prefer lexicographically smaller translation to stabilise output
    if (normalisedValue.localeCompare(existing.value, undefined, { sensitivity: "base" }) < 0) {
      existing.value = normalisedValue;
    }
    return;
  }

  if (existing.confidence === null) {
    existing.value = normalisedValue;
    existing.confidence = incomingConfidence;
    return;
  }

  if (incomingConfidence !== null && incomingConfidence >= existing.confidence) {
    existing.value = normalisedValue;
    existing.confidence = incomingConfidence;
  }
}

function combineTranslations(
  word: Word,
  snapshots: SnapshotFragment[],
): Record<string, string> {
  const map = new Map<string, { value: string; confidence: number | null }>();

  upsertTranslation(map, "en", word.english, null);

  for (const entry of word.translations ?? []) {
    upsertTranslation(map, entry.language, entry.value, entry.confidence ?? null);
  }

  for (const snapshot of snapshots) {
    for (const entry of snapshot.translations ?? []) {
      upsertTranslation(map, entry.language, entry.value, entry.confidence ?? null);
    }
  }

  const languages = Array.from(map.keys()).sort((a, b) => a.localeCompare(b));
  const record: Record<string, string> = {};
  for (const language of languages) {
    record[language] = map.get(language)!.value;
  }
  return record;
}

interface ExampleCandidate {
  id?: string | null;
  sentence: Record<string, string>;
  translations: Record<string, string>;
  source?: string | null;
  approved: boolean;
}

function normaliseExampleCandidate(
  candidate: ExampleCandidate,
): ExportExample | null {
  const sentenceEntries = Object.entries(candidate.sentence)
    .map(([language, value]) => [language, normaliseText(value)] as const)
    .filter(([, value]) => Boolean(value)) as Array<[string, string]>;
  const translationEntries = Object.entries(candidate.translations)
    .map(([language, value]) => [language, normaliseText(value)] as const)
    .filter(([, value]) => Boolean(value)) as Array<[string, string]>;

  const sentence = Object.fromEntries(sentenceEntries);
  const translations = Object.fromEntries(translationEntries);

  const sentenceDe = sentence.de ?? null;
  if (!sentenceDe) {
    return null;
  }

  return {
    sentence,
    translations,
    source: candidate.source ?? null,
    approved: candidate.approved,
  };
}

function buildExampleCandidates(
  word: Word,
  snapshots: SnapshotFragment[],
): ExampleCandidate[] {
  const candidates: ExampleCandidate[] = [];

  if (word.exampleDe || word.exampleEn) {
    candidates.push({
      sentence: { de: word.exampleDe ?? "" },
      translations: word.exampleEn ? { en: word.exampleEn } : {},
      source: null,
      approved: word.approved,
    });
  }

  for (const entry of word.examples ?? []) {
    candidates.push({
      sentence: { de: entry.exampleDe ?? "" },
      translations: entry.exampleEn ? { en: entry.exampleEn } : {},
      source: entry.source ?? null,
      approved: word.approved,
    });
  }

  for (const snapshot of snapshots) {
    for (const entry of snapshot.examples ?? []) {
      const source = entry.source ?? null;
      candidates.push({
        id: (entry as { id?: string | null }).id ?? null,
        sentence: { de: entry.exampleDe ?? "" },
        translations: entry.exampleEn ? { en: entry.exampleEn } : {},
        source,
        approved: word.approved,
      });
    }
  }

  return candidates;
}

function combineExamples(
  word: Word,
  snapshots: SnapshotFragment[],
): ExportExample[] {
  const candidates = buildExampleCandidates(word, snapshots);
  const map = new Map<string, ExportExample>();

  for (const candidate of candidates) {
    const normalised = normaliseExampleCandidate(candidate);
    if (!normalised) {
      continue;
    }

    const key = candidate.id
      ? candidate.id
      : makeDedupKey(
        normalised.sentence.de,
        ...Object.entries(normalised.translations).flatMap(([language, value]) => [language, value]),
      );

    const existing = map.get(key);
    if (!existing) {
      map.set(key, normalised);
      continue;
    }

    // Merge missing translations/sources
    for (const [language, value] of Object.entries(normalised.translations)) {
      if (!existing.translations[language]) {
        existing.translations[language] = value;
      }
    }
    for (const [language, value] of Object.entries(normalised.sentence)) {
      if (!existing.sentence[language]) {
        existing.sentence[language] = value;
      }
    }
    if (!existing.source && normalised.source) {
      existing.source = normalised.source;
    }
    existing.approved = existing.approved && normalised.approved;
  }

  const entries = Array.from(map.values());
  entries.sort((a, b) => {
    const sentenceCompare = a.sentence.de.localeCompare(b.sentence.de, undefined, {
      sensitivity: "base",
    });
    if (sentenceCompare !== 0) {
      return sentenceCompare;
    }
    const aTranslation = a.translations.en ?? Object.values(a.translations)[0] ?? "";
    const bTranslation = b.translations.en ?? Object.values(b.translations)[0] ?? "";
    return aTranslation.localeCompare(bTranslation, undefined, { sensitivity: "base" });
  });
  return entries;
}

function buildForms(word: Word): Record<string, unknown> {
  const forms: Record<string, unknown> = {};

  if (word.posAttributes) {
    forms.attributes = word.posAttributes;
  }

  switch (word.pos) {
    case "V":
      if (word.praesensIch) forms.praesensIch = word.praesensIch;
      if (word.praesensEr) forms.praesensEr = word.praesensEr;
      if (word.praeteritum) forms.praeteritum = word.praeteritum;
      if (word.partizipIi) forms.partizipIi = word.partizipIi;
      if (word.perfekt) forms.perfekt = word.perfekt;
      if (word.separable !== null && word.separable !== undefined) {
        forms.separable = word.separable;
      }
      if (word.aux) {
        forms.auxiliary = word.aux;
      }
      break;
    case "N":
      if (word.gender) forms.gender = word.gender;
      if (word.plural) forms.plural = word.plural;
      break;
    case "Adj":
      if (word.comparative) forms.comparative = word.comparative;
      if (word.superlative) forms.superlative = word.superlative;
      break;
    default:
      break;
  }

  return forms;
}

async function loadSnapshotFragments(wordIds: number[]): Promise<Map<number, SnapshotFragment[]>> {
  if (!wordIds.length) {
    return new Map();
  }

  const rows = await db
    .select({
      wordId: enrichmentProviderSnapshots.wordId,
      translations: enrichmentProviderSnapshots.translations,
      examples: enrichmentProviderSnapshots.examples,
    })
    .from(enrichmentProviderSnapshots)
    .where(inArray(enrichmentProviderSnapshots.wordId, wordIds));

  const map = new Map<number, SnapshotFragment[]>();
  for (const row of rows) {
    const current = map.get(row.wordId) ?? [];
    current.push({ translations: row.translations, examples: row.examples });
    map.set(row.wordId, current);
  }
  return map;
}

async function appendJsonlLine(filePath: string, payload: ExportWordPayload): Promise<void> {
  await ensureDirectory(dirname(filePath));
  const handle = await fs.open(filePath, "a");
  try {
    await handle.write(`${JSON.stringify(payload)}\n`);
    await handle.sync();
  } finally {
    await handle.close();
  }
}

async function loadManifest(path: string): Promise<ExportManifest> {
  try {
    const raw = await fs.readFile(path, "utf8");
    const parsed = JSON.parse(raw) as ExportManifest;
    if (!parsed.schema) {
      parsed.schema = EXPORT_SCHEMA_VERSION;
    }
    return parsed;
  } catch (error: unknown) {
    if ((error as NodeJS.ErrnoException)?.code === "ENOENT") {
      const now = new Date().toISOString();
      return {
        schema: EXPORT_SCHEMA_VERSION,
        version: "local-dev",
        generatedAt: now,
        entries: {},
      };
    }
    throw error;
  }
}

async function persistManifest(path: string, manifest: ExportManifest): Promise<void> {
  await ensureDirectory(dirname(path));
  const enriched = {
    ...manifest,
    schema: EXPORT_SCHEMA_VERSION,
    generatedAt: new Date().toISOString(),
  } satisfies ExportManifest;
  await fs.writeFile(path, `${JSON.stringify(enriched, null, 2)}\n`, "utf8");
}

async function updateManifestEntry(
  manifestPath: string,
  pos: string,
  updatesFile: string,
  lastUpdateAt: Date,
): Promise<void> {
  const manifest = await loadManifest(manifestPath);
  const existingEntry: ExportManifestEntry | undefined = manifest.entries[pos];
  const entry: ExportManifestEntry = existingEntry
    ? { ...existingEntry }
    : {
      pos,
      snapshot: null,
      updates: null,
      snapshotGeneratedAt: null,
      lastUpdateAt: null,
    };

  entry.pos = pos;
  entry.updates = updatesFile;
  entry.lastUpdateAt = toIsoTimestamp(lastUpdateAt);

  manifest.entries[pos] = entry;
  await persistManifest(manifestPath, manifest);
}

function buildExportPayload(
  word: Word,
  snapshots: SnapshotFragment[],
  op: ExportOperation | undefined,
): ExportWordPayload {
  const forms = buildForms(word);
  const translations = combineTranslations(word, snapshots);
  const examples = combineExamples(word, snapshots);

  const updatedAt = word.updatedAt instanceof Date ? word.updatedAt : new Date(word.updatedAt);

  return {
    schema: EXPORT_SCHEMA_VERSION,
    wordId: word.exportUid,
    lemma: word.lemma,
    pos: word.pos,
    level: word.level ?? null,
    approved: word.approved,
    complete: word.complete,
    lastUpdated: updatedAt.toISOString(),
    forms,
    translations,
    examples,
    op,
  } satisfies ExportWordPayload;
}

async function exportWord(
  word: Word,
  snapshots: SnapshotFragment[],
  options: ExportWordOptions,
): Promise<ExportResult> {
  const now = options.now ?? new Date();
  const op = options.op ?? "upsert";
  const payload = buildExportPayload(word, snapshots, op);

  let wroteLocal = false;
  const localDir = resolveLocalDirectory(options.localDir ?? process.env.JSONL_LOCAL_DIR ?? null);
  if (localDir) {
    const posSlug = formatPosSlug(word.pos);
    const updatesFile = join(localDir, `${posSlug}.updates.jsonl`);
    await appendJsonlLine(updatesFile, payload);
    const manifestPath = join(localDir, "manifest.json");
    await updateManifestEntry(manifestPath, word.pos, `./${posSlug}.updates.jsonl`, now);
    wroteLocal = true;
  }

  return { payload, wroteLocal };
}

async function fetchWordForExport(tx: any, wordId: number): Promise<Word | null> {
  const rows = await tx
    .select()
    .from(words)
    .where(eq(words.id, wordId))
    .limit(1);
  return rows[0] ?? null;
}

export async function exportWordById(wordId: number, options: ExportWordOptions = {}): Promise<ExportResult> {
  return db.transaction(async (tx) => {
    const word = await fetchWordForExport(tx, wordId);
    if (!word) {
      throw new Error(`Word ${wordId} not found`);
    }

    const snapshotMap = await loadSnapshotFragments([word.id]);
    const result = await exportWord(word, snapshotMap.get(word.id) ?? [], options);

    await tx
      .update(words)
      .set({ exportedAt: sql`now()` })
      .where(eq(words.id, word.id));

    return result;
  });
}

const dirtyCondition = or(sql`${words.exportedAt} IS NULL`, lt(words.exportedAt, words.updatedAt));

export async function runBulkExport({ pos, limit, localDir }: BulkExportParams): Promise<BulkExportResult> {
  const conditions = [dirtyCondition];
  if (pos) {
    conditions.push(eq(words.pos, pos));
  }

  const whereClause = conditions.length === 1 ? conditions[0]! : and(...conditions);

  const rows = await db
    .select({ id: words.id })
    .from(words)
    .where(whereClause)
    .orderBy(asc(words.updatedAt))
    .limit(limit);

  const wordIds = rows.map((row) => row.id);
  const snapshotMap = await loadSnapshotFragments(wordIds);
  let succeeded = 0;
  const errors: Array<{ wordId: number; message: string }> = [];

  for (const id of wordIds) {
    try {
      await db.transaction(async (tx) => {
        const word = await fetchWordForExport(tx, id);
        if (!word) {
          throw new Error("Word not found");
        }
        await exportWord(word, snapshotMap.get(id) ?? [], { localDir });
        await tx
          .update(words)
          .set({ exportedAt: sql`now()` })
          .where(eq(words.id, id));
      });
      succeeded += 1;
    } catch (error: unknown) {
      errors.push({ wordId: id, message: (error as Error).message });
    }
  }

  return {
    attempted: wordIds.length,
    succeeded,
    failed: errors.length,
    errors,
  } satisfies BulkExportResult;
}

export async function getExportStatus(): Promise<ExportStatusSummary> {
  const totalRow = await db
    .select({ value: count() })
    .from(words)
    .where(dirtyCondition);
  const totalDirty = totalRow[0]?.value ?? 0;

  const oldestRow = await db
    .select({ value: words.updatedAt })
    .from(words)
    .where(dirtyCondition)
    .orderBy(asc(words.updatedAt))
    .limit(1);
  const oldestDirtyUpdatedAt = oldestRow[0]?.value ? toIsoTimestamp(oldestRow[0]!.value as unknown as Date) : null;

  const perPosRows = await db
    .select({
      pos: words.pos,
      count: count(),
      oldest: sql`min(${words.updatedAt})`,
    })
    .from(words)
    .where(dirtyCondition)
    .groupBy(words.pos);

  const perPos: Record<string, { count: number; oldestUpdatedAt: string | null }> = {};
  for (const row of perPosRows) {
    const oldest = row.oldest as Date | string | null | undefined;
    perPos[row.pos] = {
      count: Number(row.count) || 0,
      oldestUpdatedAt: oldest ? toIsoTimestamp(oldest) : null,
    };
  }

  return { totalDirty, oldestDirtyUpdatedAt, perPos } satisfies ExportStatusSummary;
}

export function buildExportPayloadForWord(
  word: Word,
  snapshots: SnapshotFragment[],
  op?: ExportOperation,
): ExportWordPayload {
  return buildExportPayload(word, snapshots, op);
}

export type { BulkExportResult, ExportResult, ExportStatusSummary, SnapshotFragment };
export { formatPosSlug, loadSnapshotFragments, resolveLocalDirectory };
