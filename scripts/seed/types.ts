import type { AggregatedWord } from '../etl/types';
import type {
  EnrichmentMethod,
  PartOfSpeech,
  WordExample,
  WordPosAttributes,
  WordTranslation,
} from '@shared/types';

export interface RawWordRow {
  lemma: string;
  pos: PartOfSpeech;
  level?: string | null;
  english?: string | null;
  exampleDe?: string | null;
  exampleEn?: string | null;
  gender?: string | null;
  plural?: string | null;
  separable?: boolean | null;
  aux?: string | null;
  praesensIch?: string | null;
  praesensEr?: string | null;
  praeteritum?: string | null;
  partizipIi?: string | null;
  perfekt?: string | null;
  comparative?: string | null;
  superlative?: string | null;
  translations?: WordTranslation[] | null;
  examples?: WordExample[] | null;
  posAttributes?: WordPosAttributes | null;
  enrichmentAppliedAt?: string | null;
  enrichmentMethod?: EnrichmentMethod | null;
  approved?: boolean | null;
}

export interface BasePosJsonRecord {
  lemma: unknown;
  level?: unknown;
  english?: unknown;
  approved?: unknown;
  examples?: unknown;
  example?: unknown;
  example_de?: unknown;
  example_en?: unknown;
}

export interface FallbackExampleInput {
  exampleDe?: unknown;
  exampleEn?: unknown;
  example?: unknown;
}

export interface AggregatedWordWithKey extends AggregatedWord {
  key: string;
}
