import type { Word } from '@db';
import {
  examplesEqual,
  normalizeWordExample,
  type WordExample,
  type WordPosAttributes,
  type WordTranslation,
} from '@shared';

import type { WordUpdateInput } from '../routes/admin/schemas.js';
import { buildGroqWordEnrichment } from './groq-word-enrichment.js';
import {
  lookupExampleSentence,
  lookupTranslation,
  lookupWiktextract,
  type WiktextractLookup,
} from './free-enrichment-providers.js';

interface ProviderWordEnrichmentOptions {
  overwrite?: boolean;
  useGroqFallback?: boolean;
}

interface TranslationCandidate {
  value: string;
  source: string;
  language?: string | null;
  confidence?: number | null;
}

interface ExampleCandidate {
  source: string;
  sentence?: string;
  translations?: Record<string, string | null | undefined> | null;
  exampleDe?: string;
  exampleEn?: string;
}

interface VerbFormSuggestion {
  source: string;
  praeteritum?: string;
  partizipIi?: string;
  perfekt?: string;
  aux?: string;
  auxiliaries?: string[];
  perfektOptions?: string[];
}

interface NounFormSuggestion {
  source: string;
  genders?: string[];
  plurals?: string[];
  forms?: Array<{ form: string; tags: string[] }>;
}

interface AdjectiveFormSuggestion {
  source: string;
  comparatives?: string[];
  superlatives?: string[];
  forms?: Array<{ form: string; tags: string[] }>;
}

interface PrepositionSuggestion {
  source: string;
  cases?: string[];
  notes?: string[];
}

interface ProviderSuggestions {
  translations: TranslationCandidate[];
  examples: ExampleCandidate[];
  verbForms: VerbFormSuggestion[];
  nounForms: NounFormSuggestion[];
  adjectiveForms: AdjectiveFormSuggestion[];
  prepositionAttributes: PrepositionSuggestion[];
  posLabel?: string;
  posTags: string[];
  posNotes: string[];
}

type TranslationRecord = NonNullable<Word['translations']>[number];
type ExampleRecord = NonNullable<Word['examples']>[number];
type PrepositionAttributes = NonNullable<WordPosAttributes['preposition']>;
type ExampleUpdateRecord = NonNullable<WordUpdateInput['examples']>[number];
type PosAttributesUpdate = NonNullable<WordUpdateInput['posAttributes']>;
type AuxValue = NonNullable<WordUpdateInput['aux']>;

const ENRICHMENT_METADATA_KEYS: Array<keyof WordUpdateInput> = ['enrichmentAppliedAt', 'enrichmentMethod'];

const GENDER_VALUE_MAP: Record<string, string> = {
  masculine: 'der',
  feminine: 'die',
  neuter: 'das',
  m: 'der',
  f: 'die',
  n: 'das',
};

function isBlank(value: string | null | undefined): boolean {
  return value === undefined || value === null || !value.trim();
}

function isEnglishTranslationCandidate(language?: string | null): boolean {
  if (!language) {
    return true;
  }
  const normalized = language.trim().toLowerCase();
  if (!normalized) {
    return true;
  }
  if (normalized === 'en' || normalized === 'eng' || normalized === 'english') {
    return true;
  }
  const sanitized = normalized.replace(/[_\s]/g, '-');
  return sanitized.startsWith('en-') || normalized.startsWith('english');
}

function normalizeStringList(values: Array<string | null | undefined>): string[] {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const value of values) {
    const trimmed = value?.trim();
    if (!trimmed) {
      continue;
    }
    const key = trimmed.toLowerCase();
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    result.push(trimmed);
  }

  return result;
}

function sortStrings(values: Array<string | null | undefined>): string[] {
  return normalizeStringList(values).sort((left, right) => left.localeCompare(right));
}

function toAuxValue(value: string | null | undefined): AuxValue | undefined {
  const normalized = value?.trim().toLowerCase();
  if (!normalized) {
    return undefined;
  }
  if (normalized === 'haben' || normalized === 'sein') {
    return normalized;
  }
  if (normalized.replace(/\s+/g, '') === 'haben/sein') {
    return 'haben / sein';
  }
  return undefined;
}

