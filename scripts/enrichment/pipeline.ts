import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { getDb } from "@db";
import { enrichmentProviderSnapshots, words } from "@db/schema";
import { and, desc, eq, inArray } from "drizzle-orm";

import type {
  EnrichmentAdjectiveFormSuggestion,
  EnrichmentExampleCandidate,
  EnrichmentFieldUpdate,
  EnrichmentNounFormSuggestion,
  EnrichmentPatch,
  EnrichmentProviderDiagnostic,
  EnrichmentProviderId,
  EnrichmentProviderSnapshot,
  EnrichmentProviderSnapshotComparison,
  EnrichmentRunMode,
  EnrichmentSnapshotStatus,
  EnrichmentSnapshotTrigger,
  EnrichmentTranslationCandidate,
  EnrichmentVerbFormSuggestion,
  EnrichmentPrepositionSuggestion,
  EnrichmentWordSummary,
  WordEnrichmentSuggestions,
} from "@shared/enrichment";
import type { WordExample, WordPosAttributes, WordTranslation } from "@shared/types";

import { delay, lookupAiAssistance, lookupWiktextract } from "./providers";
import { persistProviderSnapshotToFile } from "./storage";

export type WordRecord = typeof words.$inferSelect;
type ProviderSnapshotRecord = typeof enrichmentProviderSnapshots.$inferSelect;

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
    | "gender"
    | "plural"
    | "comparative"
    | "superlative"
    | "translations"
    | "examples"
    | "posAttributes"
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
  nounForms: EnrichmentNounFormSuggestion[];
  adjectiveForms: EnrichmentAdjectiveFormSuggestion[];
  prepositionAttributes: EnrichmentPrepositionSuggestion[];
  posLabel?: string;
  posTags: string[];
  posNotes: string[];
  snapshots: EnrichmentProviderSnapshotComparison[];
};

type ProviderSnapshotDraft = {
  providerId: EnrichmentProviderId | string;
  providerLabel: string;
  status: EnrichmentSnapshotStatus;
  error?: string;
  translations: EnrichmentTranslationCandidate[];
  examples: ExampleCandidate[];
  synonyms: string[];
  englishHints: string[];
  verbForms: EnrichmentVerbFormSuggestion[];
  nounForms: EnrichmentNounFormSuggestion[];
  adjectiveForms: EnrichmentAdjectiveFormSuggestion[];
  prepositionAttributes: EnrichmentPrepositionSuggestion[];
  rawPayload?: unknown;
};

type FieldUpdate = EnrichmentFieldUpdate;
type ExampleCandidate = EnrichmentExampleCandidate;
type PrepositionAttributes = NonNullable<WordPosAttributes["preposition"]>;

export interface WordEnrichmentComputation {
  summary: EnrichmentWordSummary;
  patch: WordPatch;
  hasUpdates: boolean;
  suggestions: SuggestionBundle;
  storedTranslations: WordRecord["translations"] | null;
  storedExamples: WordRecord["examples"] | null;
  storedPosAttributes: WordRecord["posAttributes"] | null;
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
  collectWiktextract: boolean;
  posFilters: string[];
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
  const envCollectWiktextract = parseBoolean(process.env.COLLECT_WIKTEXTRACT, true);
  const envPosFilters = parsePosFilters(process.env.POS_FILTERS);

  const apply = overrides.apply ?? envApply;
  const dryRunEnv = overrides.dryRun ?? envDryRun;
  const dryRun = apply ? false : dryRunEnv;

  const outputDir = overrides.outputDir
    ?? (process.env.OUTPUT_DIR ? path.resolve(process.env.OUTPUT_DIR) : DEFAULT_OUTPUT_DIR);
  const backupDir = overrides.backupDir
    ?? (process.env.BACKUP_DIR ? path.resolve(process.env.BACKUP_DIR) : DEFAULT_BACKUP_DIR);
  const openAiModel = overrides.openAiModel ?? process.env.OPENAI_MODEL?.trim() ?? DEFAULT_OPENAI_MODEL;
  const emitReport = overrides.emitReport ?? envEmitReport;
  const overridePosFilters = overrides.posFilters !== undefined
    ? normalisePosFilters(overrides.posFilters)
    : undefined;

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
    collectWiktextract: overrides.collectWiktextract ?? envCollectWiktextract,
    posFilters: overridePosFilters ?? envPosFilters,
  } satisfies PipelineConfig;
}

