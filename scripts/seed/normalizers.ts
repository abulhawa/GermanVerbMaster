import { normalizeWordExample } from '@shared/examples';
import type { PartOfSpeech, WordExample, WordPosAttributes, WordTranslation } from '@shared/types';

import { EXTERNAL_POS_VALUES, LEVEL_ORDER, POS_MAP } from './constants';
import type { BasePosJsonRecord, FallbackExampleInput } from './types';

export function normaliseString(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  const trimmed = String(value).trim();
  return trimmed.length ? trimmed : null;
}

export function parseBooleanish(value: unknown): boolean | null {
  if (value === undefined || value === null) return null;
  const normalized = String(value).trim().toLowerCase();
  if (!normalized) return null;
  if (['1', 'true', 'yes', 'y', 'ja'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'n', 'nein'].includes(normalized)) return false;
  return null;
}

export function normaliseBoolean(value: unknown): boolean | null {
  if (value === undefined || value === null) return null;
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') return parseBooleanish(value);
  if (typeof value === 'number') return value === 1 ? true : value === 0 ? false : null;
  return null;
}

export function normaliseLevel(level: unknown): string | null {
  const value = normaliseString(level);
  if (!value) return null;
  const upper = value.toUpperCase();
  return LEVEL_ORDER.includes(upper as (typeof LEVEL_ORDER)[number]) ? upper : value;
}

export function normalisePos(raw: unknown): PartOfSpeech | null {
  if (raw === undefined || raw === null) return null;
  const value = String(raw).trim();
  if (!value) return null;
  if ((EXTERNAL_POS_VALUES as readonly string[]).includes(value)) {
    return value as PartOfSpeech;
  }
  const upper = value.toUpperCase();
  switch (upper) {
    case 'ADJ':
      return 'Adj';
    case 'ADV':
      return 'Adv';
    case 'PRON':
      return 'Pron';
    case 'DET':
      return 'Det';
    case 'PRÄP':
    case 'PRAEP':
      return 'Präp';
    case 'KONJ':
      return 'Konj';
    case 'NUM':
      return 'Num';
    case 'PART':
      return 'Part';
    case 'INTERJ':
      return 'Interj';
    default:
      break;
  }
  const mapped = POS_MAP.get(value.toLowerCase());
  return mapped ?? null;
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object');
}

export function pickFirstString(values: Array<unknown>): string | null {
  for (const value of values) {
    const normalized = normaliseString(value);
    if (normalized) {
      return normalized;
    }
  }
  return null;
}

export function createExampleFallback(record: BasePosJsonRecord | null): FallbackExampleInput | null {
  if (!record) {
    return null;
  }

  const raw = record as unknown as Record<string, unknown>;
  const exampleDe = raw['example_de'] ?? raw.exampleDe;
  const exampleEn = raw['example_en'] ?? raw.exampleEn;
  const exampleValue = raw.example;

  if (
    (typeof exampleDe === 'string' && exampleDe.trim()) ||
    (typeof exampleEn === 'string' && exampleEn.trim()) ||
    (exampleValue && typeof exampleValue === 'object')
  ) {
    return {
      exampleDe,
      exampleEn,
      example: exampleValue,
    } satisfies FallbackExampleInput;
  }

  return null;
}

export function resolveFallbackExample(input: FallbackExampleInput | null): WordExample | null {
  if (!input) {
    return null;
  }

  const exampleRecord = isRecord(input.example) ? (input.example as Record<string, unknown>) : null;
  const deValue = pickFirstString([
    input.exampleDe,
    exampleRecord?.exampleDe,
    exampleRecord?.example_de,
    exampleRecord?.de,
    exampleRecord?.sentence,
  ]);
  const enValue = pickFirstString([
    input.exampleEn,
    exampleRecord?.exampleEn,
    exampleRecord?.example_en,
    exampleRecord?.en,
  ]);

  if (!deValue && !enValue) {
    return null;
  }

  return {
    sentence: deValue ?? null,
    translations: enValue ? { en: enValue } : null,
  } satisfies WordExample;
}

