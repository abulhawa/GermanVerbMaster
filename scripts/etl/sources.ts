import type { AggregatedWord } from './types';
import { sha1 } from './utils';

const DEFAULT_SOURCE_ID = 'words_all_sources';

function splitSourceEntries(sourcesCsv: string | null): string[] {
  if (!sourcesCsv) return [];
  return sourcesCsv
    .split(';')
    .map((entry) => entry.trim())
    .filter(Boolean);
}

export function primarySourceId(word: AggregatedWord): string {
  const [first] = splitSourceEntries(word.sourcesCsv ?? null);
  return first ?? DEFAULT_SOURCE_ID;
}

export function collectSources(word: AggregatedWord): string[] {
  const entries = splitSourceEntries(word.sourcesCsv ?? null);
  if (entries.length === 0) {
    return [DEFAULT_SOURCE_ID];
  }
  const unique = Array.from(new Set(entries.map((entry) => entry.toLowerCase())));
  return unique
    .map((entry) => entries.find((original) => original.toLowerCase() === entry) ?? entry)
    .sort((a, b) => a.localeCompare(b));
}

export function deriveSourceRevision(word: AggregatedWord): string {
  const primary = primarySourceId(word);
  const payload = [word.sourcesCsv ?? '', word.sourceNotes ?? ''].filter(Boolean).join('||');
  if (!payload) {
    return `${primary}:seed`;
  }
  const digest = sha1(payload).slice(0, 10);
  return `${primary}:${digest}`;
}