function stripEnrichmentMetadata(patch: WordUpdateInput): WordUpdateInput {
  const stripped: WordUpdateInput = { ...patch };
  for (const key of ENRICHMENT_METADATA_KEYS) {
    delete stripped[key];
  }
  return stripped;
}

function buildPerfektFromForms(aux: string, partizip: string): string | null {
  const cleanedPartizip = partizip.trim();
  if (!cleanedPartizip) {
    return null;
  }

  const normalizedAux = aux.trim().toLowerCase();
  if (normalizedAux === 'haben') {
    return `hat ${cleanedPartizip}`;
  }
  if (normalizedAux === 'sein') {
    return `ist ${cleanedPartizip}`;
  }
  if (normalizedAux.replace(/\s+/g, '') === 'haben/sein') {
    return `hat ${cleanedPartizip} / ist ${cleanedPartizip}`;
  }

  return null;
}

function pickExampleCandidate(examples: ExampleCandidate[]): ExampleCandidate | undefined {
  const hasSentence = (example: ExampleCandidate) => Boolean((example.sentence ?? example.exampleDe ?? '').trim());
  const hasEnglish = (example: ExampleCandidate) =>
    Boolean((example.translations?.en ?? example.exampleEn ?? '').trim());

  return (
    examples.find((example) => hasSentence(example) && hasEnglish(example)) ??
    examples.find((example) => hasSentence(example)) ??
    examples.find((example) => hasEnglish(example)) ??
    examples[0]
  );
}

function pickPreferredEnglishTranslationCandidate(
  candidates: TranslationCandidate[],
): TranslationCandidate | undefined {
  return (
    candidates.find(
      (candidate) =>
        candidate.source === 'kaikki.org' &&
        candidate.value.trim() &&
        isEnglishTranslationCandidate(candidate.language),
    ) ??
    candidates.find(
      (candidate) => candidate.value.trim() && isEnglishTranslationCandidate(candidate.language),
    )
  );
}

function normaliseGenderValue(value: string | undefined): string | undefined {
  if (!value) {
    return undefined;
  }
  const trimmed = value.trim().toLowerCase();
  if (!trimmed) {
    return undefined;
  }
  if (trimmed === 'der' || trimmed === 'die' || trimmed === 'das') {
    return trimmed;
  }
  return GENDER_VALUE_MAP[trimmed];
}

function collectGenderHintsFromForms(forms: NounFormSuggestion['forms']): string[] {
  const results: string[] = [];
  if (!forms) {
    return results;
  }
  for (const form of forms) {
    for (const tag of form.tags ?? []) {
      const gender = normaliseGenderValue(tag);
      if (gender) {
        results.push(gender);
      }
    }
  }
  return results;
}

function pickPreferredGenderCandidate(
  suggestions: NounFormSuggestion[],
): { value: string; source: string } | undefined {
  const preference = ['der', 'die', 'das'];
  for (const suggestion of suggestions) {
    const collected = new Set<string>();
    for (const gender of suggestion.genders ?? []) {
      const normalized = normaliseGenderValue(gender);
      if (normalized) {
        collected.add(normalized);
      }
    }
    for (const gender of collectGenderHintsFromForms(suggestion.forms)) {
      collected.add(gender);
    }
    if (!collected.size) {
      continue;
    }
    for (const target of preference) {
      if (collected.has(target)) {
        return { value: target, source: suggestion.source };
      }
    }
    const [first] = Array.from(collected.values()).sort();
    if (first) {
      return { value: first, source: suggestion.source };
    }
  }
  return undefined;
}

