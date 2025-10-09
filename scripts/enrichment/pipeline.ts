import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { db } from "@db";
import { words } from "@db/schema";
import { and, eq } from "drizzle-orm";

import {
  delay,
  lookupAiAssistance,
  lookupExampleSentence,
  lookupOpenThesaurusSynonyms,
  lookupTranslation,
  lookupWiktionarySummary,
  type ExampleLookup,
  type SynonymLookup,
  type TranslationLookup,
  type WiktionaryLookup,
} from "./providers";

type WordRecord = typeof words.$inferSelect;

type WordPatch = Partial<
  Pick<WordRecord, "english" | "exampleDe" | "exampleEn" | "sourcesCsv" | "complete" | "updatedAt">
>;

type FieldUpdate = {
  field: keyof WordPatch;
  previous: unknown;
  next: unknown;
  source?: string;
};

interface FieldCandidate {
  value: string;
  source: string;
  confidence?: number;
}

interface ExampleCandidate {
  exampleDe?: string;
  exampleEn?: string;
  source: string;
}

interface SuggestionBundle {
  translations: FieldCandidate[];
  synonyms: string[];
  englishHints: string[];
  wiktionarySummary?: string;
  examples: ExampleCandidate[];
  errors: string[];
  sources: string[];
  aiUsed: boolean;
}

export interface PipelineWordSummary {
  id: number;
  lemma: string;
  pos: string;
  missingFields: string[];
  translation?: FieldCandidate;
  englishHints?: string[];
  synonyms: string[];
  wiktionarySummary?: string;
  example?: ExampleCandidate;
  updates: FieldUpdate[];
  applied: boolean;
  sources: string[];
  errors?: string[];
  aiUsed: boolean;
}

export interface PipelineConfig {
  limit: number;
  mode: "non-canonical" | "canonical" | "all";
  onlyIncomplete: boolean;
  dryRun: boolean;
  apply: boolean;
  backup: boolean;
  delayMs: number;
  outputDir: string;
  reportFile?: string;
  emitReport: boolean;
  backupDir: string;
  enableAi: boolean;
  openAiModel: string;
  allowOverwrite: boolean;
  collectSynonyms: boolean;
  collectExamples: boolean;
}

export interface PipelineRun {
  config: PipelineConfig;
  scanned: number;
  updated: number;
  applied: number;
  reportPath?: string;
  backupPath?: string;
  words: PipelineWordSummary[];
}

const DEFAULT_LIMIT = 50;
const DEFAULT_DELAY_MS = 400;
const DEFAULT_OUTPUT_DIR = path.resolve(process.cwd(), "data", "generated", "enrichment");
const DEFAULT_BACKUP_DIR = path.resolve(process.cwd(), "data", "generated", "backups");
const DEFAULT_OPENAI_MODEL = "gpt-4o-mini";

