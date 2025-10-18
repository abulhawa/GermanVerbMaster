import { readFile } from "node:fs/promises";
import path from "node:path";

import { and, eq } from "drizzle-orm";
import { z } from "zod";

import { getDb, getPool } from "@db/client";
import { enrichmentProviderSnapshots, words } from "@db/schema";
import type {
  EnrichmentAdjectiveFormSuggestion,
  EnrichmentNounFormEntry,
  EnrichmentNounFormSuggestion,
  EnrichmentPrepositionSuggestion,
  EnrichmentVerbFormSuggestion,
  EnrichmentWordSummary,
} from "@shared/enrichment";
import type { WordExample, WordPosAttributes, WordTranslation } from "@shared/types";
import {
  canonicalizeExamples,
  examplesEqual,
  normalizeWordExample,
  normalizeWordExamples,
} from "@shared/examples";

import { buildProviderSnapshotFromRecord, WordRecord } from "./pipeline";
import { persistProviderSnapshotToFile } from "./storage";
import { writeWordsBackupToDisk } from "./backup";

type WordPatch = Partial<
  Pick<
    WordRecord,
    | "english"
    | "exampleDe"
    | "exampleEn"
    | "complete"
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
    | "updatedAt"
    | "enrichmentAppliedAt"
    | "enrichmentMethod"
  >
>;

interface NormalizedEntry {
  lemma: string;
  pos: string;
  applyMode: "merge" | "replace";
  english?: string;
  englishHints?: string[];
  synonyms?: string[];
  translations?: WordTranslation[] | null;
  examples?: WordExample[] | null;
  exampleDe?: string;
  exampleEn?: string;
  verbForms?: EnrichmentVerbFormSuggestion[] | null;
  nounForms?: EnrichmentNounFormSuggestion[] | null;
  adjectiveForms?: EnrichmentAdjectiveFormSuggestion[] | null;
  prepositionAttributes?: EnrichmentPrepositionSuggestion[] | null;
  gender?: string;
  plural?: string;
  comparative?: string;
  superlative?: string;
  praeteritum?: string;
  partizipIi?: string;
  perfekt?: string;
  aux?: "haben" | "sein" | "haben / sein" | null;
  posAttributes?: WordPosAttributes | null;
  metadata?: Record<string, unknown> | null;
  raw: unknown;
}

interface ImportOptions {
  providerId: string;
  providerLabel: string;
  inputPath: string;
  skipBackups: boolean;
  mode: "approved" | "pending" | "all";
}

const translationSchema = z
  .union([
    z
      .string()
      .min(1)
      .transform((value) => ({ value, source: undefined, language: undefined, confidence: undefined })),
    z.object({
      value: z.string().min(1),
      language: z.string().min(1).optional(),
      source: z.string().min(1).optional(),
      confidence: z.number().optional(),
    }),
  ])
      .transform(({ value, language, source, confidence }) => ({
        value: value.trim(),
        language: language?.trim() || undefined,
        source: source?.trim() || undefined,
        confidence: typeof confidence === "number" ? confidence : undefined,
      }));

type TranslationInput = z.infer<typeof translationSchema>;

const exampleSchema = z
  .object({
    sentence: z.string().min(1).optional(),
    exampleDe: z.string().min(1).optional(),
    exampleEn: z.string().min(1).optional(),
    translations: z
      .record(z.string().min(1), z.union([z.string().min(1), z.null()]).optional())
      .optional(),
  })
  .transform((value) => {
    const sentence = value.sentence?.trim() || value.exampleDe?.trim() || undefined;
    const translations =
      value.translations && typeof value.translations === "object"
        ? Object.fromEntries(
            Object.entries(value.translations)
              .map(([language, text]) => {
                const normalizedLanguage = language.trim().toLowerCase();
                if (!normalizedLanguage) {
                  return undefined;
                }
                const normalizedText = typeof text === "string" ? text.trim() : undefined;
                if (!normalizedText) {
                  return undefined;
                }
                return [normalizedLanguage, normalizedText] as const;
              })
              .filter((entry): entry is readonly [string, string] => Boolean(entry)),
          )
        : value.exampleEn
          ? { en: value.exampleEn.trim() }
          : undefined;
    return {
      sentence: sentence ?? undefined,
      translations: translations ?? undefined,
    };
  });