export async function runEnrichment(config: PipelineConfig): Promise<PipelineRun> {
  const shouldApply = config.apply && !config.dryRun;
  const whereClause = buildWhereClause(config);

  const database = getDb();
  const baseQuery = database.select().from(words);
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
    await database.transaction(async (tx) => {
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
    nounFormCandidate,
    adjectiveFormCandidate,
    prepositionCandidate,
    storedTranslations,
    storedExamples,
    storedPosAttributes,
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
    nounForms: nounFormCandidate,
    adjectiveForms: adjectiveFormCandidate,
    prepositionAttributes: prepositionCandidate,
    posAttributes: storedPosAttributes ?? null,
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
    storedPosAttributes,
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

const POS_FILTER_ALIASES: Record<string, string> = {
  v: "V",
  verb: "V",
  verbs: "V",
  n: "N",
  noun: "N",
  nouns: "N",
  adj: "Adj",
  adjective: "Adj",
  adjectives: "Adj",
  adv: "Adv",
  adverb: "Adv",
  adverbs: "Adv",
  pron: "Pron",
  pronoun: "Pron",
  pronouns: "Pron",
  det: "Det",
  determiner: "Det",
  determiners: "Det",
  article: "Det",
  articles: "Det",
  präp: "Präp",
  präposition: "Präp",
  präpositionen: "Präp",
  praep: "Präp",
  prap: "Präp",
  prep: "Präp",
  preposition: "Präp",
  prepositions: "Präp",
  konj: "Konj",
  conjunction: "Konj",
  conjunctions: "Konj",
  konjunktion: "Konj",
  konjunktionen: "Konj",
  num: "Num",
  numeral: "Num",
  numerals: "Num",
  part: "Part",
  particle: "Part",
  particles: "Part",
  interj: "Interj",
  interjection: "Interj",
  interjections: "Interj",
};

function stripDiacritics(value: string): string {
  return value.normalize("NFKD").replace(/[\u0300-\u036f]/g, "");
}

function normalisePosFilters(values: string[] | undefined): string[] {
  if (!Array.isArray(values)) {
    return [];
  }
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const resolved = normalisePosFilterValue(value);
    if (!resolved) {
      continue;
    }
    if (!seen.has(resolved)) {
      seen.add(resolved);
      result.push(resolved);
    }
  }
  return result;
}

function normalisePosFilterValue(value: string | undefined): string | null {
  if (!value) {
    return null;
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }
  const lower = trimmed.toLowerCase();
  if (lower === "all" || lower === "*") {
    return null;
  }
  const alias = POS_FILTER_ALIASES[lower] ?? POS_FILTER_ALIASES[stripDiacritics(lower)];
  if (alias) {
    return alias;
  }
  if (trimmed.length === 1) {
    return trimmed.toUpperCase();
  }
  if (trimmed.length <= 4) {
    return `${trimmed[0]?.toUpperCase() ?? ""}${trimmed.slice(1)}`;
  }
  return trimmed;
}

function parsePosFilters(value: string | undefined): string[] {
  if (!value) {
    return [];
  }
  const parts = value
    .split(/[\s,;|]+/)
    .map((entry) => entry.trim())
    .filter(Boolean);
  return normalisePosFilters(parts);
}

export function buildWhereClause(config: PipelineConfig) {
  const clauses: Array<ReturnType<typeof eq>> = [];

  if (config.mode === "canonical") {
    clauses.push(eq(words.canonical, true));
  } else if (config.mode === "non-canonical") {
    clauses.push(eq(words.canonical, false));
  }

  if (config.onlyIncomplete) {
    clauses.push(eq(words.complete, false));
  }

  if (config.posFilters.length) {
    clauses.push(inArray(words.pos, config.posFilters));
  }

  if (!clauses.length) {
    return undefined;
  }

  let combined = clauses[0]!;
  for (let index = 1; index < clauses.length; index += 1) {
    const next = and(combined, clauses[index]!);
    combined = next ?? combined;
  }
  return combined;
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

function isEnglishTranslationCandidate(language?: string): boolean {
  if (!language) {
    return true;
  }
  const normalised = language.trim().toLowerCase();
  if (!normalised) {
    return true;
  }
  if (normalised === "en" || normalised === "eng" || normalised === "english") {
    return true;
  }
  const sanitized = normalised.replace(/[_\s]/g, "-");
  return sanitized.startsWith("en-") || normalised.startsWith("english");
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
  const nounForms: EnrichmentNounFormSuggestion[] = [];
  const adjectiveForms: EnrichmentAdjectiveFormSuggestion[] = [];
  const prepositionAttributes: EnrichmentPrepositionSuggestion[] = [];
  let synonyms: string[] = [];
  let englishHints: string[] = [];
  let posLabel: string | undefined;
  const posTagMap = new Map<string, string>();
  const posNoteMap = new Map<string, string>();
  const diagnostics: EnrichmentProviderDiagnostic[] = [];
  const diagnosticMap = new Map<EnrichmentProviderId, EnrichmentProviderDiagnostic>();
  const snapshotDrafts = new Map<string, ProviderSnapshotDraft>();

  const registerDiagnostic = (diagnostic: EnrichmentProviderDiagnostic) => {
    diagnostics.push(diagnostic);
    diagnosticMap.set(diagnostic.id, diagnostic);
  };

  const ensureSnapshotDraft = (id: EnrichmentProviderId, label: string): ProviderSnapshotDraft => {
    const existing = snapshotDrafts.get(id);
    if (existing) {
      return existing;
    }
    const draft: ProviderSnapshotDraft = {
      providerId: id,
      providerLabel: label,
      status: "success",
      translations: [],
      examples: [],
      synonyms: [],
      englishHints: [],
      verbForms: [],
      nounForms: [],
      adjectiveForms: [],
      prepositionAttributes: [],
    };
    snapshotDrafts.set(id, draft);
    return draft;
  };

  const markSnapshotError = (id: EnrichmentProviderId, label: string, message: string) => {
    const draft = ensureSnapshotDraft(id, label);
    draft.status = "error";
    draft.error = message;
  };

  const addTranslationCandidate = (
    value: string | undefined,
    source: string,
    confidence?: number,
    language?: string,
  ): EnrichmentTranslationCandidate | null => {
    const trimmed = value?.trim();
    if (!trimmed) {
      return null;
    }
    const candidate: EnrichmentTranslationCandidate = {
      value: trimmed,
      source,
      confidence,
      language,
    };
    const alreadyPresent = translations.some(
      (entry) =>
        entry.value.toLowerCase() === trimmed.toLowerCase()
        && entry.source === source
        && (entry.language ?? "") === (language ?? ""),
    );
    if (!alreadyPresent) {
      translations.push(candidate);
    }
    sources.add(source);
    return candidate;
  };

  const addExampleCandidate = (candidate: ExampleCandidate): ExampleCandidate | null => {
    const sanitized: ExampleCandidate = {
      source: candidate.source,
      exampleDe: candidate.exampleDe?.trim() || undefined,
      exampleEn: candidate.exampleEn?.trim() || undefined,
    };
    if (!sanitized.exampleDe && !sanitized.exampleEn) {
      return null;
    }
    const exists = examples.some(
      (entry) =>
        entry.source === sanitized.source
        && (entry.exampleDe ?? "") === (sanitized.exampleDe ?? "")
        && (entry.exampleEn ?? "") === (sanitized.exampleEn ?? ""),
    );
    if (!exists) {
      examples.push(sanitized);
    }
    sources.add(sanitized.source);
    return sanitized;
  };

  const addSynonym = (value: string | undefined): string | null => {
    const trimmed = value?.trim();
    if (!trimmed) {
      return null;
    }
    if (!synonyms.some((existing) => existing.toLowerCase() === trimmed.toLowerCase())) {
      synonyms.push(trimmed);
    }
    return trimmed;
  };

  const addPosTag = (value: string | undefined | null): void => {
    const trimmed = value?.trim();
    if (!trimmed) return;
    const normalised = trimmed.replace(/\s+/g, " ");
    if (!normalised) return;
    const key = normalised.toLowerCase();
    if (!posTagMap.has(key)) {
      posTagMap.set(key, normalised);
    }
  };

  const addPosNote = (value: string | undefined | null): void => {
    const trimmed = value?.trim();
    if (!trimmed) return;
    const normalised = trimmed.replace(/\s+/g, " ");
    if (!normalised) return;
    const key = normalised.toLowerCase();
    if (!posNoteMap.has(key)) {
      posNoteMap.set(key, normalised);
    }
  };

  if (config.collectWiktextract) {
    try {
      const value = await lookupWiktextract(word.lemma, word.pos);
      const snapshot = ensureSnapshotDraft("wiktextract", "Wiktextract");
      snapshot.rawPayload = value ?? null;
      if (value) {
        if (value.englishHints.length) {
          const cleanedHints = normalizeStringList(value.englishHints);
          snapshot.englishHints = cleanedHints;
          englishHints = mergeStringLists(englishHints, cleanedHints);
        }
        if (value.translations.length) {
          for (const translation of value.translations) {
            const candidate = addTranslationCandidate(translation.value, "kaikki.org", undefined, translation.language);
            if (candidate) {
              snapshot.translations.push(candidate);
            }
          }
        }
        if (value.synonyms.length) {
          const cleanedSynonyms = normalizeStringList(value.synonyms);
          snapshot.synonyms = cleanedSynonyms;
          for (const synonym of cleanedSynonyms) {
            addSynonym(synonym);
          }
        }
        if (value.examples.length) {
          for (const example of value.examples) {
            const candidate = addExampleCandidate({
              exampleDe: example.exampleDe,
              exampleEn: example.exampleEn,
              source: "kaikki.org",
            });
            if (candidate) {
              snapshot.examples.push(candidate);
            }
          }
        }
        if (value.verbForms) {
          const { praeteritum, partizipIi, perfekt, auxiliaries, perfektOptions } = value.verbForms;
          if (praeteritum || partizipIi || perfekt || auxiliaries.length) {
            const suggestion: EnrichmentVerbFormSuggestion = {
              source: "kaikki.org",
              praeteritum,
              partizipIi,
              perfekt,
              aux: auxiliaries.length === 1 ? auxiliaries[0] : undefined,
              auxiliaries: auxiliaries.length ? auxiliaries : undefined,
              perfektOptions: perfektOptions.length ? perfektOptions : undefined,
            };
            verbForms.push(suggestion);
            snapshot.verbForms.push(suggestion);
          }
        }
        if (value.nounForms) {
          const suggestion: EnrichmentNounFormSuggestion = {
            source: "kaikki.org",
            genders: value.nounForms.genders.length ? value.nounForms.genders : undefined,
            plurals: value.nounForms.plurals.length ? value.nounForms.plurals : undefined,
            forms: value.nounForms.forms.length ? value.nounForms.forms : undefined,
          };
          nounForms.push(suggestion);
          snapshot.nounForms.push(suggestion);
        }
        if (value.adjectiveForms) {
          const suggestion: EnrichmentAdjectiveFormSuggestion = {
            source: "kaikki.org",
            comparatives: value.adjectiveForms.comparatives.length ? value.adjectiveForms.comparatives : undefined,
            superlatives: value.adjectiveForms.superlatives.length ? value.adjectiveForms.superlatives : undefined,
            forms: value.adjectiveForms.forms.length ? value.adjectiveForms.forms : undefined,
          };
          adjectiveForms.push(suggestion);
          snapshot.adjectiveForms.push(suggestion);
        }
        if (value.prepositionAttributes) {
          const suggestion: EnrichmentPrepositionSuggestion = {
            source: "kaikki.org",
            cases: value.prepositionAttributes.cases.length ? value.prepositionAttributes.cases : undefined,
            notes: value.prepositionAttributes.notes.length ? value.prepositionAttributes.notes : undefined,
          };
          prepositionAttributes.push(suggestion);
          snapshot.prepositionAttributes.push(suggestion);
        }
        if (value.posLabel) {
          posLabel = value.posLabel;
        }
        if (value.posTags.length) {
          for (const tag of value.posTags) {
            addPosTag(tag);
          }
        }
        if (value.posNotes.length) {
          for (const note of value.posNotes) {
            addPosNote(note);
          }
        }
        if (
          value.translations.length
          || value.synonyms.length
          || value.examples.length
          || value.verbForms
          || value.nounForms
          || value.adjectiveForms
          || value.prepositionAttributes
          || value.englishHints.length
        ) {
          sources.add("kaikki.org");
        }
      }
      registerDiagnostic({
        id: "wiktextract",
        label: "Wiktextract",
        status: "success",
        payload: value ?? null,
      });
    } catch (error) {
      const message = formatError("Wiktextract", error);
      errors.push(message);
      markSnapshotError("wiktextract", "Wiktextract", message);
      registerDiagnostic({
        id: "wiktextract",
        label: "Wiktextract",
        status: "error",
        error: message,
      });
    }
  } else {
    registerDiagnostic({ id: "wiktextract", label: "Wiktextract", status: "skipped" });
  }

  let aiUsed = false;
  if (config.enableAi && openAiKey) {
    try {
      const aiResult = await lookupAiAssistance(word.lemma, word.pos, openAiKey, config.openAiModel);
      if (aiResult) {
        aiUsed = true;
        const snapshot = ensureSnapshotDraft("openai", "OpenAI");
        snapshot.rawPayload = aiResult;
        if (aiResult.translation) {
          const candidate = addTranslationCandidate(aiResult.translation, aiResult.source);
          if (candidate) {
            snapshot.translations.push(candidate);
          }
        }
        if (aiResult.exampleDe || aiResult.exampleEn) {
          const candidate = addExampleCandidate({
            exampleDe: aiResult.exampleDe,
            exampleEn: aiResult.exampleEn,
            source: aiResult.source,
          });
          if (candidate) {
            snapshot.examples.push(candidate);
          }
        }
        registerDiagnostic({
          id: "openai",
          label: "OpenAI",
          status: "success",
          payload: aiResult,
        });
      }
    } catch (error) {
      const message = formatError("OpenAI", error);
      errors.push(message);
      markSnapshotError("openai", "OpenAI", message);
      registerDiagnostic({
        id: "openai",
        label: "OpenAI",
        status: "error",
        error: message,
      });
    }
  } else if (config.enableAi) {
    registerDiagnostic({
      id: "openai",
      label: "OpenAI",
      status: "error",
      error: "Missing OpenAI API key",
    });
  } else {
    registerDiagnostic({ id: "openai", label: "OpenAI", status: "skipped" });
  }

  const snapshotComparisons = await persistProviderSnapshotsForWord(
    word,
    config,
    snapshotDrafts,
    diagnosticMap,
  );

  const resolvedPosLabel = posLabel?.trim() ? posLabel.trim().replace(/\s+/g, " ") : undefined;
  const resolvedPosTags = Array.from(posTagMap.values()).sort((a, b) => a.localeCompare(b));
  const resolvedPosNotes = Array.from(posNoteMap.values()).sort((a, b) => a.localeCompare(b));

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
    nounForms,
    adjectiveForms,
    prepositionAttributes,
    posLabel: resolvedPosLabel,
    posTags: resolvedPosTags,
    posNotes: resolvedPosNotes,
    snapshots: snapshotComparisons,
  };
}

async function persistProviderSnapshotsForWord(
  word: WordRecord,
  config: PipelineConfig,
  snapshotDrafts: Map<string, ProviderSnapshotDraft>,
  diagnosticMap: Map<EnrichmentProviderId, EnrichmentProviderDiagnostic>,
): Promise<EnrichmentProviderSnapshotComparison[]> {
  if (!snapshotDrafts.size) {
    return [];
  }

  const database = getDb();
  const trigger: EnrichmentSnapshotTrigger = config.apply && !config.dryRun ? "apply" : "preview";
  const mode: EnrichmentRunMode = config.mode;
  const comparisons: EnrichmentProviderSnapshotComparison[] = [];

  for (const draft of snapshotDrafts.values()) {
    const [previousRecord] = await database
      .select()
      .from(enrichmentProviderSnapshots)
      .where(
        and(
          eq(enrichmentProviderSnapshots.wordId, word.id),
          eq(enrichmentProviderSnapshots.providerId, draft.providerId),
        ),
      )
      .orderBy(desc(enrichmentProviderSnapshots.collectedAt))
      .limit(1);

    const [insertedRecord] = await database
      .insert(enrichmentProviderSnapshots)
      .values({
        wordId: word.id,
        lemma: word.lemma,
        pos: word.pos,
        providerId: draft.providerId,
        providerLabel: draft.providerLabel,
        status: draft.status,
        error: draft.status === "error" ? draft.error ?? null : null,
        trigger,
        mode,
        translations: draft.status === "success" ? toWordTranslations(draft.translations) : null,
        examples: draft.status === "success" ? toWordExamples(draft.examples) : null,
        synonyms: draft.status === "success" && draft.synonyms.length ? draft.synonyms : null,
        englishHints: draft.status === "success" && draft.englishHints.length ? draft.englishHints : null,
        verbForms: draft.status === "success" && draft.verbForms.length ? draft.verbForms : null,
        nounForms: draft.status === "success" && draft.nounForms.length ? draft.nounForms : null,
        adjectiveForms: draft.status === "success" && draft.adjectiveForms.length ? draft.adjectiveForms : null,
        prepositionAttributes:
          draft.status === "success" && draft.prepositionAttributes.length ? draft.prepositionAttributes : null,
        rawPayload: draft.rawPayload ?? null,
      })
      .returning();

    const currentSnapshot = buildProviderSnapshotFromRecord(insertedRecord);
    const previousSnapshot = previousRecord ? buildProviderSnapshotFromRecord(previousRecord) : null;

    if (trigger === "apply") {
      await persistProviderSnapshotToFile(currentSnapshot);
    }
    const hasChanges = previousSnapshot ? !areProviderSnapshotsEqual(previousSnapshot, currentSnapshot) : true;

    comparisons.push({
      providerId: currentSnapshot.providerId,
      providerLabel: currentSnapshot.providerLabel,
      current: currentSnapshot,
      previous: previousSnapshot,
      hasChanges,
    });

    const diagnostic = diagnosticMap.get(draft.providerId as EnrichmentProviderId);
    if (diagnostic) {
      diagnostic.currentSnapshot = currentSnapshot;
      diagnostic.previousSnapshot = previousSnapshot;
      diagnostic.hasChanges = hasChanges;
    }
  }

  return comparisons.sort((a, b) => {
    const labelA = a.providerLabel ?? a.providerId;
    const labelB = b.providerLabel ?? b.providerId;
    return labelA.localeCompare(labelB);
  });
}

function toWordTranslations(candidates: EnrichmentTranslationCandidate[]): WordTranslation[] | null {
  if (!candidates.length) {
    return null;
  }
  const seen = new Set<string>();
  const records: WordTranslation[] = [];
  for (const candidate of candidates) {
    const value = candidate.value.trim();
    if (!value) {
      continue;
    }
    const source = candidate.source?.trim() ?? null;
    const language = candidate.language?.trim() ?? null;
    const confidence = typeof candidate.confidence === "number" ? candidate.confidence : null;
    const key = `${value.toLowerCase()}::${(source ?? "").toLowerCase()}::${(language ?? "").toLowerCase()}::${confidence ?? ""}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    records.push({ value, source, language, confidence });
  }
  return records.length ? records : null;
}

function toWordExamples(candidates: ExampleCandidate[]): WordExample[] | null {
  if (!candidates.length) {
    return null;
  }
  const seen = new Set<string>();
  const records: WordExample[] = [];
  for (const candidate of candidates) {
    const exampleDe = candidate.exampleDe?.trim() ?? null;
    const exampleEn = candidate.exampleEn?.trim() ?? null;
    const source = candidate.source?.trim() ?? null;
    if (!exampleDe && !exampleEn) {
      continue;
    }
    const key = `${(exampleDe ?? "").toLowerCase()}::${(exampleEn ?? "").toLowerCase()}::${(source ?? "").toLowerCase()}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    records.push({ exampleDe, exampleEn, source });
  }
  return records.length ? records : null;
}

export function buildProviderSnapshotFromRecord(
  record: ProviderSnapshotRecord,
): EnrichmentProviderSnapshot {
  return {
    id: record.id,
    wordId: record.wordId,
    lemma: record.lemma,
    pos: record.pos,
    providerId: record.providerId,
    providerLabel: record.providerLabel,
    status: record.status as EnrichmentSnapshotStatus,
    error: record.error,
    trigger: (record.trigger as EnrichmentSnapshotTrigger) ?? "preview",
    mode: (record.mode as EnrichmentRunMode) ?? "non-canonical",
    translations: (record.translations as WordTranslation[] | null) ?? null,
    examples: (record.examples as WordExample[] | null) ?? null,
    synonyms: (record.synonyms as string[] | null) ?? null,
    englishHints: (record.englishHints as string[] | null) ?? null,
    verbForms: (record.verbForms as EnrichmentVerbFormSuggestion[] | null) ?? null,
    nounForms: (record.nounForms as EnrichmentNounFormSuggestion[] | null) ?? null,
    adjectiveForms: (record.adjectiveForms as EnrichmentAdjectiveFormSuggestion[] | null) ?? null,
    prepositionAttributes: (record.prepositionAttributes as EnrichmentPrepositionSuggestion[] | null) ?? null,
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

function areProviderSnapshotsEqual(
  previous: EnrichmentProviderSnapshot,
  next: EnrichmentProviderSnapshot,
): boolean {
  if (previous.status !== next.status) {
    return false;
  }
  if ((previous.error ?? null) !== (next.error ?? null)) {
    return false;
  }
  return (
    JSON.stringify(buildSnapshotComparisonPayload(previous))
    === JSON.stringify(buildSnapshotComparisonPayload(next))
  );
}

function buildSnapshotComparisonPayload(snapshot: EnrichmentProviderSnapshot) {
  return {
    translations: sortTranslations(snapshot.translations ?? []),
    examples: sortExamples(snapshot.examples ?? []),
    synonyms: sortStrings(snapshot.synonyms ?? []),
    englishHints: sortStrings(snapshot.englishHints ?? []),
    verbForms: sortVerbForms(snapshot.verbForms ?? []),
    nounForms: sortNounForms(snapshot.nounForms ?? []),
    adjectiveForms: sortAdjectiveForms(snapshot.adjectiveForms ?? []),
    prepositionAttributes: sortPrepositionAttributes(snapshot.prepositionAttributes ?? []),
  };
}

function sortTranslations(values: WordTranslation[]): WordTranslation[] {
  return [...values]
    .map((entry) => ({
      value: entry.value.trim(),
      source: entry.source?.trim() ?? null,
      language: entry.language?.trim() ?? null,
      confidence: entry.confidence ?? null,
    }))
    .sort((a, b) => {
      const valueCompare = a.value.localeCompare(b.value);
      if (valueCompare !== 0) return valueCompare;
      const sourceCompare = (a.source ?? "").localeCompare(b.source ?? "");
      if (sourceCompare !== 0) return sourceCompare;
      const languageCompare = (a.language ?? "").localeCompare(b.language ?? "");
      if (languageCompare !== 0) return languageCompare;
      return (a.confidence ?? 0) - (b.confidence ?? 0);
    });
}

function sortExamples(values: WordExample[]): WordExample[] {
  return [...values]
    .map((entry) => ({
      exampleDe: entry.exampleDe?.trim() ?? null,
      exampleEn: entry.exampleEn?.trim() ?? null,
      source: entry.source?.trim() ?? null,
    }))
    .sort((a, b) => {
      const deCompare = (a.exampleDe ?? "").localeCompare(b.exampleDe ?? "");
      if (deCompare !== 0) return deCompare;
      const enCompare = (a.exampleEn ?? "").localeCompare(b.exampleEn ?? "");
      if (enCompare !== 0) return enCompare;
      return (a.source ?? "").localeCompare(b.source ?? "");
    });
}

function sortVerbForms(values: EnrichmentVerbFormSuggestion[]): EnrichmentVerbFormSuggestion[] {
  return [...values]
    .map((entry) => ({
      source: entry.source,
      praeteritum: entry.praeteritum?.trim() || undefined,
      partizipIi: entry.partizipIi?.trim() || undefined,
      perfekt: entry.perfekt?.trim() || undefined,
      aux: entry.aux?.trim() || undefined,
      auxiliaries: entry.auxiliaries ? sortStrings(entry.auxiliaries) : [],
      perfektOptions: entry.perfektOptions ? sortStrings(entry.perfektOptions) : [],
    }))
    .sort((a, b) => {
      const sourceCompare = a.source.localeCompare(b.source);
      if (sourceCompare !== 0) return sourceCompare;
      const praeteritumCompare = (a.praeteritum ?? "").localeCompare(b.praeteritum ?? "");
      if (praeteritumCompare !== 0) return praeteritumCompare;
      const partizipCompare = (a.partizipIi ?? "").localeCompare(b.partizipIi ?? "");
      if (partizipCompare !== 0) return partizipCompare;
      const perfektCompare = (a.perfekt ?? "").localeCompare(b.perfekt ?? "");
      if (perfektCompare !== 0) return perfektCompare;
      const auxCompare = (a.aux ?? "").localeCompare(b.aux ?? "");
      if (auxCompare !== 0) return auxCompare;
      const auxiliariesCompare = a.auxiliaries.join("||").localeCompare(b.auxiliaries.join("||"));
      if (auxiliariesCompare !== 0) return auxiliariesCompare;
      return a.perfektOptions.join("||").localeCompare(b.perfektOptions.join("||"));
    });
}

function sortNounForms(values: EnrichmentNounFormSuggestion[]): EnrichmentNounFormSuggestion[] {
  return [...values]
    .map((entry) => ({
      source: entry.source,
      genders: entry.genders ? sortStrings(entry.genders) : [],
      plurals: entry.plurals ? sortStrings(entry.plurals) : [],
      forms: (entry.forms ?? [])
        .map((form) => ({
          form: form.form.trim(),
          tags: (form.tags ?? []).map((tag) => tag.trim().toLowerCase()).sort(),
        }))
        .sort((a, b) => {
          const formCompare = a.form.localeCompare(b.form);
          if (formCompare !== 0) return formCompare;
          return a.tags.join("||").localeCompare(b.tags.join("||"));
        }),
    }))
    .sort((a, b) => {
      const sourceCompare = a.source.localeCompare(b.source);
      if (sourceCompare !== 0) return sourceCompare;
      const genderCompare = a.genders.join("||").localeCompare(b.genders.join("||"));
      if (genderCompare !== 0) return genderCompare;
      const pluralCompare = a.plurals.join("||").localeCompare(b.plurals.join("||"));
      if (pluralCompare !== 0) return pluralCompare;
      return a.forms
        .map((form) => `${form.form}::${form.tags.join("|")}`)
        .join("||")
        .localeCompare(b.forms.map((form) => `${form.form}::${form.tags.join("|")}`).join("||"));
    });
}

function sortAdjectiveForms(values: EnrichmentAdjectiveFormSuggestion[]): EnrichmentAdjectiveFormSuggestion[] {
  return [...values]
    .map((entry) => ({
      source: entry.source,
      comparatives: entry.comparatives ? sortStrings(entry.comparatives) : [],
      superlatives: entry.superlatives ? sortStrings(entry.superlatives) : [],
      forms: (entry.forms ?? [])
        .map((form) => ({
          form: form.form.trim(),
          tags: (form.tags ?? []).map((tag) => tag.trim().toLowerCase()).sort(),
        }))
        .sort((a, b) => {
          const formCompare = a.form.localeCompare(b.form);
          if (formCompare !== 0) return formCompare;
          return a.tags.join("||").localeCompare(b.tags.join("||"));
        }),
    }))
    .sort((a, b) => {
      const sourceCompare = a.source.localeCompare(b.source);
      if (sourceCompare !== 0) return sourceCompare;
      const comparativeCompare = a.comparatives.join("||").localeCompare(b.comparatives.join("||"));
      if (comparativeCompare !== 0) return comparativeCompare;
      const superlativeCompare = a.superlatives.join("||").localeCompare(b.superlatives.join("||"));
      if (superlativeCompare !== 0) return superlativeCompare;
      return a.forms
        .map((form) => `${form.form}::${form.tags.join("|")}`)
        .join("||")
        .localeCompare(b.forms.map((form) => `${form.form}::${form.tags.join("|")}`).join("||"));
    });
}

function sortPrepositionAttributes(values: EnrichmentPrepositionSuggestion[]): EnrichmentPrepositionSuggestion[] {
  return [...values]
    .map((entry) => ({
      source: entry.source,
      cases: entry.cases ? sortStrings(entry.cases) : [],
      notes: entry.notes ? sortStrings(entry.notes) : [],
    }))
    .sort((a, b) => {
      const sourceCompare = a.source.localeCompare(b.source);
      if (sourceCompare !== 0) return sourceCompare;
      const caseCompare = a.cases.join("||").localeCompare(b.cases.join("||"));
      if (caseCompare !== 0) return caseCompare;
      return a.notes.join("||").localeCompare(b.notes.join("||"));
    });
}

function sortStrings(values: string[]): string[] {
  return normalizeStringList(values).sort((a, b) => a.localeCompare(b));
}

function normalizeStringList(values: Array<string | null | undefined>): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const trimmed = value?.trim();
    if (!trimmed) {
      continue;
    }
    const key = trimmed.toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      result.push(trimmed);
    }
  }
  return result;
}

function mergeStringLists(existing: string[], additions: string[]): string[] {
  const seen = new Map<string, string>();
  for (const value of existing) {
    const trimmed = value.trim();
    if (!trimmed) {
      continue;
    }
    const key = trimmed.toLowerCase();
    if (!seen.has(key)) {
      seen.set(key, trimmed);
    }
  }
  for (const value of additions) {
    const trimmed = value.trim();
    if (!trimmed) {
      continue;
    }
    const key = trimmed.toLowerCase();
    if (!seen.has(key)) {
      seen.set(key, trimmed);
    }
  }
  return Array.from(seen.values());
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
  nounFormCandidate?: EnrichmentNounFormSuggestion;
  adjectiveFormCandidate?: EnrichmentAdjectiveFormSuggestion;
  prepositionCandidate?: EnrichmentPrepositionSuggestion;
  storedTranslations: WordRecord["translations"] | null;
  storedExamples: WordRecord["examples"] | null;
  storedPosAttributes: WordRecord["posAttributes"] | null;
} {
  const patch: WordPatch = {};
  const updates: FieldUpdate[] = [];

  const translationCandidate = pickPreferredTranslationCandidate(suggestions.translations);
  const englishTranslationCandidate = pickPreferredEnglishTranslationCandidate(suggestions.translations);
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
    englishTranslationCandidate &&
    (config.allowOverwrite || isBlank(word.english)) &&
    !isBlank(englishTranslationCandidate.value)
  ) {
    patch.english = englishTranslationCandidate.value;
    updates.push({
      field: "english",
      previous: word.english,
      next: englishTranslationCandidate.value,
      source: englishTranslationCandidate.source,
    });
  }

  const mergedExamples = mergeExampleRecords(word.examples, suggestions.examples);
  const exampleCandidate = pickExampleCandidate(suggestions.examples);
  const exampleDeCandidate = exampleCandidate?.exampleDe?.trim();
  const exampleEnCandidate = exampleCandidate?.exampleEn?.trim();
  const hasExamplePair = Boolean(exampleDeCandidate && exampleEnCandidate);
  if (!areExampleRecordsEqual(word.examples, mergedExamples)) {
    patch.examples = mergedExamples;
    updates.push({
      field: "examples",
      previous: word.examples,
      next: mergedExamples,
      source: exampleCandidate?.source,
    });
  }
  if (hasExamplePair && exampleCandidate) {
    if ((config.allowOverwrite || isBlank(word.exampleDe)) && exampleDeCandidate) {
      patch.exampleDe = exampleCandidate.exampleDe;
      updates.push({
        field: "exampleDe",
        previous: word.exampleDe,
        next: exampleCandidate.exampleDe,
        source: exampleCandidate.source,
      });
    }
    if ((config.allowOverwrite || isBlank(word.exampleEn)) && exampleEnCandidate) {
      patch.exampleEn = exampleCandidate.exampleEn;
      updates.push({
        field: "exampleEn",
        previous: word.exampleEn,
        next: exampleCandidate.exampleEn,
        source: exampleCandidate.source,
      });
    }
  }

  let nounFormCandidate: EnrichmentNounFormSuggestion | undefined;
  let adjectiveFormCandidate: EnrichmentAdjectiveFormSuggestion | undefined;
  let verbFormCandidate: EnrichmentVerbFormSuggestion | undefined;
  let candidateAux: WordPatch["aux"] | undefined;
  let prepositionCandidate: EnrichmentPrepositionSuggestion | undefined;

  if (word.pos === "N") {
    const genderCandidate = pickPreferredGenderCandidate(suggestions.nounForms);
    if (genderCandidate) {
      nounFormCandidate = genderCandidate.suggestion;
      const previous = word.gender;
      if (config.allowOverwrite || isBlank(previous)) {
        if (previous !== genderCandidate.value) {
          patch.gender = genderCandidate.value;
          updates.push({
            field: "gender",
            previous,
            next: genderCandidate.value,
            source: genderCandidate.source,
          });
        }
      }
    }

    const pluralCandidate = pickPreferredPluralCandidate(suggestions.nounForms);
    if (pluralCandidate) {
      nounFormCandidate = nounFormCandidate ?? pluralCandidate.suggestion;
      const previous = word.plural;
      if (config.allowOverwrite || isBlank(previous)) {
        if (previous !== pluralCandidate.value) {
          patch.plural = pluralCandidate.value;
          updates.push({
            field: "plural",
            previous,
            next: pluralCandidate.value,
            source: pluralCandidate.source,
          });
        }
      }
    }
  }

  if (word.pos === "Adj") {
    const comparativeCandidate = pickPreferredAdjectiveCandidate(suggestions.adjectiveForms, "comparative");
    if (comparativeCandidate) {
      adjectiveFormCandidate = comparativeCandidate.suggestion;
      const previous = word.comparative;
      if (config.allowOverwrite || isBlank(previous)) {
        if (previous !== comparativeCandidate.value) {
          patch.comparative = comparativeCandidate.value;
          updates.push({
            field: "comparative",
            previous,
            next: comparativeCandidate.value,
            source: comparativeCandidate.source,
          });
        }
      }
    }

    const superlativeCandidate = pickPreferredAdjectiveCandidate(suggestions.adjectiveForms, "superlative");
    if (superlativeCandidate) {
      adjectiveFormCandidate = adjectiveFormCandidate ?? superlativeCandidate.suggestion;
      const previous = word.superlative;
      if (config.allowOverwrite || isBlank(previous)) {
        if (previous !== superlativeCandidate.value) {
          patch.superlative = superlativeCandidate.value;
          updates.push({
            field: "superlative",
            previous,
            next: superlativeCandidate.value,
            source: superlativeCandidate.source,
          });
        }
      }
    }
  }
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

  prepositionCandidate = pickPrepositionCandidate(suggestions.prepositionAttributes);
  const mergedPosAttributes = mergePosAttributes(
    word.pos,
    word.posAttributes,
    suggestions.prepositionAttributes,
    suggestions.posLabel,
    suggestions.posTags,
    suggestions.posNotes,
  );
  if (!arePosAttributesEqual(word.posAttributes, mergedPosAttributes)) {
    patch.posAttributes = mergedPosAttributes;
    updates.push({
      field: "posAttributes",
      previous: word.posAttributes,
      next: mergedPosAttributes,
      source: prepositionCandidate?.source,
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

  return {
    patch,
    updates,
    translationCandidate,
    exampleCandidate,
    verbFormCandidate,
    nounFormCandidate,
    adjectiveFormCandidate,
    prepositionCandidate,
    storedTranslations: mergedTranslations,
    storedExamples: mergedExamples,
    storedPosAttributes: mergedPosAttributes ?? null,
  };
}

function pickExampleCandidate(examples: ExampleCandidate[]): ExampleCandidate | undefined {
  const preferKaikki = examples.filter((example) => example.source === "kaikki.org");
  const fallback = examples.filter((example) => example.source !== "kaikki.org");
  return (
    preferKaikki.find((example) => example.exampleDe && example.exampleEn)
    ?? preferKaikki.find((example) => example.exampleDe)
    ?? preferKaikki.find((example) => example.exampleEn)
    ?? fallback.find((example) => example.exampleDe && example.exampleEn)
    ?? fallback.find((example) => example.exampleDe)
    ?? fallback.find((example) => example.exampleEn)
  );
}

function pickPrepositionCandidate(
  candidates: EnrichmentPrepositionSuggestion[],
): EnrichmentPrepositionSuggestion | undefined {
  const hasData = (candidate: EnrichmentPrepositionSuggestion | undefined): candidate is EnrichmentPrepositionSuggestion =>
    Boolean(
      candidate
      && ((candidate.cases?.some((value) => value && value.trim()))
        || (candidate.notes?.some((value) => value && value.trim()))),
    );

  return candidates.find((candidate) => candidate.source === "kaikki.org" && hasData(candidate))
    ?? candidates.find((candidate) => hasData(candidate));
}

function pickPreferredTranslationCandidate(
  candidates: EnrichmentTranslationCandidate[],
): EnrichmentTranslationCandidate | undefined {
  return (
    candidates.find((candidate) => candidate.source === "kaikki.org" && candidate.value.trim())
    ?? candidates.find((candidate) => candidate.value.trim())
  );
}

function pickPreferredEnglishTranslationCandidate(
  candidates: EnrichmentTranslationCandidate[],
): EnrichmentTranslationCandidate | undefined {
  return (
    candidates.find(
      (candidate) =>
        candidate.source === "kaikki.org"
        && candidate.value.trim()
        && isEnglishTranslationCandidate(candidate.language),
    )
    ?? candidates.find(
      (candidate) => candidate.value.trim() && isEnglishTranslationCandidate(candidate.language),
    )
  );
}

export function mergePosAttributes(
  pos: WordRecord["pos"],
  existing: WordRecord["posAttributes"],
  suggestions: EnrichmentPrepositionSuggestion[],
  suggestedPosLabel?: string,
  suggestedTags: string[] = [],
  suggestedNotes: string[] = [],
): WordPosAttributes | null {
  const normalisedExisting = normalisePosAttributes(existing);
  const caseValues = new Set<string>();
  const noteValues = new Set<string>();

  if (normalisedExisting?.preposition?.cases) {
    for (const entry of normalisedExisting.preposition.cases) {
      if (entry) {
        caseValues.add(entry);
      }
    }
  }
  if (normalisedExisting?.preposition?.notes) {
    for (const entry of normalisedExisting.preposition.notes) {
      if (entry) {
        noteValues.add(entry);
      }
    }
  }

  for (const suggestion of suggestions) {
    for (const entry of suggestion.cases ?? []) {
      const trimmed = entry?.trim();
      if (trimmed) {
        caseValues.add(trimmed);
      }
    }
    for (const note of suggestion.notes ?? []) {
      const trimmed = note?.trim();
      if (trimmed) {
        noteValues.add(trimmed);
      }
    }
  }

  const resolvedCases = caseValues.size ? Array.from(caseValues.values()).sort((a, b) => a.localeCompare(b)) : undefined;
  const resolvedNotes = noteValues.size ? Array.from(noteValues.values()).sort((a, b) => a.localeCompare(b)) : undefined;

  const result: WordPosAttributes = {};
  const candidatePos = suggestedPosLabel?.trim().replace(/\s+/g, " ");
  const resolvedPos = candidatePos && candidatePos.length
    ? candidatePos
    : normalisedExisting?.pos ?? (typeof pos === "string" && pos.trim() ? pos : undefined);
  if (resolvedPos) {
    result.pos = resolvedPos;
  }

  const mergedTags = sortStrings([...(normalisedExisting?.tags ?? []), ...suggestedTags]);
  const mergedNotes = sortStrings([...(normalisedExisting?.notes ?? []), ...suggestedNotes]);

  if (resolvedCases || resolvedNotes || normalisedExisting?.preposition) {
    const mergedPreposition: PrepositionAttributes | undefined = (() => {
      if (!resolvedCases && !resolvedNotes) {
        return normalisedExisting?.preposition ?? undefined;
      }
      const payload: PrepositionAttributes = {};
      if (resolvedCases) {
        payload.cases = resolvedCases;
      }
      if (resolvedNotes) {
        payload.notes = resolvedNotes;
      }
      return payload;
    })();
    if (mergedPreposition) {
      result.preposition = mergedPreposition;
    }
  }

  if (mergedTags.length) {
    result.tags = mergedTags;
  }
  if (mergedNotes.length) {
    result.notes = mergedNotes;
  }

  return Object.keys(result).length ? result : null;
}

function normalisePosAttributes(
  value: WordPosAttributes | WordRecord["posAttributes"] | null | undefined,
): WordPosAttributes | null {
  if (!value || typeof value !== "object") {
    return null;
  }
  const normalised: WordPosAttributes = {};
  if (typeof value.pos === "string" && value.pos.trim()) {
    normalised.pos = value.pos.trim();
  }
  const preposition = normalisePrepositionAttributes(value.preposition ?? null);
  if (preposition) {
    normalised.preposition = preposition;
  }
  const tags = Array.isArray(value.tags) ? normalizeStringList(value.tags) : [];
  if (tags.length) {
    normalised.tags = tags;
  }
  const notes = Array.isArray(value.notes) ? normalizeStringList(value.notes) : [];
  if (notes.length) {
    normalised.notes = notes;
  }

  return Object.keys(normalised).length ? normalised : null;
}

function normalisePrepositionAttributes(
  value: WordPosAttributes["preposition"] | null,
): PrepositionAttributes | null {
  if (!value || typeof value !== "object") {
    return null;
  }
  const cases = Array.isArray(value.cases) ? normalizeStringList(value.cases) : [];
  const notes = Array.isArray(value.notes) ? normalizeStringList(value.notes) : [];
  if (!cases.length && !notes.length) {
    return null;
  }
  const result: PrepositionAttributes = {};
  if (cases.length) {
    result.cases = cases;
  }
  if (notes.length) {
    result.notes = notes;
  }
  return result;
}

function arePosAttributesEqual(
  a: WordRecord["posAttributes"],
  b: WordPosAttributes | null,
): boolean {
  const normalisedA = normalisePosAttributes(a);
  const normalisedB = normalisePosAttributes(b);
  if (!normalisedA && !normalisedB) {
    return true;
  }
  if (!normalisedA || !normalisedB) {
    return false;
  }
  if ((normalisedA.pos ?? null) !== (normalisedB.pos ?? null)) {
    return false;
  }
  if (!arePrepositionAttributesEqual(normalisedA.preposition ?? null, normalisedB.preposition ?? null)) {
    return false;
  }
  if (!areStringListsEqual(normalisedA.tags ?? null, normalisedB.tags ?? null)) {
    return false;
  }
  if (!areStringListsEqual(normalisedA.notes ?? null, normalisedB.notes ?? null)) {
    return false;
  }
  return true;
}

function arePrepositionAttributesEqual(
  a: PrepositionAttributes | null,
  b: PrepositionAttributes | null,
): boolean {
  const normalisedA = normalisePrepositionAttributes(a);
  const normalisedB = normalisePrepositionAttributes(b);
  if (!normalisedA && !normalisedB) {
    return true;
  }
  if (!normalisedA || !normalisedB) {
    return false;
  }
  if (!areStringListsEqual(normalisedA.cases ?? null, normalisedB.cases ?? null)) {
    return false;
  }
  if (!areStringListsEqual(normalisedA.notes ?? null, normalisedB.notes ?? null)) {
    return false;
  }
  return true;
}

function areStringListsEqual(a: string[] | null | undefined, b: string[] | null | undefined): boolean {
  const normalisedA = normalizeStringList(a ?? []);
  const normalisedB = normalizeStringList(b ?? []);
  if (normalisedA.length !== normalisedB.length) {
    return false;
  }
  return normalisedA.every((value, index) => value === normalisedB[index]);
}

type GenderSelection = {
  value: string;
  source: string;
  suggestion: EnrichmentNounFormSuggestion;
};

type PluralSelection = {
  value: string;
  source: string;
  suggestion: EnrichmentNounFormSuggestion;
};

type AdjectiveSelection = {
  value: string;
  source: string;
  suggestion: EnrichmentAdjectiveFormSuggestion;
};

const GENDER_VALUE_MAP: Record<string, string> = {
  masculine: "der",
  feminine: "die",
  neuter: "das",
  m: "der",
  f: "die",
  n: "das",
};

function normaliseGenderValue(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const trimmed = value.trim().toLowerCase();
  if (!trimmed) return undefined;
  if (trimmed === "der" || trimmed === "die" || trimmed === "das") {
    return trimmed;
  }
  return GENDER_VALUE_MAP[trimmed];
}

function collectGenderHintsFromForms(forms: EnrichmentNounFormSuggestion["forms"]): string[] {
  const results: string[] = [];
  if (!forms) return results;
  for (const form of forms) {
    for (const tag of form.tags ?? []) {
      const gender = normaliseGenderValue(tag);
      if (gender) {
        results.push(gender);
      }
    }
  }
  return results;
}

function pickPreferredGenderCandidate(
  suggestions: EnrichmentNounFormSuggestion[],
): GenderSelection | undefined {
  const preference = ["der", "die", "das"];
  for (const suggestion of suggestions) {
    const collected = new Set<string>();
    for (const gender of suggestion.genders ?? []) {
      const normalised = normaliseGenderValue(gender);
      if (normalised) {
        collected.add(normalised);
      }
    }
    for (const gender of collectGenderHintsFromForms(suggestion.forms)) {
      collected.add(gender);
    }
    if (!collected.size) {
      continue;
    }
    for (const target of preference) {
      if (collected.has(target)) {
        return { value: target, source: suggestion.source, suggestion };
      }
    }
    const [first] = Array.from(collected.values()).sort();
    if (first) {
      return { value: first, source: suggestion.source, suggestion };
    }
  }
  return undefined;
}

function pickPreferredPluralCandidate(
  suggestions: EnrichmentNounFormSuggestion[],
): PluralSelection | undefined {
  type Candidate = { value: string; priority: number; suggestion: EnrichmentNounFormSuggestion };
  const candidates: Candidate[] = [];

  for (const suggestion of suggestions) {
    for (const plural of suggestion.plurals ?? []) {
      const trimmed = plural.trim();
      if (!trimmed) continue;
      candidates.push({ value: trimmed, priority: 2, suggestion });
    }
    for (const form of suggestion.forms ?? []) {
      if (!form.form?.trim()) continue;
      if (!form.tags?.some((tag) => tag.includes("plural"))) continue;
      const tags = form.tags.map((tag) => tag.toLowerCase());
      let priority = 1;
      if (tags.some((tag) => tag.includes("nominative"))) {
        priority = 0;
      }
      candidates.push({ value: form.form.trim(), priority, suggestion });
    }
  }

  if (!candidates.length) {
    return undefined;
  }

  candidates.sort((a, b) => {
    if (a.priority !== b.priority) {
      return a.priority - b.priority;
    }
    return a.value.localeCompare(b.value);
  });

  const best = candidates[0];
  return { value: best.value, source: best.suggestion.source, suggestion: best.suggestion };
}

function pickPreferredAdjectiveCandidate(
  suggestions: EnrichmentAdjectiveFormSuggestion[],
  field: "comparative" | "superlative",
): AdjectiveSelection | undefined {
  for (const suggestion of suggestions) {
    const values = new Set<string>();
    const direct = field === "comparative" ? suggestion.comparatives : suggestion.superlatives;
    for (const value of direct ?? []) {
      const trimmed = value.trim();
      if (trimmed) {
        values.add(trimmed);
      }
    }
    for (const form of suggestion.forms ?? []) {
      if (!form.form?.trim()) continue;
      if (form.tags?.some((tag) => tag.toLowerCase().includes(field))) {
        values.add(form.form.trim());
      }
    }
    if (!values.size) {
      continue;
    }
    const [best] = Array.from(values.values()).sort();
    if (best) {
      return { value: best, source: suggestion.source, suggestion };
    }
  }
  return undefined;
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
  const exampleEn = patch.exampleEn ?? word.exampleEn;
  const mergedExamples = patch.examples ?? word.examples ?? [];
  const hasExamplePair = Boolean(
    exampleDe?.trim() && exampleEn?.trim()
    || mergedExamples.some((entry) => entry?.exampleDe?.trim() && entry?.exampleEn?.trim()),
  );
  if (isBlank(english)) {
    return false;
  }
  if (!hasExamplePair) {
    return false;
  }
  const gender = patch.gender ?? word.gender;
  const plural = patch.plural ?? word.plural;
  const praeteritum = patch.praeteritum ?? word.praeteritum;
  const partizipIi = patch.partizipIi ?? word.partizipIi;
  const perfekt = patch.perfekt ?? word.perfekt;
  const comparative = patch.comparative ?? word.comparative;
  const superlative = patch.superlative ?? word.superlative;

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
