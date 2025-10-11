import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { db } from "@db";
import { words } from "@db/schema";
import { and, eq } from "drizzle-orm";

import type {
  EnrichmentExampleCandidate,
  EnrichmentFieldUpdate,
  EnrichmentPatch,
  EnrichmentProviderDiagnostic,
  EnrichmentTranslationCandidate,
  EnrichmentVerbFormSuggestion,
  EnrichmentWordSummary,
  WordEnrichmentSuggestions,
} from "@shared/enrichment";

import {
  delay,
  lookupAiAssistance,
  lookupExampleSentence,
  lookupOpenThesaurusSynonyms,
  lookupTranslation,
  lookupWiktextract,
  type ExampleLookup,
  type SynonymLookup,
  type TranslationLookup,
} from "./providers";

export type WordRecord = typeof words.$inferSelect;

type WordPatch = Partial<
  Pick<
    WordRecord,
    | "english"
    | "exampleDe"
    | "exampleEn"
    | "sourcesCsv"
    | "complete"
    | "updatedAt"
    | "praeteritum"
    | "partizipIi"
    | "perfekt"
    | "aux"
    | "translations"
    | "examples"
    | "enrichmentAppliedAt"
    | "enrichmentMethod"
  >
>;

type SuggestionBundle = {
  translations: EnrichmentTranslationCandidate[];
  synonyms: string[];
  englishHints: string[];
  examples: EnrichmentExampleCandidate[];
  errors: string[];
  sources: string[];
  aiUsed: boolean;
  diagnostics: EnrichmentProviderDiagnostic[];
  verbForms: EnrichmentVerbFormSuggestion[];
};

type FieldUpdate = EnrichmentFieldUpdate;
type ExampleCandidate = EnrichmentExampleCandidate;

export interface WordEnrichmentComputation {
  summary: EnrichmentWordSummary;
  patch: WordPatch;
  hasUpdates: boolean;
  suggestions: SuggestionBundle;
  storedTranslations: WordRecord["translations"] | null;
  storedExamples: WordRecord["examples"] | null;
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
  collectTranslations: boolean;
  collectWiktextract: boolean;
}

export interface PipelineRun {
  config: PipelineConfig;
  scanned: number;
  updated: number;
  applied: number;
  reportPath?: string;
  backupPath?: string;
  words: EnrichmentWordSummary[];
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
  const envCollectTranslations = parseBoolean(process.env.COLLECT_TRANSLATIONS, true);
  const envCollectWiktextract = parseBoolean(process.env.COLLECT_WIKTEXTRACT, true);

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
    collectTranslations: overrides.collectTranslations ?? envCollectTranslations,
    collectWiktextract: overrides.collectWiktextract ?? envCollectWiktextract,
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

  const results: EnrichmentWordSummary[] = [];
  const updatesToApply: Array<{ word: WordRecord; patch: WordPatch }> = [];

