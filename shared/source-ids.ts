import type { PartOfSpeech } from './types';

export const POS_SOURCE_NAMESPACE = 'pos_jsonl';
const FALLBACK_SLUG = 'unknown';

const POS_SOURCE_SLUGS: Record<string, string> = {
  v: 'verbs',
  verb: 'verbs',
  n: 'nouns',
  noun: 'nouns',
  adj: 'adjectives',
  adjective: 'adjectives',
  adv: 'adverbs',
  adverb: 'adverbs',
  pron: 'pronouns',
  pronoun: 'pronouns',
  det: 'determiners',
  determiner: 'determiners',
  präp: 'prepositions',
  praep: 'prepositions',
  preposition: 'prepositions',
  konj: 'conjunctions',
  conjunction: 'conjunctions',
  num: 'numerals',
  numeral: 'numerals',
  part: 'particles',
  particle: 'particles',
  interj: 'interjections',
  interjection: 'interjections',
};

function normalisePosKey(pos: PartOfSpeech | string | null | undefined): string {
  if (pos === null || pos === undefined) {
    return '';
  }
  return String(pos).trim();
}

export function posPrimarySourceId(pos: PartOfSpeech | string | null | undefined): string {
  const key = normalisePosKey(pos);
  if (!key) {
    return `${POS_SOURCE_NAMESPACE}:${FALLBACK_SLUG}`;
  }
  const lower = key.toLowerCase();
  const slug = POS_SOURCE_SLUGS[lower] ?? POS_SOURCE_SLUGS[key] ?? lower.replace(/\s+/g, '-');
  return `${POS_SOURCE_NAMESPACE}:${slug || FALLBACK_SLUG}`;
}

export function enrichmentSourceId(method: string): string {
  return `enrichment:${method}`;
}