export function resolveConfigFromEnv(overrides: Partial<PipelineConfig> = {}): PipelineConfig {
  const envLimit = parsePositiveInt(process.env.LIMIT, DEFAULT_LIMIT);
  const envDelay = parsePositiveInt(process.env.DELAY_MS, DEFAULT_DELAY_MS);
  const envMode = normaliseMode(process.env.CANONICAL_MODE);
  const envOnlyIncomplete = parseBoolean(process.env.ONLY_INCOMPLETE, true);
  const envApply = parseBoolean(process.env.APPLY_UPDATES, false);
  const envDryRun = parseBoolean(process.env.DRY_RUN, !envApply);
  const envBackup = parseBoolean(process.env.ENABLE_BACKUP, true);
  const envEmitReport = parseBoolean(process.env.EMIT_REPORT, true);
  const envEnableAi = parseBoolean(process.env.ENABLE_AI, false);
  const envAllowOverwrite = parseBoolean(process.env.OVERWRITE_EXISTING, false);
  const envCollectSynonyms = parseBoolean(process.env.COLLECT_SYNONYMS, true);
  const envCollectExamples = parseBoolean(process.env.COLLECT_EXAMPLES, true);

  const apply = overrides.apply ?? envApply;
  const dryRunEnv = overrides.dryRun ?? envDryRun;
  const dryRun = apply ? false : dryRunEnv;

  const outputDir = overrides.outputDir
    ?? (process.env.OUTPUT_DIR ? path.resolve(process.env.OUTPUT_DIR) : DEFAULT_OUTPUT_DIR);
  const backupDir = overrides.backupDir
    ?? (process.env.BACKUP_DIR ? path.resolve(process.env.BACKUP_DIR) : DEFAULT_BACKUP_DIR);
  const openAiModel = overrides.openAiModel ?? process.env.OPENAI_MODEL?.trim() ?? DEFAULT_OPENAI_MODEL;
  const emitReport = overrides.emitReport ?? envEmitReport;

  return {
    limit: overrides.limit ?? envLimit,
    mode: overrides.mode ?? envMode,
    onlyIncomplete: overrides.onlyIncomplete ?? envOnlyIncomplete,
    dryRun,
    apply,
    backup: overrides.backup ?? envBackup,
    delayMs: overrides.delayMs ?? envDelay,
    outputDir,
    reportFile: overrides.reportFile ?? process.env.REPORT_FILE?.trim(),
    emitReport,
    backupDir,
    enableAi: overrides.enableAi ?? envEnableAi,
    openAiModel,
    allowOverwrite: overrides.allowOverwrite ?? envAllowOverwrite,
    collectSynonyms: overrides.collectSynonyms ?? envCollectSynonyms,
    collectExamples: overrides.collectExamples ?? envCollectExamples,
  } satisfies PipelineConfig;
}

export async function runEnrichment(config: PipelineConfig): Promise<PipelineRun> {
  const shouldApply = config.apply && !config.dryRun;
  const whereClause = buildWhereClause(config);

  const baseQuery = db.select().from(words);
  const filteredQuery = whereClause ? baseQuery.where(whereClause) : baseQuery;
  const finalQuery = config.limit > 0 ? filteredQuery.limit(config.limit) : filteredQuery;

  const targets = await finalQuery;
  if (!targets.length) {
    return {
      config,
      scanned: 0,
      updated: 0,
      applied: 0,
      reportPath: undefined,
      backupPath: undefined,
      words: [],
    };
  }

  let backupPath: string | undefined;
  if (shouldApply && config.backup) {
    backupPath = await createBackup(targets, config.backupDir);
  }

  await mkdir(config.outputDir, { recursive: true });

  const openAiKey = config.enableAi ? process.env.OPENAI_API_KEY : undefined;
  if (config.enableAi && !openAiKey) {
    console.warn("ENABLE_AI was set but OPENAI_API_KEY is missing. AI assistance will be skipped.");
  }

  const results: PipelineWordSummary[] = [];
  const updatesToApply: Array<{ word: WordRecord; patch: WordPatch }> = [];

  for (const word of targets) {
    console.log(`Enriching ${word.lemma} (${word.pos}) [id=${word.id}]...`);
    const missingFields = detectMissingFields(word);

    const suggestions = await collectSuggestions(word, config, openAiKey);
    const { patch, updates, translationCandidate, exampleCandidate } = determineUpdates(word, suggestions, config);
    const hasUpdates = Object.keys(patch).some((key) => key !== "updatedAt");

    const summary: PipelineWordSummary = {
      id: word.id,
      lemma: word.lemma,
      pos: word.pos,
      missingFields,
      translation: translationCandidate,
      englishHints: suggestions.englishHints.length ? suggestions.englishHints : undefined,
      synonyms: suggestions.synonyms,
      wiktionarySummary: suggestions.wiktionarySummary,
      example: exampleCandidate,
      updates,
      applied: shouldApply && hasUpdates,
      sources: suggestions.sources,
      errors: suggestions.errors.length ? suggestions.errors : undefined,
      aiUsed: suggestions.aiUsed,
    };

    results.push(summary);

    if (shouldApply && hasUpdates) {
      updatesToApply.push({ word, patch });
    }

    if (config.delayMs > 0) {
      await delay(config.delayMs);
    }
  }

  let appliedCount = 0;
  if (shouldApply && updatesToApply.length) {
    await db.transaction(async (tx) => {
      for (const entry of updatesToApply) {
        await tx.update(words).set(entry.patch).where(eq(words.id, entry.word.id));
        appliedCount += 1;
      }
    });
  }

  const updatedCount = results.filter((result) => result.updates.length > 0).length;

  const reportPayload = {
    generatedAt: new Date().toISOString(),
    config: {
      ...config,
      outputDir: undefined,
      backupDir: undefined,
    },
    totals: {
      scanned: targets.length,
      proposedUpdates: updatedCount,
      applied: appliedCount,
    },
    words: results,
  };

  let reportPath: string | undefined;
  if (config.emitReport) {
    reportPath = config.reportFile
      ? path.resolve(config.reportFile)
      : path.join(config.outputDir, `report-${Date.now()}.json`);
    await writeFile(reportPath, JSON.stringify(reportPayload, null, 2), "utf8");
  }

  return {
    config,
    scanned: targets.length,
    updated: updatedCount,
    applied: appliedCount,
    reportPath,
    backupPath,
    words: results,
  };
}

