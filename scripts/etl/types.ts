import type {
  EnrichmentMethod,
  PartOfSpeech,
  WordExample,
  WordPosAttributes,
  WordTranslation,
} from '@shared/types';

export interface AggregatedWord {
  lemma: string;
  pos: PartOfSpeech;
  level: string | null;
  english: string | null;
  exampleDe: string | null;
  exampleEn: string | null;
  gender: string | null;
  plural: string | null;
  separable: boolean | null;
  aux: string | null;
  praesensIch: string | null;
  praesensEr: string | null;
  praeteritum: string | null;
  partizipIi: string | null;
  perfekt: string | null;
  comparative: string | null;
  superlative: string | null;
  approved: boolean;
  complete: boolean;
  sourcesCsv: string | null;
  sourceNotes: string | null;
  translations: WordTranslation[] | null;
  examples: WordExample[] | null;
  posAttributes?: WordPosAttributes | null;
  enrichmentAppliedAt: string | null;
  enrichmentMethod: EnrichmentMethod | null;
}