function pickPreferredPluralCandidate(
  suggestions: NounFormSuggestion[],
): { value: string; source: string } | undefined {
  type Candidate = { value: string; priority: number; source: string };
  const candidates: Candidate[] = [];

  for (const suggestion of suggestions) {
    for (const plural of suggestion.plurals ?? []) {
      const trimmed = plural.trim();
      if (!trimmed) {
        continue;
      }
      candidates.push({ value: trimmed, priority: 2, source: suggestion.source });
    }
    for (const form of suggestion.forms ?? []) {
      if (!form.form?.trim()) {
        continue;
      }
      if (!form.tags?.some((tag) => tag.includes('plural'))) {
        continue;
      }
      const tags = form.tags.map((tag) => tag.toLowerCase());
      const priority = tags.some((tag) => tag.includes('nominative')) ? 0 : 1;
      candidates.push({ value: form.form.trim(), priority, source: suggestion.source });
    }
  }

  if (!candidates.length) {
    return undefined;
  }

  candidates.sort((left, right) => {
    if (left.priority !== right.priority) {
      return left.priority - right.priority;
    }
    return left.value.localeCompare(right.value);
  });

  return { value: candidates[0].value, source: candidates[0].source };
}

function pickPreferredAdjectiveCandidate(
  suggestions: AdjectiveFormSuggestion[],
  field: 'comparative' | 'superlative',
): { value: string; source: string } | undefined {
  for (const suggestion of suggestions) {
    const values = new Set<string>();
    const direct = field === 'comparative' ? suggestion.comparatives : suggestion.superlatives;

    for (const value of direct ?? []) {
      const trimmed = value.trim();
      if (trimmed) {
        values.add(trimmed);
      }
    }

    for (const form of suggestion.forms ?? []) {
      if (!form.form?.trim()) {
        continue;
      }
      if (form.tags?.some((tag) => tag.toLowerCase().includes(field))) {
        values.add(form.form.trim());
      }
    }

    if (!values.size) {
      continue;
    }

    const [best] = Array.from(values.values()).sort();
    if (best) {
      return { value: best, source: suggestion.source };
    }
  }

  return undefined;
}

function mergeTranslationRecords(
  existing: Word['translations'],
  candidates: TranslationCandidate[],
): Word['translations'] {
  const map = new Map<string, TranslationRecord>();

  const addRecord = (
    value: string | undefined,
    source?: string | null,
    language?: string | null,
    confidence?: number | null,
  ) => {
    const trimmedValue = value?.trim();
    if (!trimmedValue) {
      return;
    }
    const normalizedSource = source ? source.trim() : null;
    const normalizedLanguage = language ? language.trim() : null;
    const confidenceValue = typeof confidence === 'number' ? confidence : null;
    const key = `${trimmedValue.toLowerCase()}::${(normalizedSource ?? '').toLowerCase()}::${(normalizedLanguage ?? '').toLowerCase()}`;
    if (map.has(key)) {
      return;
    }
    map.set(key, {
      value: trimmedValue,
      source: normalizedSource,
      language: normalizedLanguage,
      confidence: confidenceValue,
    });
  };

  if (Array.isArray(existing)) {
    for (const record of existing) {
      addRecord(record.value, record.source ?? null, record.language ?? null, record.confidence ?? null);
    }
  }

  for (const candidate of candidates) {
    addRecord(candidate.value, candidate.source, candidate.language ?? null, candidate.confidence ?? null);
  }

  const result = Array.from(map.values());
  return result.length ? result : null;
}

function areTranslationRecordsEqual(previous: Word['translations'], next: Word['translations']): boolean {
  const previousList = Array.isArray(previous) ? previous : [];
  const nextList = Array.isArray(next) ? next : [];
  if (previousList.length !== nextList.length) {
    return false;
  }

  const serialise = (record: TranslationRecord) =>
    JSON.stringify([
      record.value.trim().toLowerCase(),
      (record.source ?? '').trim().toLowerCase(),
      (record.language ?? '').trim().toLowerCase(),
      typeof record.confidence === 'number' ? record.confidence : null,
    ]);

  const sortedPrevious = previousList.map(serialise).sort();
  const sortedNext = nextList.map(serialise).sort();
  return sortedPrevious.every((value, index) => value === sortedNext[index]);
}