function parsePositiveInt(value: string | undefined, fallback: number): number {
  if (!value) return fallback;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function parseBoolean(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined) return fallback;
  const normalised = value.trim().toLowerCase();
  if (["1", "true", "yes", "y"].includes(normalised)) return true;
  if (["0", "false", "no", "n"].includes(normalised)) return false;
  return fallback;
}

function normaliseMode(value: string | undefined): PipelineConfig["mode"] {
  switch (value?.trim().toLowerCase()) {
    case "canonical":
      return "canonical";
    case "all":
      return "all";
    default:
      return "non-canonical";
  }
}

function buildWhereClause(config: PipelineConfig) {
  const canonicalClause =
    config.mode === "canonical"
      ? eq(words.canonical, true)
      : config.mode === "non-canonical"
        ? eq(words.canonical, false)
        : undefined;

  const completenessClause = config.onlyIncomplete ? eq(words.complete, false) : undefined;

  if (canonicalClause && completenessClause) {
    return and(canonicalClause, completenessClause);
  }
  return canonicalClause ?? completenessClause;
}

function detectMissingFields(word: WordRecord): string[] {
  const missing: string[] = [];
  if (isBlank(word.english)) missing.push("english");
  if (isBlank(word.exampleDe)) missing.push("exampleDe");
  if (isBlank(word.exampleEn)) missing.push("exampleEn");
  if (word.pos === "N" && isBlank(word.gender)) missing.push("gender");
  if (word.pos === "N" && isBlank(word.plural)) missing.push("plural");
  if (word.pos === "V" && isBlank(word.praeteritum)) missing.push("praeteritum");
  if (word.pos === "V" && isBlank(word.partizipIi)) missing.push("partizipIi");
  if (word.pos === "V" && isBlank(word.perfekt)) missing.push("perfekt");
  if (word.pos === "Adj" && isBlank(word.comparative)) missing.push("comparative");
  if (word.pos === "Adj" && isBlank(word.superlative)) missing.push("superlative");
  return missing;
}

function isBlank(value: string | null | undefined): boolean {
  return value === undefined || value === null || !value.trim();
}

