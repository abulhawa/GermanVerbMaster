import type { EnrichmentMethod, PartOfSpeech, WordExample, WordTranslation } from "./types.js";

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
}

export interface WordEnrichmentSuggestions {
  translations: EnrichmentTranslationCandidate[];
  examples: EnrichmentExampleCandidate[];
  synonyms: string[];
  englishHints: string[];
  verbForms: EnrichmentVerbFormSuggestion[];
  providerDiagnostics: EnrichmentProviderDiagnostic[];
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