const verbFormSchema = z.object({
  source: z.string().min(1).optional(),
  praeteritum: z.string().min(1).optional(),
  partizipIi: z.string().min(1).optional(),
  perfekt: z.string().min(1).optional(),
  aux: z.string().min(1).optional(),
  auxiliaries: z.array(z.string().min(1)).optional(),
  perfektOptions: z.array(z.string().min(1)).optional(),
});

const nounFormSchema = z.object({
  source: z.string().min(1).optional(),
  genders: z.array(z.string().min(1)).optional(),
  plurals: z.array(z.string().min(1)).optional(),
  forms: z
    .array(
      z.object({
        form: z.string().min(1),
        tags: z.array(z.string().min(1)).optional(),
      }),
    )
    .optional(),
});

const adjectiveFormSchema = z.object({
  source: z.string().min(1).optional(),
  comparatives: z.array(z.string().min(1)).optional(),
  superlatives: z.array(z.string().min(1)).optional(),
  forms: z
    .array(
      z.object({
        form: z.string().min(1),
        tags: z.array(z.string().min(1)).optional(),
      }),
    )
    .optional(),
});

const prepositionSchema = z.object({
  source: z.string().min(1),
  cases: z.array(z.string().min(1)).optional(),
  notes: z.array(z.string().min(1)).optional(),
});

type NounFormInput = z.infer<typeof nounFormSchema>;
type AdjectiveFormInput = z.infer<typeof adjectiveFormSchema>;

const entrySchema = z
  .object({
    lemma: z.string().min(1),
    pos: z.string().min(1),
    applyMode: z.enum(["merge", "replace"]).optional(),
    english: z.string().min(1).optional(),
    englishHints: z.array(z.string().min(1)).optional(),
    synonyms: z.array(z.string().min(1)).optional(),
    translations: z.array(translationSchema).optional(),
    examples: z.array(exampleSchema).optional(),
    exampleDe: z.string().min(1).optional(),
    exampleEn: z.string().min(1).optional(),
    verbForms: z.array(verbFormSchema).optional(),
    nounForms: z.array(nounFormSchema).optional(),
    adjectiveForms: z.array(adjectiveFormSchema).optional(),
    prepositionAttributes: z.array(prepositionSchema).optional(),
    gender: z.string().min(1).optional(),
    plural: z.string().min(1).optional(),
    comparative: z.string().min(1).optional(),
    superlative: z.string().min(1).optional(),
    praeteritum: z.string().min(1).optional(),
    partizipIi: z.string().min(1).optional(),
    perfekt: z.string().min(1).optional(),
    aux: z.string().min(1).optional(),
    posAttributes: z.record(z.string(), z.any()).optional(),
    metadata: z.record(z.string(), z.any()).optional(),
  })
  .transform((value) => ({
    ...value,
    lemma: value.lemma.trim(),
    pos: normalisePosValue(value.pos),
    applyMode: value.applyMode ?? undefined,
  }));

type ParsedEntry = z.infer<typeof entrySchema>;
type EntryWithMode = ParsedEntry & { applyMode: "merge" | "replace" };

const importSchema = z
  .object({
    providerId: z.string().min(1).default("manual"),
    providerLabel: z.string().min(1).default("Manual Import"),
    mode: z.enum(["approved", "pending", "all"]).default("approved"),
    applyMode: z.enum(["merge", "replace"]).optional(),
    entries: z.array(entrySchema),
  })
  .or(z.array(entrySchema).transform((entries) => ({
    providerId: "manual",
    providerLabel: "Manual Import",
    mode: "approved" as const,
    applyMode: undefined,
    entries,
  })));

interface EnrichmentResult {
  wordId: number;
  lemma: string;
  pos: string;
  summary: EnrichmentWordSummary;
}

function parseArgs(argv: string[]): ImportOptions {
  let providerId: string | undefined;
  let providerLabel: string | undefined;
  let inputPath: string | undefined;
  let skipBackups = false;
  let mode: ImportOptions["mode"] = "approved";

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (!arg) {
      continue;
    }
    switch (arg) {
      case "--file":
      case "-f":
        inputPath = argv.at(index + 1);
        index += 1;
        break;
      case "--provider-id":
        providerId = argv.at(index + 1) ?? providerId;
        index += 1;
        break;
      case "--provider-label":
        providerLabel = argv.at(index + 1) ?? providerLabel;
        index += 1;
        break;
      case "--mode":
        mode = normaliseMode(argv.at(index + 1));
        index += 1;
        break;
      case "--skip-backups":
        skipBackups = true;
        break;
      case "--help":
      case "-h":
        printUsageAndExit(0);
        break;
      default:
        if (!arg.startsWith("-") && !inputPath) {
          inputPath = arg;
        } else {
          console.warn(`Ignoring unknown argument: ${arg}`);
        }
    }
  }

  if (!inputPath) {
    console.error("Missing input file. Provide --file <path> or positional JSON path.");
    printUsageAndExit(1);
  }

  return {
    providerId: providerId?.trim() || "manual",
    providerLabel: providerLabel?.trim() || "Manual Import",
    inputPath: path.resolve(process.cwd(), inputPath),
    skipBackups,
    mode,
  };
}