async function collectSuggestions(
  word: WordRecord,
  config: PipelineConfig,
  openAiKey: string | undefined,
): Promise<SuggestionBundle> {
  const sources = new Set<string>();
  const errors: string[] = [];
  const translations: FieldCandidate[] = [];
  const examples: ExampleCandidate[] = [];
  let synonyms: string[] = [];
  let englishHints: string[] = [];
  let wiktionarySummary: string | undefined;

  const tasks = await Promise.allSettled([
    lookupWiktionarySummary(word.lemma),
    config.collectSynonyms ? lookupOpenThesaurusSynonyms(word.lemma) : Promise.resolve<SynonymLookup | null>(null),
    lookupTranslation(word.lemma),
    config.collectExamples ? lookupExampleSentence(word.lemma) : Promise.resolve<ExampleLookup | null>(null),
  ]);

  const [wiktionaryResult, synonymsResult, translationResult, exampleResult] = tasks as [
    PromiseSettledResult<WiktionaryLookup | null>,
    PromiseSettledResult<SynonymLookup | null>,
    PromiseSettledResult<TranslationLookup | null>,
    PromiseSettledResult<ExampleLookup | null>,
  ];

  if (wiktionaryResult.status === "fulfilled") {
    const value = wiktionaryResult.value;
    if (value) {
      wiktionarySummary = value.summary;
      englishHints = value.englishHints;
      if (value.summary || value.englishHints.length) {
        sources.add("de.wiktionary.org");
      }
    }
  } else {
    errors.push(formatError("Wiktionary", wiktionaryResult.reason));
  }

  if (synonymsResult.status === "fulfilled") {
    const value = synonymsResult.value;
    if (value?.synonyms.length) {
      synonyms = value.synonyms;
      sources.add("openthesaurus.de");
    }
  } else {
    errors.push(formatError("OpenThesaurus", synonymsResult.reason));
  }

  if (translationResult.status === "fulfilled") {
    const value = translationResult.value;
    if (value?.translation) {
      translations.push({
        value: value.translation,
        source: value.source,
        confidence: value.confidence,
      });
      sources.add(value.source);
    }
  } else {
    errors.push(formatError("MyMemory", translationResult.reason));
  }

  if (exampleResult.status === "fulfilled") {
    const value = exampleResult.value;
    if (value && (value.exampleDe || value.exampleEn)) {
      examples.push({
        exampleDe: value.exampleDe,
        exampleEn: value.exampleEn,
        source: value.source,
      });
      sources.add(value.source);
    }
  } else {
    errors.push(formatError("Tatoeba", exampleResult.reason));
  }

  let aiUsed = false;
  if (config.enableAi && openAiKey) {
    try {
      const aiResult = await lookupAiAssistance(word.lemma, word.pos, openAiKey, config.openAiModel);
      if (aiResult) {
        aiUsed = true;
        if (aiResult.translation) {
          translations.push({ value: aiResult.translation, source: aiResult.source });
          sources.add(aiResult.source);
        }
        if (aiResult.exampleDe || aiResult.exampleEn) {
          examples.push({
            exampleDe: aiResult.exampleDe,
            exampleEn: aiResult.exampleEn,
            source: aiResult.source,
          });
          sources.add(aiResult.source);
        }
      }
    } catch (error) {
      errors.push(formatError("OpenAI", error));
    }
  }

  return {
    translations,
    synonyms,
    englishHints,
    wiktionarySummary,
    examples,
    errors,
    sources: Array.from(sources).sort(),
    aiUsed,
  };
}