export function normaliseExamples(
  rawExamples: unknown,
  fallback: FallbackExampleInput | null = null,
): { exampleDe: string | null; exampleEn: string | null; examples: WordExample[] | null } {
  const fallbackExample = resolveFallbackExample(fallback);
  const normalizedEntries: WordExample[] = Array.isArray(rawExamples)
    ? (rawExamples as unknown[])
        .map((entry) => normalizeWordExample(entry as WordExample))
        .filter((entry): entry is WordExample => Boolean(entry))
    : [];

  const canonical = fallbackExample ?? normalizedEntries[0] ?? null;
  const deduped: WordExample[] = [];
  const seen = new Set<string>();

  const pushExample = (entry: WordExample | null): void => {
    if (!entry) {
      return;
    }

    const sentence = normaliseString(entry.sentence ?? null);
    const english = normaliseString(entry.translations?.en ?? null);
    const key = `${sentence ?? ''}::${english ?? ''}`;
    if (seen.has(key)) {
      return;
    }
    seen.add(key);

    const nextTranslations = entry.translations ? { ...entry.translations } : english ? { en: english } : null;
    if (nextTranslations && english) {
      nextTranslations.en = english;
    }

    deduped.push({
      sentence: sentence ?? entry.sentence ?? null,
      translations: nextTranslations,
    });
  };

  pushExample(fallbackExample);
  for (const entry of normalizedEntries) {
    pushExample(entry);
  }

  const resolvedCanonical = canonical ?? deduped[0] ?? null;

  return {
    exampleDe: resolvedCanonical?.sentence ?? null,
    exampleEn: resolvedCanonical?.translations?.en ?? null,
    examples: deduped.length ? deduped : null,
  };
}

export function normalizeStringArray(values: Array<string | null | undefined>): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const trimmed = value?.trim();
    if (!trimmed) {
      continue;
    }
    const key = trimmed.toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      result.push(trimmed);
    }
  }
  return result;
}

