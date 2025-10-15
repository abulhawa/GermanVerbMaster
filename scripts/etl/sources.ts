import { enrichmentSourceId, posPrimarySourceId } from '@shared/source-ids';

import type { AggregatedWord } from './types';
import { sha1 } from './utils';

export function primarySourceId(word: AggregatedWord): string {
  return posPrimarySourceId(word.pos);
}

export function collectSources(word: AggregatedWord): string[] {
  const sources = new Set<string>();
  sources.add(primarySourceId(word));
  if (word.enrichmentMethod) {
    sources.add(enrichmentSourceId(word.enrichmentMethod));
  }
  return Array.from(sources);
}

export function deriveSourceRevision(word: AggregatedWord): string {
  const digest = sha1(
    JSON.stringify({
      lemma: word.lemma,
      pos: word.pos,
      level: word.level ?? null,
      english: word.english ?? null,
      exampleDe: word.exampleDe ?? null,
      exampleEn: word.exampleEn ?? null,
      gender: word.gender ?? null,
      plural: word.plural ?? null,
      separable: word.separable ?? null,
      aux: word.aux ?? null,
      praesensIch: word.praesensIch ?? null,
      praesensEr: word.praesensEr ?? null,
      praeteritum: word.praeteritum ?? null,
      partizipIi: word.partizipIi ?? null,
      perfekt: word.perfekt ?? null,
      comparative: word.comparative ?? null,
      superlative: word.superlative ?? null,
      approved: word.approved,
      complete: word.complete,
    }),
  ).slice(0, 10);

  return `${primarySourceId(word)}:${digest}`;
}