function printUsageAndExit(code: number): never {
  console.log(
    [
      "Usage: npm run enrichment:import -- --file ./path/to/import.json [--provider-id manual] [--provider-label \"Manual Import\"]",
      "",
      "Options:",
      "  --file, -f           Path to the JSON file containing enrichment entries.",
      "  --provider-id        Identifier to use for stored snapshots (default: manual).",
      "  --provider-label     Label to use for stored snapshots (default: Manual Import).",
      "  --mode               Snapshot mode: approved | pending | all (default: approved).",
      "  --skip-backups       Skip regenerating data/enrichment/backups/words-*.json after import.",
      "  --help               Show this message.",
    ].join("\n"),
  );
  process.exit(code);
}

function normaliseMode(value: string | undefined): ImportOptions["mode"] {
  switch (value?.trim().toLowerCase()) {
    case "pending":
    case "non-canonical":
      return "pending";
    case "all":
      return "all";
    case "approved":
    case "canonical":
    default:
      return "approved";
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

function normalisePosValue(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) {
    throw new Error("Part of speech value cannot be blank.");
  }
  const lower = trimmed.toLowerCase();
  const alias = POS_FILTER_ALIASES[lower] ?? POS_FILTER_ALIASES[stripDiacritics(lower)];
  if (alias) {
    return alias;
  }
  if (trimmed.length === 1) {
    return trimmed.toUpperCase();
  }
  if (trimmed.length <= 4) {
    return `${trimmed[0]!.toUpperCase()}${trimmed.slice(1)}`;
  }
  return trimmed;
}

function normaliseAux(value: string | undefined): "haben" | "sein" | "haben / sein" | null {
  if (!value) {
    return null;
  }
  const normalized = value.trim().toLowerCase();
  if (!normalized) {
    return null;
  }
  if (normalized === "haben") {
    return "haben";
  }
  if (normalized === "sein") {
    return "sein";
  }
  if (normalized.replace(/\s+/g, "") === "habensein") {
    return "haben / sein";
  }
  if (normalized.includes("haben") && normalized.includes("sein")) {
    return "haben / sein";
  }
  return null;
}

function isBlank(value: string | null | undefined): boolean {
  return value === undefined || value === null || !value.trim();
}

function normaliseTranslations(
  translations: TranslationInput[] | null | undefined,
): WordTranslation[] | null {
  if (!translations || !Array.isArray(translations) || translations.length === 0) {
    return null;
  }
  const seen = new Set<string>();
  const records: WordTranslation[] = [];
  for (const entry of translations) {
    const value = entry.value?.trim();
    if (!value) continue;
    const source = entry.source?.trim() ?? null;
    const language = entry.language?.trim() ?? null;
    const confidence =
      typeof entry.confidence === "number" && Number.isFinite(entry.confidence)
        ? entry.confidence
        : null;
    const key = `${value.toLowerCase()}::${(source ?? "").toLowerCase()}::${(language ?? "").toLowerCase()}::${confidence ?? ""}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    records.push({ value, source, language, confidence });
  }
  return records.length ? records : null;
}

function normaliseExamples(examples: WordExample[] | null | undefined): WordExample[] | null {
  if (!examples || examples.length === 0) {
    return null;
  }
  const canonical = canonicalizeExamples(examples);
  return canonical.length ? canonical : null;
}

function resolveEnglish(
  entryEnglish: string | undefined,
  translations: WordTranslation[] | null | undefined,
): string | null {
  if (entryEnglish && entryEnglish.trim()) {
    return entryEnglish.trim();
  }
  if (!translations) {
    return null;
  }
  for (const translation of translations) {
    const language = translation.language?.trim().toLowerCase();
    if (!language || language === "en" || language === "eng" || language === "english") {
      return translation.value;
    }
  }
  return null;
}

function selectPrimaryExample(examples: WordExample[] | null | undefined): WordExample | null {
  if (!examples) {
    return null;
  }
  for (const entry of examples) {
    if (!entry) continue;
    const normalized = normalizeWordExample(entry);
    if (normalized?.sentence && normalized?.translations?.en) {
      return normalized;
    }
  }
  for (const entry of examples) {
    const normalized = normalizeWordExample(entry);
    if (normalized?.sentence) {
      return normalized;
    }
  }
  return examples.length ? normalizeWordExample(examples[0]) : null;
}

function buildEntry(input: EntryWithMode): NormalizedEntry {
  const translations = normaliseTranslations(input.translations ?? null);
  const exampleArray =
    input.examples?.map((entry) => ({
      sentence: entry.sentence ?? undefined,
      translations: entry.translations ?? undefined,
    })) ?? [];
  const normalizedExamples = exampleArray.length ? normaliseExamples(exampleArray) : null;

  const exampleFromFields =
    input.exampleDe || input.exampleEn
      ? normalizeWordExamples([
          {
            sentence: input.exampleDe,
            translations: input.exampleEn ? { en: input.exampleEn } : undefined,
          },
        ])
      : null;

  const mergedExamples = normalizedExamples ?? exampleFromFields;
  const primaryExample = selectPrimaryExample(mergedExamples ?? exampleFromFields ?? null);

  const aux = normaliseAux(input.aux);

  const englishHints = normalizeStringArray(input.englishHints);
  const synonyms = normalizeStringArray(input.synonyms);
  const nounForms = normaliseNounForms(input.nounForms);
  const adjectiveForms = normaliseAdjectiveForms(input.adjectiveForms);
  const prepositions: EnrichmentPrepositionSuggestion[] = [];
  for (const entry of input.prepositionAttributes ?? []) {
    const source = entry.source.trim();
    if (!source) {
      continue;
    }
    const cases = normalizeStringArray(entry.cases);
    const notes = normalizeStringArray(entry.notes);
    if ((!cases || cases.length === 0) && (!notes || notes.length === 0)) {
      continue;
    }
    prepositions.push({
      source,
      cases: cases ?? undefined,
      notes: notes ?? undefined,
    });
  }
  const prepositionAttributes = prepositions.length ? prepositions : null;

  return {
    lemma: input.lemma,
    pos: input.pos,
    applyMode: input.applyMode,
    english: input.english?.trim(),
    englishHints: englishHints ?? undefined,
    synonyms: synonyms ?? undefined,
    translations,
    examples: mergedExamples,
    exampleDe: input.exampleDe ?? primaryExample?.sentence ?? undefined,
    exampleEn:
      input.exampleEn ??
      primaryExample?.translations?.en ??
      primaryExample?.translations?.["english"] ??
      undefined,
    verbForms: normaliseVerbForms(input.verbForms),
    nounForms,
    adjectiveForms,
    prepositionAttributes,
    gender: input.gender?.trim(),
    plural: input.plural?.trim(),
    comparative: input.comparative?.trim(),
    superlative: input.superlative?.trim(),
    praeteritum: input.praeteritum?.trim(),
    partizipIi: input.partizipIi?.trim(),
    perfekt: input.perfekt?.trim(),
    aux,
    posAttributes: (input.posAttributes as WordPosAttributes | undefined) ?? null,
    metadata: input.metadata ?? null,
    raw: input,
  };
}

function normaliseVerbForms(
  forms: z.infer<typeof verbFormSchema>[] | undefined,
): EnrichmentVerbFormSuggestion[] | null {
  if (!forms || forms.length === 0) {
    return null;
  }
  const normalized: EnrichmentVerbFormSuggestion[] = [];
  for (const form of forms) {
    const aux = normaliseAux(form.aux);
    const praeteritum = form.praeteritum?.trim();
    const partizipIi = form.partizipIi?.trim();
    const perfekt = form.perfekt?.trim();
    const auxiliaries = form.auxiliaries?.map((entry) => entry.trim()).filter(Boolean);
    const perfektOptions = form.perfektOptions?.map((entry) => entry.trim()).filter(Boolean);
    const hasContent =
      praeteritum || partizipIi || perfekt || aux || (auxiliaries && auxiliaries.length) || (perfektOptions && perfektOptions.length);
    if (!hasContent) {
      continue;
    }
    normalized.push({
      source: form.source?.trim() || "manual",
      praeteritum: praeteritum || undefined,
      partizipIi: partizipIi || undefined,
      perfekt: perfekt || undefined,
      aux: aux ?? undefined,
      auxiliaries: auxiliaries && auxiliaries.length ? auxiliaries : undefined,
      perfektOptions: perfektOptions && perfektOptions.length ? perfektOptions : undefined,
    });
  }
  return normalized.length ? normalized : null;
}

function normalizeStringArray(values: string[] | undefined): string[] | undefined {
  if (!values || values.length === 0) {
    return undefined;
  }
  const normalized = Array.from(
    new Set(values.map((entry) => entry.trim()).filter((entry) => entry.length > 0)),
  );
  return normalized.length ? normalized : undefined;
}

function translationKey(translation: WordTranslation): string {
  const value = translation.value.trim().toLowerCase();
  const language = translation.language?.trim().toLowerCase() ?? "";
  const source = translation.source?.trim().toLowerCase() ?? "";
  const confidence =
    typeof translation.confidence === "number" && Number.isFinite(translation.confidence)
      ? translation.confidence
      : null;
  return JSON.stringify([value, language, source, confidence]);
}

function areTranslationsEqual(
  a: WordTranslation[] | null | undefined,
  b: WordTranslation[] | null | undefined,
): boolean {
  const left = (a ?? []).map(translationKey);
  const right = (b ?? []).map(translationKey);
  if (left.length !== right.length) {
    return false;
  }
  for (let index = 0; index < left.length; index += 1) {
    if (left[index] !== right[index]) {
      return false;
    }
  }
  return true;
}

function mergeTranslations(
  existing: WordTranslation[] | null | undefined,
  additions: WordTranslation[],
): WordTranslation[] {
  const result: WordTranslation[] = [];
  const seen = new Set<string>();

  for (const translation of existing ?? []) {
    const key = translationKey(translation);
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    result.push(translation);
  }

  for (const translation of additions) {
    const key = translationKey(translation);
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    result.push(translation);
  }

  return result;
}

function exampleKey(example: WordExample): string {
  const sentence = (example.sentence ?? "").trim().toLowerCase();
  const translations = example.translations
    ? Object.entries(example.translations)
        .filter(
          (entry): entry is [string, string] =>
            typeof entry[0] === "string" && typeof entry[1] === "string" && entry[1].length > 0,
        )
        .map(([language, value]) => [language.trim().toLowerCase(), value.trim()])
        .sort((a, b) => a[0].localeCompare(b[0]))
    : [];
  return JSON.stringify([sentence, translations]);
}

function mergeExamples(
  existing: WordExample[] | null | undefined,
  additions: WordExample[],
): WordExample[] {
  const existingCanonical = canonicalizeExamples(existing ?? []);
  const additionsCanonical = canonicalizeExamples(additions ?? []);

  const seen = new Set<string>();
  const result: WordExample[] = [];

  for (const example of existingCanonical) {
    const key = exampleKey(example);
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    result.push(example);
  }

  for (const example of additionsCanonical) {
    const key = exampleKey(example);
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    result.push(example);
  }

  return result;
}

function normaliseNounForms(forms: NounFormInput[] | undefined): EnrichmentNounFormSuggestion[] | null {
  if (!forms || forms.length === 0) {
    return null;
  }
  const normalized: EnrichmentNounFormSuggestion[] = [];
  for (const form of forms) {
    const genders = normalizeStringArray(form.genders);
    const plurals = normalizeStringArray(form.plurals);
    const mappedForms: EnrichmentNounFormEntry[] = [];
    for (const candidate of form.forms ?? []) {
      const normalisedForm = candidate.form.trim();
      if (!normalisedForm) {
        continue;
      }
      const tags = normalizeStringArray(candidate.tags) ?? [];
      mappedForms.push({ form: normalisedForm, tags });
    }
    if (
      !genders?.length
      && !plurals?.length
      && mappedForms.length === 0
    ) {
      continue;
    }
    normalized.push({
      source: form.source?.trim() || "manual",
      genders: genders ?? undefined,
      plurals: plurals ?? undefined,
      forms: mappedForms.length ? mappedForms : undefined,
    });
  }
  return normalized.length ? normalized : null;
}

function normaliseAdjectiveForms(
  forms: AdjectiveFormInput[] | undefined,
): EnrichmentAdjectiveFormSuggestion[] | null {
  if (!forms || forms.length === 0) {
    return null;
  }
  const normalized: EnrichmentAdjectiveFormSuggestion[] = [];
  for (const form of forms) {
    const comparatives = normalizeStringArray(form.comparatives);
    const superlatives = normalizeStringArray(form.superlatives);
    const mappedForms: EnrichmentNounFormEntry[] = [];
    for (const candidate of form.forms ?? []) {
      const normalisedForm = candidate.form.trim();
      if (!normalisedForm) {
        continue;
      }
      const tags = normalizeStringArray(candidate.tags) ?? [];
      mappedForms.push({ form: normalisedForm, tags });
    }
    if (
      !comparatives?.length
      && !superlatives?.length
      && mappedForms.length === 0
    ) {
      continue;
    }
    normalized.push({
      source: form.source?.trim() || "manual",
      comparatives: comparatives ?? undefined,
      superlatives: superlatives ?? undefined,
      forms: mappedForms.length ? mappedForms : undefined,
    });
  }
  return normalized.length ? normalized : null;
}

function computeCompleteness(word: WordRecord, patch: WordPatch): boolean {
  const english = patch.english ?? word.english;
  const exampleDe = patch.exampleDe ?? word.exampleDe;
  const exampleEn = patch.exampleEn ?? word.exampleEn;
  const mergedExamples = patch.examples ?? word.examples ?? [];
  const hasExamplePair = Boolean(
    exampleDe?.trim() && exampleEn?.trim()
      || mergedExamples.some((entry) => entry?.sentence?.trim() && entry?.translations?.en?.trim()),
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

async function loadAndValidateEntries(filePath: string): Promise<{
  providerId: string;
  providerLabel: string;
  mode: ImportOptions["mode"];
  entries: NormalizedEntry[];
}> {
  const payload = await readFile(filePath, "utf8");
  let parsed: unknown;
  try {
    parsed = JSON.parse(payload);
  } catch (error) {
    throw new Error(`Failed to parse JSON at ${filePath}: ${error instanceof Error ? error.message : String(error)}`);
  }

  const validated = importSchema.parse(parsed);
  const defaultApplyMode = validated.applyMode ?? "merge";
  const entries = validated.entries.map((entry) =>
    buildEntry({
      ...entry,
      applyMode: entry.applyMode ?? defaultApplyMode,
    }),
  );

  return {
    providerId: validated.providerId,
    providerLabel: validated.providerLabel,
    mode: validated.mode,
    entries,
  };
}

async function enrichWord(
  entry: NormalizedEntry,
  options: ImportOptions,
): Promise<EnrichmentResult> {
  const database = getDb();
  const word = await database.query.words.findFirst({
    where: (fields, operators) =>
      operators.and(eq(fields.lemma, entry.lemma), eq(fields.pos, entry.pos)),
  });

  if (!word) {
    throw new Error(`Word not found for lemma="${entry.lemma}" pos="${entry.pos}"`);
  }

  const allowReplace = entry.applyMode === "replace";
  const translationAdditions = entry.translations ?? null;
  const exampleAdditions = entry.examples ?? null;
  const englishCandidate = resolveEnglish(entry.english, translationAdditions);

  const patch: WordPatch = {};
  let hasChanges = false;

  if (translationAdditions && translationAdditions.length > 0) {
    const existingTranslations = word.translations ?? [];
    const mergedTranslations = allowReplace
      ? translationAdditions
      : mergeTranslations(existingTranslations, translationAdditions);
    const normalizedMergedTranslations = mergedTranslations.length ? mergedTranslations : null;
    if (!areTranslationsEqual(existingTranslations, normalizedMergedTranslations)) {
      patch.translations = normalizedMergedTranslations;
      hasChanges = true;
    }
  }

  if (englishCandidate && (allowReplace || isBlank(word.english))) {
    const currentEnglish = (word.english ?? "").trim();
    if (currentEnglish !== englishCandidate) {
      patch.english = englishCandidate;
      hasChanges = true;
    }
  }

  if (exampleAdditions && exampleAdditions.length > 0) {
    const existingExamples = word.examples ?? [];
    const mergedExamples = allowReplace ? exampleAdditions : mergeExamples(existingExamples, exampleAdditions);
    const normalizedMergedExamples = mergedExamples.length ? mergedExamples : null;
    if (!examplesEqual(existingExamples, normalizedMergedExamples)) {
      patch.examples = normalizedMergedExamples;
      hasChanges = true;
    }
  }

  if (entry.exampleDe && (allowReplace || isBlank(word.exampleDe))) {
    const currentExampleDe = (word.exampleDe ?? "").trim();
    if (currentExampleDe !== entry.exampleDe) {
      patch.exampleDe = entry.exampleDe;
      hasChanges = true;
    }
  }

  if (entry.exampleEn && (allowReplace || isBlank(word.exampleEn))) {
    const currentExampleEn = (word.exampleEn ?? "").trim();
    if (currentExampleEn !== entry.exampleEn) {
      patch.exampleEn = entry.exampleEn;
      hasChanges = true;
    }
  }

  if (entry.praeteritum && (allowReplace || isBlank(word.praeteritum))) {
    const currentValue = (word.praeteritum ?? "").trim();
    if (currentValue !== entry.praeteritum) {
      patch.praeteritum = entry.praeteritum;
      hasChanges = true;
    }
  }

  if (entry.partizipIi && (allowReplace || isBlank(word.partizipIi))) {
    const currentValue = (word.partizipIi ?? "").trim();
    if (currentValue !== entry.partizipIi) {
      patch.partizipIi = entry.partizipIi;
      hasChanges = true;
    }
  }

  if (entry.perfekt && (allowReplace || isBlank(word.perfekt))) {
    const currentValue = (word.perfekt ?? "").trim();
    if (currentValue !== entry.perfekt) {
      patch.perfekt = entry.perfekt;
      hasChanges = true;
    }
  }

  if (entry.aux && (allowReplace || isBlank(word.aux))) {
    const currentValue = (word.aux ?? "").trim();
    if (currentValue !== entry.aux) {
      patch.aux = entry.aux;
      hasChanges = true;
    }
  }

  if (entry.gender && (allowReplace || isBlank(word.gender))) {
    const currentValue = (word.gender ?? "").trim();
    if (currentValue !== entry.gender) {
      patch.gender = entry.gender;
      hasChanges = true;
    }
  }

  if (entry.plural && (allowReplace || isBlank(word.plural))) {
    const currentValue = (word.plural ?? "").trim();
    if (currentValue !== entry.plural) {
      patch.plural = entry.plural;
      hasChanges = true;
    }
  }

  if (entry.comparative && (allowReplace || isBlank(word.comparative))) {
    const currentValue = (word.comparative ?? "").trim();
    if (currentValue !== entry.comparative) {
      patch.comparative = entry.comparative;
      hasChanges = true;
    }
  }

  if (entry.superlative && (allowReplace || isBlank(word.superlative))) {
    const currentValue = (word.superlative ?? "").trim();
    if (currentValue !== entry.superlative) {
      patch.superlative = entry.superlative;
      hasChanges = true;
    }
  }

  if (entry.posAttributes && (allowReplace || !word.posAttributes)) {
    const currentValue = word.posAttributes ?? null;
    const replacement = entry.posAttributes;
    if (allowReplace || JSON.stringify(currentValue) !== JSON.stringify(replacement)) {
      patch.posAttributes = replacement;
      hasChanges = true;
    }
  }

  const nextComplete = computeCompleteness(word, patch);
  if (nextComplete !== word.complete) {
    patch.complete = nextComplete;
    hasChanges = true;
  }

  const summary: EnrichmentWordSummary = {
    id: word.id,
    lemma: word.lemma,
    pos: word.pos,
    missingFields: [],
    translations: translationAdditions ?? undefined,
    translation: translationAdditions?.[0]
      ? {
          value: translationAdditions[0].value,
          source: translationAdditions[0].source ?? "",
          language: translationAdditions[0].language ?? undefined,
          confidence: translationAdditions[0].confidence ?? undefined,
        }
      : undefined,
    englishHints: entry.englishHints ?? undefined,
    synonyms: entry.synonyms ?? [],
    example: exampleAdditions?.[0]
      ? {
          sentence: exampleAdditions[0].sentence ?? undefined,
          translations: exampleAdditions[0].translations ?? undefined,
          source: options.providerId,
        }
      : undefined,
    examples: exampleAdditions ?? undefined,
    verbForms: entry.verbForms?.[0],
    nounForms: entry.nounForms?.[0],
    adjectiveForms: entry.adjectiveForms?.[0],
    prepositionAttributes: entry.prepositionAttributes?.[0],
    posAttributes: entry.posAttributes ?? null,
    updates: [],
    applied: hasChanges,
    sources: [options.providerId],
    errors: [],
    aiUsed: false,
  };

  if (!hasChanges) {
    return {
      wordId: word.id,
      lemma: word.lemma,
      pos: word.pos,
      summary,
    };
  }

  const appliedAt = new Date();
  patch.enrichmentAppliedAt = appliedAt;
  patch.enrichmentMethod = "manual_entry";
  patch.updatedAt = appliedAt;

  const snapshotPayload = {
    wordId: word.id,
    lemma: word.lemma,
    pos: word.pos,
    providerId: options.providerId,
    providerLabel: options.providerLabel,
    status: "success" as const,
    trigger: "apply" as const,
    mode: options.mode,
    translations: translationAdditions,
    examples: exampleAdditions,
    synonyms: entry.synonyms ?? null,
    englishHints: entry.englishHints ?? null,
    verbForms: entry.verbForms ?? null,
    nounForms: entry.nounForms ?? null,
    adjectiveForms: entry.adjectiveForms ?? null,
    prepositionAttributes: entry.prepositionAttributes ?? null,
    rawPayload: entry.raw,
  };

  const result = await database.transaction(async (tx) => {
    await tx
      .update(words)
      .set(patch)
      .where(and(eq(words.id, word.id), eq(words.pos, word.pos)));

    const [snapshotRecord] = await tx
      .insert(enrichmentProviderSnapshots)
      .values({
        wordId: word.id,
        lemma: word.lemma,
        pos: word.pos,
        providerId: options.providerId,
        providerLabel: options.providerLabel,
        status: "success",
        error: null,
        trigger: "apply",
        mode: options.mode,
        translations: snapshotPayload.translations,
        examples: snapshotPayload.examples,
        synonyms: snapshotPayload.synonyms,
        englishHints: snapshotPayload.englishHints,
        verbForms: snapshotPayload.verbForms,
        nounForms: snapshotPayload.nounForms,
        adjectiveForms: snapshotPayload.adjectiveForms,
        prepositionAttributes: snapshotPayload.prepositionAttributes,
        rawPayload: snapshotPayload.rawPayload,
      })
      .returning();

    return buildProviderSnapshotFromRecord(snapshotRecord);
  });

  await persistProviderSnapshotToFile(result);

  return {
    wordId: word.id,
    lemma: word.lemma,
    pos: word.pos,
    summary,
  };
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  const { providerId, providerLabel, mode, entries } = await loadAndValidateEntries(options.inputPath);

  const resolvedOptions: ImportOptions = {
    providerId,
    providerLabel,
    mode,
    inputPath: options.inputPath,
    skipBackups: options.skipBackups,
  };

  const pool = getPool();

  try {
    if (!entries.length) {
      console.log("No enrichment entries found in input file.");
      return;
    }

    const results: EnrichmentResult[] = [];
    const failures: Array<{ entry: NormalizedEntry; error: unknown }> = [];

    for (const entry of entries) {
      try {
        const result = await enrichWord(entry, resolvedOptions);
        results.push(result);
        if (result.summary.applied) {
          console.log(`Applied enrichment for ${entry.lemma} (${entry.pos}).`);
        } else {
          console.log(`No changes applied for ${entry.lemma} (${entry.pos}); entry already up to date.`);
        }
      } catch (error) {
        failures.push({ entry, error });
        console.error(
          `Failed to apply enrichment for ${entry.lemma} (${entry.pos}): ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
    }

    const appliedCount = results.filter((result) => result.summary.applied).length;
    const skippedCount = results.length - appliedCount;

    if (appliedCount > 0 && !resolvedOptions.skipBackups) {
      const backupResult = await writeWordsBackupToDisk();
      console.log(
        `Wrote words backup to ${backupResult.summary.relativePath} (latest alias: ${backupResult.summary.latestRelativePath}).`,
      );
    }

    console.log(
      `Import complete. Applied: ${appliedCount}, Skipped: ${skippedCount}, Failed: ${failures.length}. Provider=${providerId} (${providerLabel}).`,
    );

    if (failures.length) {
      process.exitCode = 1;
    }
  } finally {
    await pool.end().catch((error) => {
      console.warn("Failed to close database pool cleanly:", error);
    });
  }
}

main().catch((error) => {
  console.error("Manual enrichment import failed:", error);
  process.exit(1);
});
