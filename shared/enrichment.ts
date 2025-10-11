import type {
  EnrichmentMethod,
  PartOfSpeech,
  WordExample,
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
  | "complete"
  | "praeteritum"
  | "partizipIi"
  | "perfekt"
  | "aux"
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

export interface EnrichmentVerbFormSuggestion {
  source: string;
  praeteritum?: string;
  partizipIi?: string;
  perfekt?: string;
  aux?: string;
  auxiliaries?: string[];
  perfektOptions?: string[];
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

export interface WordEnrichmentSuggestions {
  translations: EnrichmentTranslationCandidate[];
  examples: EnrichmentExampleCandidate[];
  synonyms: string[];
  englishHints: string[];
  verbForms: EnrichmentVerbFormSuggestion[];
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
  translations: WordTranslation[] | null;
  examples: WordExample[] | null;
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