export function mergeTranslations(
  existing: WordTranslation[] | null | undefined,
  incoming: WordTranslation[] | null | undefined,
): WordTranslation[] | null {
  const combined = [...(existing ?? []), ...(incoming ?? [])];
  if (!combined.length) {
    return null;
  }
  const seen = new Set<string>();
  const deduped: WordTranslation[] = [];
  for (const entry of combined) {
    if (!entry || typeof entry.value !== 'string') {
      continue;
    }
    const value = entry.value.trim();
    if (!value) {
      continue;
    }
    const source = entry.source?.trim() ?? null;
    const language = entry.language?.trim() ?? null;
    const confidence = typeof entry.confidence === 'number' ? entry.confidence : null;
    const key = `${value.toLowerCase()}::${source ?? ''}::${language ?? ''}::${confidence ?? ''}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    deduped.push({ value, source, language, confidence });
  }
  return deduped.length ? deduped : null;
}

export function mergeExamples(
  existing: WordExample[] | null | undefined,
  incoming: WordExample[] | null | undefined,
): WordExample[] | null {
  const combined = [...(existing ?? []), ...(incoming ?? [])];
  if (!combined.length) {
    return null;
  }
  const seen = new Set<string>();
  const deduped: WordExample[] = [];
  for (const entry of combined) {
    const normalized = normalizeWordExample(entry);
    if (!normalized) {
      continue;
    }
    const sentence = (normalized.sentence ?? normalized.exampleDe ?? '').trim().toLowerCase();
    const translations: Array<readonly [string, string]> = [];
    if (normalized.translations) {
      for (const [language, value] of Object.entries(normalized.translations)) {
        if (typeof value !== 'string') {
          continue;
        }
        const trimmedLanguage = language.trim().toLowerCase();
        const trimmedValue = value.trim().toLowerCase();
        if (!trimmedLanguage || !trimmedValue) {
          continue;
        }
        translations.push([trimmedLanguage, trimmedValue]);
      }
      translations.sort((a, b) => a[0].localeCompare(b[0]));
    }
    const key = JSON.stringify([sentence, translations]);
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    deduped.push(normalized);
  }
  return deduped.length ? deduped : null;
}

export function mergeWordPosAttributes(
  existing: WordPosAttributes | null | undefined,
  incoming: WordPosAttributes | null | undefined,
): WordPosAttributes | null {
  const next: WordPosAttributes = {};
  const existingPos = existing?.pos ?? null;
  const incomingPos = incoming?.pos ?? null;
  if (existingPos?.trim()) {
    next.pos = existingPos.trim();
  } else if (incomingPos?.trim()) {
    next.pos = incomingPos.trim();
  }

  const collectPrepositionValues = (
    source: WordPosAttributes | null | undefined,
    targetCases: Set<string>,
    targetNotes: Set<string>,
  ) => {
    if (!source?.preposition) return;
    for (const value of source.preposition.cases ?? []) {
      const trimmed = value?.trim();
      if (trimmed) {
        targetCases.add(trimmed);
      }
    }
    for (const value of source.preposition.notes ?? []) {
      const trimmed = value?.trim();
      if (trimmed) {
        targetNotes.add(trimmed);
      }
    }
  };

  const caseValues = new Set<string>();
  const noteValues = new Set<string>();
  collectPrepositionValues(existing, caseValues, noteValues);
  collectPrepositionValues(incoming, caseValues, noteValues);

  if (caseValues.size || noteValues.size) {
    const preposition: NonNullable<WordPosAttributes['preposition']> = {};
    if (caseValues.size) {
      preposition.cases = Array.from(caseValues.values()).sort((a, b) => a.localeCompare(b));
    }
    if (noteValues.size) {
      preposition.notes = Array.from(noteValues.values()).sort((a, b) => a.localeCompare(b));
    }
    next.preposition = preposition;
  }

  const mergedTags = normalizeStringArray([...(existing?.tags ?? []), ...(incoming?.tags ?? [])]);
  if (mergedTags.length) {
    next.tags = mergedTags.sort((a, b) => a.localeCompare(b));
  }
  const mergedNotes = normalizeStringArray([...(existing?.notes ?? []), ...(incoming?.notes ?? [])]);
  if (mergedNotes.length) {
    next.notes = mergedNotes.sort((a, b) => a.localeCompare(b));
  }

  return Object.keys(next).length ? next : null;
}

export function pickLatestTimestamp(a: string | null, b: string | null): string | null {
  const candidates = [a, b]
    .filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
    .map((value) => new Date(value).getTime())
    .filter((value) => Number.isFinite(value));
  if (!candidates.length) {
    return a ?? b ?? null;
  }
  const max = Math.max(...candidates);
  return new Date(max).toISOString();
}

export function isEnglishLanguage(language?: string | null): boolean {
  if (!language) {
    return true;
  }
  const normalised = language.trim().toLowerCase();
  if (!normalised) {
    return true;
  }
  if (normalised === 'en' || normalised === 'eng' || normalised === 'english') {
    return true;
  }
  const sanitized = normalised.replace(/[_\s]/g, '-');
  return sanitized.startsWith('en-') || normalised.startsWith('english');
}

export function addAuxCandidate(target: Set<'haben' | 'sein'>, value: string | null | undefined): void {
  if (!value) {
    return;
  }
  const normalised = value.trim().toLowerCase();
  if (!normalised) {
    return;
  }
  if (normalised.includes('haben') && normalised.includes('sein')) {
    target.add('haben');
    target.add('sein');
    return;
  }
  if (normalised.startsWith('hab')) {
    target.add('haben');
    return;
  }
  if (normalised.startsWith('sein') || normalised.startsWith('ist')) {
    target.add('sein');
  }
}

export function determineAuxFromSet(auxiliaries: Set<'haben' | 'sein'>): string | null {
  if (!auxiliaries.size) {
    return null;
  }
  if (auxiliaries.size > 1) {
    return 'haben / sein';
  }
  const [value] = auxiliaries;
  return value ?? null;
}