function mergeExampleRecords(existing: Word['examples'], candidates: ExampleCandidate[]): Word['examples'] {
  const map = new Map<string, ExampleRecord>();

  const serialiseKey = (example: ExampleRecord): string => {
    const sentence = (example.sentence ?? example.exampleDe ?? '').trim().toLowerCase();
    const translations: Array<readonly [string, string]> = [];
    if (example.translations) {
      for (const [language, value] of Object.entries(example.translations)) {
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
      translations.sort((left, right) => left[0].localeCompare(right[0]));
    }
    return JSON.stringify([sentence, translations]);
  };

  const addRecord = (entry: ExampleCandidate | WordExample | null | undefined) => {
    const normalized = normalizeWordExample(entry as WordExample);
    if (!normalized) {
      return;
    }
    const key = serialiseKey(normalized);
    if (!map.has(key)) {
      map.set(key, normalized);
    }
  };

  if (Array.isArray(existing)) {
    for (const record of existing) {
      addRecord(record);
    }
  }

  for (const candidate of candidates) {
    addRecord(candidate);
  }

  const result = Array.from(map.values());
  return result.length ? result : null;
}

function toWordUpdateExamples(examples: Word['examples']): WordUpdateInput['examples'] {
  if (!Array.isArray(examples)) {
    return null;
  }

  const normalizedExamples: ExampleUpdateRecord[] = examples
    .map((entry) => normalizeWordExample(entry))
    .filter((entry): entry is WordExample => entry !== null)
    .map((entry) => {
      const translations = entry.translations
        ? Object.fromEntries(
            Object.entries(entry.translations).filter(
              (translation): translation is [string, string] =>
                typeof translation[1] === 'string' && translation[1].trim().length > 0,
            ),
          )
        : null;

      return {
        sentence: entry.sentence ?? null,
        translations: translations && Object.keys(translations).length > 0 ? translations : null,
      };
    });

  return normalizedExamples.length > 0 ? normalizedExamples : null;
}

function normalizePrepositionAttributes(
  value: WordPosAttributes['preposition'] | null | undefined,
): PrepositionAttributes | null {
  if (!value || typeof value !== 'object') {
    return null;
  }
  const cases = Array.isArray(value.cases) ? sortStrings(value.cases) : [];
  const notes = Array.isArray(value.notes) ? sortStrings(value.notes) : [];
  if (!cases.length && !notes.length) {
    return null;
  }
  const normalized: PrepositionAttributes = {};
  if (cases.length) {
    normalized.cases = cases;
  }
  if (notes.length) {
    normalized.notes = notes;
  }
  return normalized;
}

function normalizePosAttributes(value: Word['posAttributes'] | WordPosAttributes | null | undefined): WordPosAttributes | null {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const normalized: WordPosAttributes = {};
  if (typeof value.pos === 'string' && value.pos.trim()) {
    normalized.pos = value.pos.trim();
  }

  const preposition = normalizePrepositionAttributes(value.preposition ?? null);
  if (preposition) {
    normalized.preposition = preposition;
  }

  const tags = Array.isArray(value.tags) ? sortStrings(value.tags) : [];
  if (tags.length) {
    normalized.tags = tags;
  }

  const notes = Array.isArray(value.notes) ? sortStrings(value.notes) : [];
  if (notes.length) {
    normalized.notes = notes;
  }

  return Object.keys(normalized).length ? normalized : null;
}

function areStringListsEqual(
  left: string[] | null | undefined,
  right: string[] | null | undefined,
): boolean {
  const normalizedLeft = sortStrings(left ?? []);
  const normalizedRight = sortStrings(right ?? []);
  if (normalizedLeft.length !== normalizedRight.length) {
    return false;
  }
  return normalizedLeft.every((value, index) => value === normalizedRight[index]);
}

function arePosAttributesEqual(
  left: Word['posAttributes'],
  right: WordPosAttributes | null,
): boolean {
  const normalizedLeft = normalizePosAttributes(left);
  const normalizedRight = normalizePosAttributes(right);

  if (!normalizedLeft && !normalizedRight) {
    return true;
  }
  if (!normalizedLeft || !normalizedRight) {
    return false;
  }
  if ((normalizedLeft.pos ?? null) !== (normalizedRight.pos ?? null)) {
    return false;
  }

  const leftPreposition = normalizePrepositionAttributes(normalizedLeft.preposition ?? null);
  const rightPreposition = normalizePrepositionAttributes(normalizedRight.preposition ?? null);
  if (!leftPreposition && rightPreposition) {
    return false;
  }
  if (leftPreposition && !rightPreposition) {
    return false;
  }
  if (
    !areStringListsEqual(leftPreposition?.cases ?? null, rightPreposition?.cases ?? null) ||
    !areStringListsEqual(leftPreposition?.notes ?? null, rightPreposition?.notes ?? null)
  ) {
    return false;
  }

  return (
    areStringListsEqual(normalizedLeft.tags ?? null, normalizedRight.tags ?? null) &&
    areStringListsEqual(normalizedLeft.notes ?? null, normalizedRight.notes ?? null)
  );
}

function mergePosAttributes(
  word: Word,
  suggestions: ProviderSuggestions,
): WordPosAttributes | null {
  const normalizedExisting = normalizePosAttributes(word.posAttributes);
  const caseValues = new Set<string>(normalizedExisting?.preposition?.cases ?? []);
  const noteValues = new Set<string>(normalizedExisting?.preposition?.notes ?? []);

  for (const suggestion of suggestions.prepositionAttributes) {
    for (const entry of suggestion.cases ?? []) {
      const trimmed = entry.trim();
      if (trimmed) {
        caseValues.add(trimmed);
      }
    }
    for (const note of suggestion.notes ?? []) {
      const trimmed = note.trim();
      if (trimmed) {
        noteValues.add(trimmed);
      }
    }
  }

  const result: WordPosAttributes = {};
  const resolvedPos = suggestions.posLabel?.trim() || normalizedExisting?.pos || word.pos;
  if (resolvedPos) {
    result.pos = resolvedPos;
  }

  const mergedTags = sortStrings([...(normalizedExisting?.tags ?? []), ...suggestions.posTags]);
  const mergedNotes = sortStrings([...(normalizedExisting?.notes ?? []), ...suggestions.posNotes]);

  const mergedPreposition: PrepositionAttributes = {};
  const resolvedCases = Array.from(caseValues.values()).sort((left, right) => left.localeCompare(right));
  const resolvedPrepositionNotes = Array.from(noteValues.values()).sort((left, right) => left.localeCompare(right));
  if (resolvedCases.length) {
    mergedPreposition.cases = resolvedCases;
  }
  if (resolvedPrepositionNotes.length) {
    mergedPreposition.notes = resolvedPrepositionNotes;
  }
  if (Object.keys(mergedPreposition).length > 0) {
    result.preposition = mergedPreposition;
  } else if (normalizedExisting?.preposition) {
    result.preposition = normalizedExisting.preposition;
  }

  if (mergedTags.length) {
    result.tags = mergedTags;
  }
  if (mergedNotes.length) {
    result.notes = mergedNotes;
  }

  return Object.keys(result).length ? result : null;
}

function toWordUpdatePosAttributes(
  value: WordPosAttributes | null,
): WordUpdateInput['posAttributes'] {
  if (!value) {
    return null;
  }

  const next: PosAttributesUpdate = {};
  if (typeof value.pos === 'string' && value.pos.trim()) {
    next.pos = value.pos.trim();
  }

  const tags = sortStrings(value.tags ?? []);
  if (tags.length) {
    next.tags = tags;
  }

  const notes = sortStrings(value.notes ?? []);
  if (notes.length) {
    next.notes = notes;
  }

  const prepositionCases = sortStrings(value.preposition?.cases ?? []);
  const prepositionNotes = sortStrings(value.preposition?.notes ?? []);
  if (prepositionCases.length || prepositionNotes.length) {
    next.preposition = {};
    if (prepositionCases.length) {
      next.preposition.cases = prepositionCases;
    }
    if (prepositionNotes.length) {
      next.preposition.notes = prepositionNotes;
    }
  }

  return Object.keys(next).length > 0 ? next : null;
}

function toExampleCandidate(example: NonNullable<WiktextractLookup['examples']>[number], source: string): ExampleCandidate {
  const sentence = example.sentence?.trim() || example.exampleDe?.trim() || undefined;
  const english = example.translations?.en?.trim() || example.exampleEn?.trim() || undefined;
  return {
    source,
    sentence,
    translations: english ? { en: english } : example.translations ?? null,
    exampleDe: sentence,
    exampleEn: english,
  };
}

async function collectProviderSuggestions(word: Word): Promise<ProviderSuggestions> {
  const suggestions: ProviderSuggestions = {
    translations: [],
    examples: [],
    verbForms: [],
    nounForms: [],
    adjectiveForms: [],
    prepositionAttributes: [],
    posTags: [],
    posNotes: [],
  };

  try {
    const wiktextract = await lookupWiktextract(word.lemma, word.pos);
    if (wiktextract) {
      for (const translation of wiktextract.translations) {
        suggestions.translations.push({
          value: translation.value,
          source: 'kaikki.org',
          language: translation.language ?? null,
        });
      }
      for (const example of wiktextract.examples) {
        suggestions.examples.push(toExampleCandidate(example, 'kaikki.org'));
      }
      if (wiktextract.verbForms) {
        suggestions.verbForms.push({
          source: 'kaikki.org',
          praeteritum: wiktextract.verbForms.praeteritum,
          partizipIi: wiktextract.verbForms.partizipIi,
          perfekt: wiktextract.verbForms.perfekt,
          aux: wiktextract.verbForms.auxiliaries.length === 1 ? wiktextract.verbForms.auxiliaries[0] : undefined,
          auxiliaries: wiktextract.verbForms.auxiliaries,
          perfektOptions: wiktextract.verbForms.perfektOptions,
        });
      }
      if (wiktextract.nounForms) {
        suggestions.nounForms.push({
          source: 'kaikki.org',
          genders: wiktextract.nounForms.genders,
          plurals: wiktextract.nounForms.plurals,
          forms: wiktextract.nounForms.forms,
        });
      }
      if (wiktextract.adjectiveForms) {
        suggestions.adjectiveForms.push({
          source: 'kaikki.org',
          comparatives: wiktextract.adjectiveForms.comparatives,
          superlatives: wiktextract.adjectiveForms.superlatives,
          forms: wiktextract.adjectiveForms.forms,
        });
      }
      if (wiktextract.prepositionAttributes) {
        suggestions.prepositionAttributes.push({
          source: 'kaikki.org',
          cases: wiktextract.prepositionAttributes.cases,
          notes: wiktextract.prepositionAttributes.notes,
        });
      }
      suggestions.posLabel = wiktextract.posLabel;
      suggestions.posTags = sortStrings(wiktextract.posTags);
      suggestions.posNotes = sortStrings(wiktextract.posNotes);
    }
  } catch {
    // Ignore provider failures and fall back to the remaining providers.
  }

  const needsEnglish = !pickPreferredEnglishTranslationCandidate(suggestions.translations);
  if (needsEnglish) {
    try {
      const translation = await lookupTranslation(word.lemma);
      if (translation?.translation?.trim()) {
        suggestions.translations.push({
          value: translation.translation.trim(),
          source: translation.source,
          language: translation.language ?? null,
          confidence: translation.confidence ?? null,
        });
      }
    } catch {
      // Ignore provider failures and fall back to the remaining providers.
    }
  }

  const needsExample = !pickExampleCandidate(suggestions.examples);
  if (needsExample) {
    try {
      const example = await lookupExampleSentence(word.lemma);
      if (example) {
        suggestions.examples.push({
          source: example.source,
          sentence: example.sentence?.trim(),
          translations: example.translations ?? null,
          exampleDe: example.exampleDe?.trim(),
          exampleEn: example.exampleEn?.trim(),
        });
      }
    } catch {
      // Ignore provider failures and fall back to the remaining providers.
    }
  }

  return suggestions;
}

function determineProviderPatch(
  word: Word,
  suggestions: ProviderSuggestions,
  options: ProviderWordEnrichmentOptions,
): WordUpdateInput {
  const { overwrite = false } = options;
  const patch: WordUpdateInput = {};

  const englishCandidate = pickPreferredEnglishTranslationCandidate(suggestions.translations);
  const mergedTranslations = mergeTranslationRecords(word.translations, suggestions.translations);
  if (!areTranslationRecordsEqual(word.translations, mergedTranslations)) {
    patch.translations = mergedTranslations;
  }
  if (
    englishCandidate &&
    (overwrite || isBlank(word.english)) &&
    word.english !== englishCandidate.value
  ) {
    patch.english = englishCandidate.value;
  }

  const mergedExamples = mergeExampleRecords(word.examples, suggestions.examples);
  if (!examplesEqual(word.examples ?? null, mergedExamples ?? null)) {
    patch.examples = toWordUpdateExamples(mergedExamples);
  }

  const exampleCandidate = pickExampleCandidate(suggestions.examples);
  const exampleDeCandidate = exampleCandidate?.exampleDe?.trim() || exampleCandidate?.sentence?.trim();
  const exampleEnCandidate = exampleCandidate?.exampleEn?.trim() || exampleCandidate?.translations?.en?.trim();
  if (exampleCandidate && exampleDeCandidate && (overwrite || isBlank(word.exampleDe)) && word.exampleDe !== exampleDeCandidate) {
    patch.exampleDe = exampleDeCandidate;
  }
  if (exampleCandidate && exampleEnCandidate && (overwrite || isBlank(word.exampleEn)) && word.exampleEn !== exampleEnCandidate) {
    patch.exampleEn = exampleEnCandidate;
  }

  if (word.pos === 'N') {
    const genderCandidate = pickPreferredGenderCandidate(suggestions.nounForms);
    if (genderCandidate && (overwrite || isBlank(word.gender)) && word.gender !== genderCandidate.value) {
      patch.gender = genderCandidate.value;
    }

    const pluralCandidate = pickPreferredPluralCandidate(suggestions.nounForms);
    if (pluralCandidate && (overwrite || isBlank(word.plural)) && word.plural !== pluralCandidate.value) {
      patch.plural = pluralCandidate.value;
    }
  }

  if (word.pos === 'Adj') {
    const comparativeCandidate = pickPreferredAdjectiveCandidate(suggestions.adjectiveForms, 'comparative');
    if (
      comparativeCandidate &&
      (overwrite || isBlank(word.comparative)) &&
      word.comparative !== comparativeCandidate.value
    ) {
      patch.comparative = comparativeCandidate.value;
    }

    const superlativeCandidate = pickPreferredAdjectiveCandidate(suggestions.adjectiveForms, 'superlative');
    if (
      superlativeCandidate &&
      (overwrite || isBlank(word.superlative)) &&
      word.superlative !== superlativeCandidate.value
    ) {
      patch.superlative = superlativeCandidate.value;
    }
  }

  if (word.pos === 'V') {
    const verbFormCandidate = suggestions.verbForms.find((candidate) =>
      Boolean(candidate.praeteritum?.trim() || candidate.partizipIi?.trim() || candidate.perfekt?.trim() || candidate.aux),
    );

    if (verbFormCandidate) {
      const maybeApplyVerbField = (
        field: 'praeteritum' | 'partizipIi' | 'perfekt',
        value: string | undefined,
      ) => {
        const cleaned = value?.trim();
        if (!cleaned) {
          return;
        }
        if (
          field === 'perfekt' &&
          verbFormCandidate.perfektOptions &&
          verbFormCandidate.perfektOptions.length > 1
        ) {
          return;
        }
        if ((overwrite || isBlank(word[field])) && word[field] !== cleaned) {
          patch[field] = cleaned;
        }
      };

      maybeApplyVerbField('praeteritum', verbFormCandidate.praeteritum);
      maybeApplyVerbField('partizipIi', verbFormCandidate.partizipIi);
      maybeApplyVerbField('perfekt', verbFormCandidate.perfekt);

      let candidateAux: AuxValue | undefined;
      const auxiliaryOptions = verbFormCandidate.auxiliaries
        ?.map((value) => value.trim().toLowerCase())
        .filter(Boolean);

      if (auxiliaryOptions?.length) {
        const set = new Set(auxiliaryOptions);
        if (set.has('haben') && set.has('sein')) {
          candidateAux = 'haben / sein';
        } else if (set.size === 1) {
          const [value] = Array.from(set.values());
          candidateAux = toAuxValue(value);
        }
      }

      if (!candidateAux && verbFormCandidate.aux) {
        candidateAux = toAuxValue(verbFormCandidate.aux);
      }

      if (candidateAux && (overwrite || isBlank(word.aux)) && word.aux !== candidateAux) {
        patch.aux = candidateAux;
      }

      const effectiveAux = patch.aux ?? toAuxValue(word.aux) ?? candidateAux;
      const effectivePartizip = patch.partizipIi ?? word.partizipIi;
      const effectivePerfekt = patch.perfekt ?? word.perfekt;
      if (effectiveAux && effectivePartizip && isBlank(effectivePerfekt)) {
        const derivedPerfekt = buildPerfektFromForms(effectiveAux, effectivePartizip);
        if (derivedPerfekt && word.perfekt !== derivedPerfekt) {
          patch.perfekt = derivedPerfekt;
        }
      }
    }
  }

  const mergedPosAttributes = mergePosAttributes(word, suggestions);
  if (!arePosAttributesEqual(word.posAttributes, mergedPosAttributes)) {
    patch.posAttributes = toWordUpdatePosAttributes(mergedPosAttributes);
  }

  return patch;
}

function applyPatchPreview(word: Word, patch: WordUpdateInput): Word {
  const nextWord: Word = { ...word };
  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined) {
      continue;
    }
    (nextWord as Record<string, unknown>)[key] = value;
  }
  return nextWord;
}

