import type { PartOfSpeech } from "./types.js";

export type EnrichmentField =
  | "english"
  | "exampleDe"
  | "exampleEn"
  | "sourcesCsv"
  | "complete"
  | "praeteritum"
  | "partizipIi"
  | "perfekt"
  | "aux";

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
}

export type EnrichmentProviderId =
  | "wiktionary"
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
  wiktionarySummary?: string;
  verbForms: EnrichmentVerbFormSuggestion[];
  providerDiagnostics: EnrichmentProviderDiagnostic[];
}

export interface EnrichmentWordSummary {
  id: number;
  lemma: string;
  pos: PartOfSpeech | string;
  missingFields: string[];
  translation?: EnrichmentTranslationCandidate;
  englishHints?: string[];
  synonyms: string[];
  wiktionarySummary?: string;
  example?: EnrichmentExampleCandidate;
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
  aux: "haben" | "sein" | null;
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