  for (const word of targets) {
    console.log(`Enriching ${word.lemma} (${word.pos}) [id=${word.id}]...`);
    const computation = await computeWordEnrichment(word, config, openAiKey);
    const summary = computation.summary;
    summary.applied = shouldApply && computation.hasUpdates;
    results.push(summary);

    if (shouldApply && computation.hasUpdates) {
      const appliedAt = computation.patch.enrichmentAppliedAt instanceof Date
        ? computation.patch.enrichmentAppliedAt
        : new Date();
      computation.patch.enrichmentAppliedAt = appliedAt;
      const method = computation.patch.enrichmentMethod ?? "bulk";
      computation.patch.enrichmentMethod = method;
      summary.updates.push({
        field: "enrichmentAppliedAt",
        previous: word.enrichmentAppliedAt,
        next: appliedAt,
      });
      summary.updates.push({
        field: "enrichmentMethod",
        previous: word.enrichmentMethod,
        next: method,
      });
      updatesToApply.push({ word, patch: computation.patch });
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

export async function computeWordEnrichment(
  word: WordRecord,
  config: PipelineConfig,
  openAiKey?: string,
): Promise<WordEnrichmentComputation> {
  const missingFields = detectMissingFields(word);
  const suggestions = await collectSuggestions(word, config, openAiKey);
  const {
    patch,
    updates,
    translationCandidate,
    exampleCandidate,
    verbFormCandidate,
    storedTranslations,
    storedExamples,
  } = determineUpdates(
    word,
    suggestions,
    config,
  );

  const summary: EnrichmentWordSummary = {
    id: word.id,
    lemma: word.lemma,
    pos: word.pos,
    missingFields,
    translation: translationCandidate,
    translations: storedTranslations ?? undefined,
    englishHints: suggestions.englishHints.length ? suggestions.englishHints : undefined,
    synonyms: suggestions.synonyms,
    example: exampleCandidate,
    examples: storedExamples ?? undefined,
    verbForms: verbFormCandidate,
    updates,
    applied: false,
    sources: suggestions.sources,
    errors: suggestions.errors.length ? suggestions.errors : undefined,
    aiUsed: suggestions.aiUsed,
  };

  return {
    summary,
    patch,
    hasUpdates: updates.length > 0,
    suggestions,
    storedTranslations,
    storedExamples,
  } satisfies WordEnrichmentComputation;
}

export function toEnrichmentPatch(patch: WordPatch): EnrichmentPatch {
  const { updatedAt: _updatedAt, ...rest } = patch;
  const { enrichmentAppliedAt, ...other } = rest;

  const serialised: EnrichmentPatch = {
    ...other,
    ...(enrichmentAppliedAt instanceof Date
      ? { enrichmentAppliedAt: enrichmentAppliedAt.toISOString() }
      : enrichmentAppliedAt !== undefined
        ? { enrichmentAppliedAt }
        : {}),
  } as EnrichmentPatch;

  return serialised;
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
  const translations: EnrichmentTranslationCandidate[] = [];
  const examples: ExampleCandidate[] = [];
  const verbForms: EnrichmentVerbFormSuggestion[] = [];
  let synonyms: string[] = [];
  let englishHints: string[] = [];
  const diagnostics: EnrichmentProviderDiagnostic[] = [];

  const addTranslationCandidate = (
    value: string | undefined,
    source: string,
    confidence?: number,
    language?: string,
  ) => {
    const trimmed = value?.trim();
    if (!trimmed) {
      return;
    }
    if (
      translations.some(
        (entry) =>
          entry.value.toLowerCase() === trimmed.toLowerCase()
          && entry.source === source
          && (entry.language ?? "") === (language ?? ""),
      )
    ) {
      return;
    }
    translations.push({ value: trimmed, source, confidence, language });
    sources.add(source);
  };

  const addExampleCandidate = (candidate: ExampleCandidate) => {
    if (!candidate.exampleDe && !candidate.exampleEn) {
      return;
    }
    const matchesExisting = examples.some(
      (entry) =>
        entry.source === candidate.source
        && (entry.exampleDe ?? "").trim() === (candidate.exampleDe ?? "").trim()
        && (entry.exampleEn ?? "").trim() === (candidate.exampleEn ?? "").trim(),
    );
    if (matchesExisting) {
      return;
    }
    examples.push(candidate);
    sources.add(candidate.source);
  };

  const addSynonym = (value: string | undefined) => {
    const trimmed = value?.trim();
    if (!trimmed) {
      return;
    }
    if (synonyms.some((existing) => existing.toLowerCase() === trimmed.toLowerCase())) {
      return;
    }
    synonyms.push(trimmed);
  };

  if (config.collectSynonyms) {
    try {
      const value = await lookupOpenThesaurusSynonyms(word.lemma);
      if (value?.synonyms.length) {
        const before = synonyms.length;
        for (const synonym of value.synonyms) {
          addSynonym(synonym);
        }
        if (synonyms.length > before) {
          sources.add("openthesaurus.de");
        }
      }
      diagnostics.push({
        id: "openthesaurus",
        label: "OpenThesaurus",
        status: "success",
        payload: value ?? null,
      });
    } catch (error) {
      const message = formatError("OpenThesaurus", error);
      errors.push(message);
      diagnostics.push({
        id: "openthesaurus",
        label: "OpenThesaurus",
        status: "error",
        error: message,
      });
    }
  } else {
    diagnostics.push({ id: "openthesaurus", label: "OpenThesaurus", status: "skipped" });
  }

  if (config.collectTranslations) {
    try {
      const value = await lookupTranslation(word.lemma);
      if (value?.translation) {
        addTranslationCandidate(value.translation, value.source, value.confidence, value.language);
      }
      diagnostics.push({
        id: "mymemory",
        label: "MyMemory",
        status: "success",
        payload: value ?? null,
      });
    } catch (error) {
      const message = formatError("MyMemory", error);
      errors.push(message);
      diagnostics.push({
        id: "mymemory",
        label: "MyMemory",
        status: "error",
        error: message,
      });
    }
  } else {
    diagnostics.push({ id: "mymemory", label: "MyMemory", status: "skipped" });
  }

  if (config.collectExamples) {
    try {
      const value = await lookupExampleSentence(word.lemma);
      if (value && (value.exampleDe || value.exampleEn)) {
        addExampleCandidate({
          exampleDe: value.exampleDe,
          exampleEn: value.exampleEn,
          source: value.source,
        });
      }
      diagnostics.push({
        id: "tatoeba",
        label: "Tatoeba",
        status: "success",
        payload: value ?? null,
      });
    } catch (error) {
      const message = formatError("Tatoeba", error);
      errors.push(message);
      diagnostics.push({
        id: "tatoeba",
        label: "Tatoeba",
        status: "error",
        error: message,
      });
    }
  } else {
    diagnostics.push({ id: "tatoeba", label: "Tatoeba", status: "skipped" });
  }

  if (config.collectWiktextract) {
    try {
      const value = await lookupWiktextract(word.lemma);
      if (value) {
        if (value.englishHints.length) {
          const mergedHints = new Set<string>(englishHints);
          for (const hint of value.englishHints) {
            if (hint.trim()) {
              mergedHints.add(hint.trim());
            }
          }
          englishHints = Array.from(mergedHints);
        }
        for (const translation of value.translations) {
          addTranslationCandidate(translation.value, "kaikki.org", undefined, translation.language);
        }
        const before = synonyms.length;
        for (const synonym of value.synonyms) {
          addSynonym(synonym);
        }
        if (value.synonyms.length && synonyms.length > before) {
          sources.add("kaikki.org");
        }
        for (const example of value.examples) {
          addExampleCandidate({
            exampleDe: example.exampleDe,
            exampleEn: example.exampleEn,
            source: "kaikki.org",
          });
        }
        if (value.verbForms) {
          const { praeteritum, partizipIi, perfekt, auxiliaries, perfektOptions } = value.verbForms;
          if (praeteritum || partizipIi || perfekt || auxiliaries.length) {
            verbForms.push({
              source: "kaikki.org",
              praeteritum,
              partizipIi,
              perfekt,
              aux: auxiliaries.length === 1 ? auxiliaries[0] : undefined,
              auxiliaries: auxiliaries.length ? auxiliaries : undefined,
              perfektOptions: perfektOptions.length ? perfektOptions : undefined,
            });
          }
        }
        if (
          value.translations.length
          || value.synonyms.length
          || value.examples.length
          || value.verbForms
          || value.englishHints.length
        ) {
          sources.add("kaikki.org");
        }
      }
      diagnostics.push({
        id: "wiktextract",
        label: "Wiktextract",
        status: "success",
        payload: value ?? null,
      });
    } catch (error) {
      const message = formatError("Wiktextract", error);
      errors.push(message);
      diagnostics.push({
        id: "wiktextract",
        label: "Wiktextract",
        status: "error",
        error: message,
      });
    }
  } else {
    diagnostics.push({ id: "wiktextract", label: "Wiktextract", status: "skipped" });
  }

  let aiUsed = false;
  if (config.enableAi && openAiKey) {
    try {
      const aiResult = await lookupAiAssistance(word.lemma, word.pos, openAiKey, config.openAiModel);
      if (aiResult) {
        aiUsed = true;
        if (aiResult.translation) {
          addTranslationCandidate(aiResult.translation, aiResult.source);
        }
        if (aiResult.exampleDe || aiResult.exampleEn) {
          addExampleCandidate({
            exampleDe: aiResult.exampleDe,
            exampleEn: aiResult.exampleEn,
            source: aiResult.source,
          });
        }
        diagnostics.push({
          id: "openai",
          label: "OpenAI",
          status: "success",
          payload: aiResult,
        });
      }
    } catch (error) {
      const message = formatError("OpenAI", error);
      errors.push(message);
      diagnostics.push({
        id: "openai",
        label: "OpenAI",
        status: "error",
        error: message,
      });
    }
  } else if (config.enableAi) {
    diagnostics.push({
      id: "openai",
      label: "OpenAI",
      status: "error",
      error: "Missing OpenAI API key",
    });
  } else {
    diagnostics.push({ id: "openai", label: "OpenAI", status: "skipped" });
  }

  return {
    translations,
    synonyms,
    englishHints,
    examples,
    errors,
    sources: Array.from(sources).sort(),
    aiUsed,
    diagnostics,
    verbForms,
  };
}

function determineUpdates(
  word: WordRecord,
  suggestions: SuggestionBundle,
  config: PipelineConfig,
): {
  patch: WordPatch;
  updates: FieldUpdate[];
  translationCandidate?: EnrichmentTranslationCandidate;
  exampleCandidate?: ExampleCandidate;
  verbFormCandidate?: EnrichmentVerbFormSuggestion;
  storedTranslations: WordRecord["translations"] | null;
  storedExamples: WordRecord["examples"] | null;
} {
  const patch: WordPatch = {};
  const updates: FieldUpdate[] = [];

  const translationCandidate = suggestions.translations.find((candidate) => candidate.value.trim());
  const mergedTranslations = mergeTranslationRecords(word.translations, suggestions.translations);
  if (!areTranslationRecordsEqual(word.translations, mergedTranslations)) {
    patch.translations = mergedTranslations;
    updates.push({
      field: "translations",
      previous: word.translations,
      next: mergedTranslations,
      source: translationCandidate?.source,
    });
  }
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

  const mergedExamples = mergeExampleRecords(word.examples, suggestions.examples);
  const exampleCandidate = pickExampleCandidate(suggestions.examples);
  if (!areExampleRecordsEqual(word.examples, mergedExamples)) {
    patch.examples = mergedExamples;
    updates.push({
      field: "examples",
      previous: word.examples,
      next: mergedExamples,
      source: exampleCandidate?.source,
    });
  }
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

  let verbFormCandidate: EnrichmentVerbFormSuggestion | undefined;
  let candidateAux: WordPatch["aux"] | undefined;
  if (word.pos === "V") {
    verbFormCandidate = suggestions.verbForms.find((candidate) =>
      Boolean(
        candidate.praeteritum?.trim() ||
          candidate.partizipIi?.trim() ||
          candidate.perfekt?.trim() ||
          candidate.aux,
      ),
    );

    if (verbFormCandidate) {
      const applyVerbStringField = (
        field: "praeteritum" | "partizipIi" | "perfekt",
        value: string | undefined,
      ) => {
        if (!value) return;
        if (
          field === "perfekt"
          && verbFormCandidate?.perfektOptions
          && verbFormCandidate.perfektOptions.length > 1
        ) {
          return;
        }
        const cleaned = value.trim();
        if (!cleaned) return;
        const previous = word[field];
        if (config.allowOverwrite || isBlank(previous)) {
          if (previous !== cleaned) {
            patch[field] = cleaned;
            updates.push({
              field,
              previous,
              next: cleaned,
              source: verbFormCandidate?.source,
            });
          }
        }
      };

      applyVerbStringField("praeteritum", verbFormCandidate.praeteritum);
      applyVerbStringField("partizipIi", verbFormCandidate.partizipIi);
      applyVerbStringField("perfekt", verbFormCandidate.perfekt);

      const auxiliaryOptions = verbFormCandidate.auxiliaries
        ?.map((value) => value.trim().toLowerCase())
        .filter(Boolean);
      if (auxiliaryOptions?.length) {
        const set = new Set(auxiliaryOptions);
        if (set.has("haben") && set.has("sein")) {
          candidateAux = "haben / sein";
        } else if (set.size === 1) {
          const value = Array.from(set)[0];
          if (value === "haben" || value === "sein") {
            candidateAux = value;
          }
        }
      }
      if (!candidateAux && verbFormCandidate.aux) {
        const auxValue = verbFormCandidate.aux.trim().toLowerCase();
        if (auxValue === "haben" || auxValue === "sein") {
          candidateAux = auxValue;
        } else if (auxValue.replace(/\s+/g, "") === "haben/sein") {
          candidateAux = "haben / sein";
        }
      }

      if (
        candidateAux
        && (config.allowOverwrite || isBlank(word.aux))
        && word.aux !== candidateAux
      ) {
        patch.aux = candidateAux;
        updates.push({
          field: "aux",
          previous: word.aux,
          next: candidateAux,
          source: verbFormCandidate?.source,
        });
      }
    }

    const effectiveAux = patch.aux ?? word.aux ?? candidateAux;
    const effectivePartizip = patch.partizipIi ?? word.partizipIi;
    const effectivePerfekt = patch.perfekt ?? word.perfekt;
    if (
      effectiveAux
      && effectivePartizip
      && isBlank(effectivePerfekt)
    ) {
      const derivedPerfekt = buildPerfektFromForms(effectiveAux, effectivePartizip);
      if (derivedPerfekt && derivedPerfekt !== word.perfekt) {
        patch.perfekt = derivedPerfekt;
        updates.push({
          field: "perfekt",
          previous: word.perfekt,
          next: derivedPerfekt,
          source: verbFormCandidate?.source,
        });
      }
    }
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

  return {
    patch,
    updates,
    translationCandidate,
    exampleCandidate,
    verbFormCandidate,
    storedTranslations: mergedTranslations,
    storedExamples: mergedExamples,
  };
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

type TranslationRecord = NonNullable<WordRecord["translations"]>[number];
type ExampleRecord = NonNullable<WordRecord["examples"]>[number];

function mergeTranslationRecords(
  existing: WordRecord["translations"],
  candidates: EnrichmentTranslationCandidate[],
): WordRecord["translations"] {
  const map = new Map<string, TranslationRecord>();

  const addRecord = (
    value: string | undefined,
    source?: string | null,
    language?: string | null,
    confidence?: number | null,
  ) => {
    const trimmedValue = value?.trim();
    if (!trimmedValue) {
      return;
    }
    const normalisedSource = source ? source.trim() : null;
    const normalisedLanguage = language ? language.trim() : null;
    const confidenceValue = typeof confidence === "number" ? confidence : null;
    const key = `${trimmedValue.toLowerCase()}::${(normalisedSource ?? "").toLowerCase()}::${(normalisedLanguage ?? "").toLowerCase()}`;
    if (!map.has(key)) {
      map.set(key, {
        value: trimmedValue,
        source: normalisedSource,
        language: normalisedLanguage,
        confidence: confidenceValue,
      });
    }
  };

  if (Array.isArray(existing)) {
    for (const record of existing) {
      addRecord(record.value, record.source ?? null, record.language ?? null, record.confidence ?? null);
    }
  }

  for (const candidate of candidates) {
    addRecord(candidate.value, candidate.source, candidate.language ?? null, candidate.confidence ?? null);
  }

  const result = Array.from(map.values());
  return result.length ? result : null;
}

function mergeExampleRecords(
  existing: WordRecord["examples"],
  candidates: ExampleCandidate[],
): WordRecord["examples"] {
  const map = new Map<string, ExampleRecord>();

  const addRecord = (exampleDe?: string, exampleEn?: string, source?: string | null) => {
    const trimmedDe = exampleDe?.trim();
    const trimmedEn = exampleEn?.trim();
    if (!trimmedDe && !trimmedEn) {
      return;
    }
    const normalisedSource = source ? source.trim() : null;
    const key = `${(trimmedDe ?? "").toLowerCase()}::${(trimmedEn ?? "").toLowerCase()}::${(normalisedSource ?? "").toLowerCase()}`;
    if (!map.has(key)) {
      map.set(key, {
        exampleDe: trimmedDe ?? null,
        exampleEn: trimmedEn ?? null,
        source: normalisedSource,
      });
    }
  };

  if (Array.isArray(existing)) {
    for (const record of existing) {
      addRecord(record.exampleDe ?? undefined, record.exampleEn ?? undefined, record.source ?? null);
    }
  }

  for (const candidate of candidates) {
    addRecord(candidate.exampleDe, candidate.exampleEn, candidate.source);
  }

  const result = Array.from(map.values());
  return result.length ? result : null;
}

function areTranslationRecordsEqual(
  previous: WordRecord["translations"],
  next: WordRecord["translations"],
): boolean {
  const prevList = Array.isArray(previous) ? previous : [];
  const nextList = Array.isArray(next) ? next : [];
  if (prevList.length !== nextList.length) {
    return false;
  }

  const serialise = (record: TranslationRecord) =>
    JSON.stringify([
      record.value.trim().toLowerCase(),
      (record.source ?? "").trim().toLowerCase(),
      (record.language ?? "").trim().toLowerCase(),
      typeof record.confidence === "number" ? record.confidence : null,
    ]);

  const sortedPrev = prevList.map(serialise).sort();
  const sortedNext = nextList.map(serialise).sort();
  return sortedPrev.every((value, index) => value === sortedNext[index]);
}

function areExampleRecordsEqual(
  previous: WordRecord["examples"],
  next: WordRecord["examples"],
): boolean {
  const prevList = Array.isArray(previous) ? previous : [];
  const nextList = Array.isArray(next) ? next : [];
  if (prevList.length !== nextList.length) {
    return false;
  }

  const serialise = (record: ExampleRecord) =>
    JSON.stringify([
      (record.exampleDe ?? "").trim().toLowerCase(),
      (record.exampleEn ?? "").trim().toLowerCase(),
      (record.source ?? "").trim().toLowerCase(),
    ]);

  const sortedPrev = prevList.map(serialise).sort();
  const sortedNext = nextList.map(serialise).sort();
  return sortedPrev.every((value, index) => value === sortedNext[index]);
}

function buildPerfektFromForms(aux: string, partizip: string): string | null {
  const cleanedPartizip = partizip.trim();
  if (!cleanedPartizip) {
    return null;
  }
  const normalisedAux = aux.trim().toLowerCase();
  if (normalisedAux === "haben") {
    return `hat ${cleanedPartizip}`;
  }
  if (normalisedAux === "sein") {
    return `ist ${cleanedPartizip}`;
  }
  if (normalisedAux.replace(/\s+/g, "") === "haben/sein") {
    return `hat ${cleanedPartizip} / ist ${cleanedPartizip}`;
  }
  return null;
}

function computeCompleteness(word: WordRecord, patch: WordPatch): boolean {
  const english = patch.english ?? word.english;
  const exampleDe = patch.exampleDe ?? word.exampleDe;
  const gender = word.gender;
  const plural = word.plural;
  const praeteritum = patch.praeteritum ?? word.praeteritum;
  const partizipIi = patch.partizipIi ?? word.partizipIi;
  const perfekt = patch.perfekt ?? word.perfekt;
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
