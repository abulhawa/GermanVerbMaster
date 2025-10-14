import type { AggregatedWord } from './types';
import { sha1 } from './utils';

const DEFAULT_SOURCE_ID = 'words_all_sources';

export function primarySourceId(_: AggregatedWord): string {
  return DEFAULT_SOURCE_ID;
}

export function collectSources(_: AggregatedWord): string[] {
  return [DEFAULT_SOURCE_ID];
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

  return `${DEFAULT_SOURCE_ID}:${digest}`;
}