function mergeProviderAndFallbackPatches(
  providerPatch: WordUpdateInput,
  fallbackPatch: WordUpdateInput,
): WordUpdateInput {
  const merged: WordUpdateInput = { ...providerPatch };
  const providerContent = stripEnrichmentMetadata(providerPatch);

  for (const [key, value] of Object.entries(stripEnrichmentMetadata(fallbackPatch))) {
    if (value === undefined) {
      continue;
    }
    if (Object.prototype.hasOwnProperty.call(providerContent, key)) {
      continue;
    }
    (merged as Record<string, unknown>)[key] = value;
  }

  return merged;
}

export async function buildProviderFirstWordEnrichment(
  word: Word,
  options: ProviderWordEnrichmentOptions = {},
): Promise<WordUpdateInput> {
  const providerSuggestions = await collectProviderSuggestions(word);
  const providerPatch = determineProviderPatch(word, providerSuggestions, options);

  let combinedPatch = { ...providerPatch };

  if (options.useGroqFallback !== false) {
    const fallbackWord = applyPatchPreview(word, providerPatch);
    const fallbackPatch = await buildGroqWordEnrichment(fallbackWord, { overwrite: false });
    combinedPatch = mergeProviderAndFallbackPatches(providerPatch, fallbackPatch);
  }

  const contentPatch = stripEnrichmentMetadata(combinedPatch);
  if (Object.keys(contentPatch).length === 0) {
    return {};
  }

  return {
    ...contentPatch,
    enrichmentAppliedAt: new Date(),
    enrichmentMethod: 'manual_api',
  };
}
