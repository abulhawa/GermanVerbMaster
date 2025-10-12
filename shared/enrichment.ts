import type {
  EnrichmentMethod,
  PartOfSpeech,
  WordExample,
  WordPosAttributes,
  WordTranslation,
} from "./types.js";

export type EnrichmentRunMode = "non-canonical" | "canonical" | "all";
export type EnrichmentSnapshotStatus = "success" | "error";
export type EnrichmentSnapshotTrigger = "preview" | "apply";

export type EnrichmentField =
  | "english"
  | "exampleDe"
  | "exampleEn"
  | "sourcesCsv"
  | "posAttributes"
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
  | "enrichmentAppliedAt"
  | "enrichmentMethod";

export interface EnrichmentFieldUpdate {
  field: EnrichmentField;
  previous: unknown;
  next: unknown;
  source?: string;
}

export interface EnrichmentTranslationCandidate {
  value: string;
  source: string;
  confidence?: number;
  language?: string;
}

export interface EnrichmentExampleCandidate {
  exampleDe?: string;
  exampleEn?: string;
  source: string;
}

export interface EnrichmentPrepositionSuggestion {
  source: string;
  cases?: string[];
  notes?: string[];
}

export interface EnrichmentVerbFormSuggestion {
  source: string;
  praeteritum?: string;
  partizipIi?: string;
  perfekt?: string;
  aux?: string;
  auxiliaries?: string[];
  perfektOptions?: string[];
}

export interface EnrichmentNounFormEntry {
  form: string;
  tags: string[];
}

export interface EnrichmentNounFormSuggestion {
  source: string;
  genders?: string[];
  plurals?: string[];
  forms?: EnrichmentNounFormEntry[];
}

export interface EnrichmentAdjectiveFormSuggestion {
  source: string;
  comparatives?: string[];
  superlatives?: string[];
  forms?: EnrichmentNounFormEntry[];
}

export type EnrichmentProviderId =
  | "openthesaurus"
  | "mymemory"
  | "tatoeba"
  | "wiktextract"
  | "openai";

export interface EnrichmentProviderDiagnostic {
  id: EnrichmentProviderId;
  label: string;
  status: "success" | "error" | "skipped";
  error?: string;
  payload?: unknown;
  currentSnapshot?: EnrichmentProviderSnapshot;
  previousSnapshot?: EnrichmentProviderSnapshot | null;
  hasChanges?: boolean;
}

export interface EnrichmentProviderSnapshot {
  id: number;
  wordId: number;
  lemma: string;
  pos: PartOfSpeech | string;
  providerId: EnrichmentProviderId | string;
  providerLabel?: string | null;
  status: EnrichmentSnapshotStatus;
  error?: string | null;
  trigger: EnrichmentSnapshotTrigger;
  mode: EnrichmentRunMode;
  translations?: WordTranslation[] | null;
  examples?: WordExample[] | null;
  synonyms?: string[] | null;
  englishHints?: string[] | null;
  verbForms?: EnrichmentVerbFormSuggestion[] | null;
  nounForms?: EnrichmentNounFormSuggestion[] | null;
  adjectiveForms?: EnrichmentAdjectiveFormSuggestion[] | null;
  prepositionAttributes?: EnrichmentPrepositionSuggestion[] | null;
  rawPayload?: unknown;
  collectedAt: string;
  createdAt: string;
}

export interface EnrichmentProviderSnapshotComparison {
  providerId: EnrichmentProviderId | string;
  providerLabel?: string | null;
  current: EnrichmentProviderSnapshot;
  previous?: EnrichmentProviderSnapshot | null;
  hasChanges: boolean;
}

export interface PersistedProviderEntry {
  lemma: string;
  pos: PartOfSpeech | string;
  providerId: EnrichmentProviderId | string;
  providerLabel?: string | null;
  status: EnrichmentSnapshotStatus;
  error?: string | null;
  collectedAt?: string | null;
  translations?: WordTranslation[] | null;
  examples?: WordExample[] | null;
  synonyms?: string[] | null;
  englishHints?: string[] | null;
  verbForms?: EnrichmentVerbFormSuggestion[] | null;
  nounForms?: EnrichmentNounFormSuggestion[] | null;
  adjectiveForms?: EnrichmentAdjectiveFormSuggestion[] | null;
  prepositionAttributes?: EnrichmentPrepositionSuggestion[] | null;
  rawPayload?: unknown;
  wordId?: number | null;
  metadata?: Record<string, unknown> | null;
}

export interface PersistedProviderFileMeta extends Record<string, unknown> {
  createdAt?: string;
  lastUpgradedAt?: string;
  previousSchemaVersions?: number[];
}

export interface PersistedProviderFile {
  schemaVersion?: number;
  providerId?: EnrichmentProviderId | string;
  providerLabel?: string | null;
  pos?: PartOfSpeech | string;
  updatedAt?: string;
  entries?: Record<string, PersistedProviderEntry>;
  meta?: PersistedProviderFileMeta | null;
}

export interface PersistedWordData {
  lemma: string;
  pos: PartOfSpeech | string;
  providers: PersistedProviderEntry[];
  updatedAt: string;
}

export interface WordEnrichmentSuggestions {
  translations: EnrichmentTranslationCandidate[];
  examples: EnrichmentExampleCandidate[];
  synonyms: string[];
  englishHints: string[];
  verbForms: EnrichmentVerbFormSuggestion[];
  nounForms: EnrichmentNounFormSuggestion[];
  adjectiveForms: EnrichmentAdjectiveFormSuggestion[];
  prepositionAttributes: EnrichmentPrepositionSuggestion[];
  providerDiagnostics: EnrichmentProviderDiagnostic[];
  snapshots: EnrichmentProviderSnapshotComparison[];
}

export interface EnrichmentWordSummary {
  id: number;
  lemma: string;
  pos: PartOfSpeech | string;
  missingFields: string[];
  translation?: EnrichmentTranslationCandidate;
  translations?: WordTranslation[];
  englishHints?: string[];
  synonyms: string[];
  example?: EnrichmentExampleCandidate;
  examples?: WordExample[];
  verbForms?: EnrichmentVerbFormSuggestion;
  nounForms?: EnrichmentNounFormSuggestion;
  adjectiveForms?: EnrichmentAdjectiveFormSuggestion;
  prepositionAttributes?: EnrichmentPrepositionSuggestion;
  posAttributes?: WordPosAttributes | null;
  updates: EnrichmentFieldUpdate[];
  applied: boolean;
  sources: string[];
  errors?: string[];
  aiUsed: boolean;
}

export type EnrichmentPatch = Partial<{
  english: string | null;
  exampleDe: string | null;
  exampleEn: string | null;
  sourcesCsv: string | null;
  complete: boolean;
  praeteritum: string | null;
  partizipIi: string | null;
  perfekt: string | null;
  aux: "haben" | "sein" | "haben / sein" | null;
  gender: string | null;
  plural: string | null;
  comparative: string | null;
  superlative: string | null;
  translations: WordTranslation[] | null;
  examples: WordExample[] | null;
  posAttributes: WordPosAttributes | null;
  enrichmentAppliedAt: string | null;
  enrichmentMethod: EnrichmentMethod | null;
}>; 

export interface WordEnrichmentPreview {
  summary: EnrichmentWordSummary;
  patch: EnrichmentPatch;
  hasUpdates: boolean;
  suggestions: WordEnrichmentSuggestions;
}

export interface BulkEnrichmentResponse {
  scanned: number;
  updated: number;
  words: EnrichmentWordSummary[];
}