function determineUpdates(
  word: WordRecord,
  suggestions: SuggestionBundle,
  config: PipelineConfig,
): {
  patch: WordPatch;
  updates: FieldUpdate[];
  translationCandidate?: FieldCandidate;
  exampleCandidate?: ExampleCandidate;
} {
  const patch: WordPatch = {};
  const updates: FieldUpdate[] = [];

  const translationCandidate = suggestions.translations.find((candidate) => candidate.value.trim());
  if (
    translationCandidate &&
    (config.allowOverwrite || isBlank(word.english)) &&
    !isBlank(translationCandidate.value)
  ) {
    patch.english = translationCandidate.value;
    updates.push({
      field: "english",
      previous: word.english,
      next: translationCandidate.value,
      source: translationCandidate.source,
    });
  }

  const exampleCandidate = pickExampleCandidate(suggestions.examples);
  if (
    exampleCandidate?.exampleDe &&
    (config.allowOverwrite || isBlank(word.exampleDe)) &&
    !isBlank(exampleCandidate.exampleDe)
  ) {
    patch.exampleDe = exampleCandidate.exampleDe;
    updates.push({
      field: "exampleDe",
      previous: word.exampleDe,
      next: exampleCandidate.exampleDe,
      source: exampleCandidate.source,
    });
  }
  if (
    exampleCandidate?.exampleEn &&
    (config.allowOverwrite || isBlank(word.exampleEn)) &&
    !isBlank(exampleCandidate.exampleEn)
  ) {
    patch.exampleEn = exampleCandidate.exampleEn;
    updates.push({
      field: "exampleEn",
      previous: word.exampleEn,
      next: exampleCandidate.exampleEn,
      source: exampleCandidate.source,
    });
  }

  const mergedSources = mergeSourcesCsv(word.sourcesCsv, suggestions.sources);
  if (mergedSources !== word.sourcesCsv) {
    patch.sourcesCsv = mergedSources;
    updates.push({
      field: "sourcesCsv",
      previous: word.sourcesCsv,
      next: mergedSources,
    });
  }

  const nextComplete = computeCompleteness(word, patch);
  if (nextComplete !== word.complete) {
    patch.complete = nextComplete;
    updates.push({
      field: "complete",
      previous: word.complete,
      next: nextComplete,
    });
  }

  if (updates.length > 0) {
    patch.updatedAt = new Date();
  }

  return { patch, updates, translationCandidate, exampleCandidate };
}

function pickExampleCandidate(examples: ExampleCandidate[]): ExampleCandidate | undefined {
  return (
    examples.find((example) => example.exampleDe && example.exampleEn) ??
    examples.find((example) => example.exampleDe) ??
    examples.find((example) => example.exampleEn)
  );
}

function mergeSourcesCsv(existing: string | null | undefined, additions: string[]): string | null {
  const set = new Set<string>();
  for (const value of (existing ?? "").split(/[,;]/)) {
    const trimmed = value.trim();
    if (trimmed) set.add(trimmed);
  }
  for (const addition of additions) {
    const trimmed = addition.trim();
    if (trimmed) set.add(trimmed);
  }
  const combined = Array.from(set).sort();
  return combined.length ? combined.join(",") : null;
}

function computeCompleteness(word: WordRecord, patch: WordPatch): boolean {
  const english = patch.english ?? word.english;
  const exampleDe = patch.exampleDe ?? word.exampleDe;
  const gender = word.gender;
  const plural = word.plural;
  const praeteritum = word.praeteritum;
  const partizipIi = word.partizipIi;
  const perfekt = word.perfekt;
  const comparative = word.comparative;
  const superlative = word.superlative;

  switch (word.pos) {
    case "V":
      return Boolean(praeteritum && partizipIi && perfekt);
    case "N":
      return Boolean(gender && plural);
    case "Adj":
      return Boolean(comparative && superlative);
    default:
      return Boolean((english && english.trim()) || (exampleDe && exampleDe.trim()));
  }
}

function formatError(source: string, reason: unknown): string {
  if (reason instanceof Error) {
    return `${source}: ${reason.message}`;
  }
  return `${source}: ${String(reason)}`;
}

async function createBackup(rows: WordRecord[], backupDir: string): Promise<string> {
  await mkdir(backupDir, { recursive: true });
  const filePath = path.join(backupDir, `words-backup-${Date.now()}.json`);
  const payload = {
    createdAt: new Date().toISOString(),
    count: rows.length,
    words: rows.map((row) => ({
      ...row,
      createdAt: row.createdAt?.toISOString?.() ?? row.createdAt,
      updatedAt: row.updatedAt?.toISOString?.() ?? row.updatedAt,
    })),
  };
  await writeFile(filePath, JSON.stringify(payload, null, 2), "utf8");
  return filePath;
}
