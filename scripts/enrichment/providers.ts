import fetch from "node-fetch";

import type { PartOfSpeech } from "@shared/types";

const REQUEST_HEADERS = {
  Accept: "application/json",
  "User-Agent": "GermanVerbMaster/1.0 (data enrichment pipeline)",
};

const KAIKKI_GERMAN_BASE = "https://kaikki.org/dictionary/German/meaning";
const KAIKKI_ENGLISH_BASE = "https://kaikki.org/dictionary/English/meaning";
const OPEN_THESAURUS_API = "https://www.openthesaurus.de/synonyme/search";
const MY_MEMORY_API = "https://api.mymemory.translated.net/get";
const TATOEBA_API = "https://tatoeba.org/en/api_v0/search";
const OPENAI_CHAT_COMPLETIONS = "https://api.openai.com/v1/chat/completions";

export interface SynonymLookup {
  synonyms: string[];
}

export interface TranslationLookup {
  translation?: string;
  source: string;
  confidence?: number;
  language?: string;
}

export interface ExampleLookup {
  sentence?: string;
  translations?: Record<string, string | null | undefined> | null;
  exampleDe?: string;
  exampleEn?: string;
  source: string;
}

export interface AiLookup {
  translation?: string;
  sentence?: string;
  translations?: Record<string, string | null | undefined> | null;
  exampleDe?: string;
  exampleEn?: string;
  source: string;
}

interface MyMemoryMatch {
  translation?: string;
  quality?: number;
  match?: number;
}

interface MyMemoryResponse {
  responseData?: {
    translatedText?: string;
    match?: number;
  };
  matches?: MyMemoryMatch[];
}

interface TatoebaTranslation {
  lang?: string;
  text?: string;
}

interface TatoebaResponse {
  results?: Array<{
    text?: string;
    translations?: TatoebaTranslation[];
  }>;
}

interface KaikkiFormEntry {
  form?: string;
  tags?: string[];
  source?: string;
}

interface KaikkiExampleEntry {
  text?: string;
  translation?: string;
  english?: string;
}

interface KaikkiTranslationEntry {
  word?: string;
  lang?: string;
  lang_code?: string;
}

interface KaikkiSynonymEntry {
  word?: string;
}

interface KaikkiSenseFormOfEntry {
  word?: string;
}

interface KaikkiSenseEntry {
  examples?: KaikkiExampleEntry[];
  translations?: KaikkiTranslationEntry[];
  glosses?: string[];
  raw_glosses?: string[];
  synonyms?: KaikkiSynonymEntry[];
  tags?: string[];
  categories?: string[];
  form_of?: KaikkiSenseFormOfEntry[];
}

interface KaikkiHeadTemplate {
  expansion?: string;
  name?: string;
  args?: Record<string, string>;
}

interface KaikkiEntry {
  word?: string;
  lang?: string;
  lang_code?: string;
  pos?: string;
  forms?: KaikkiFormEntry[];
  senses?: KaikkiSenseEntry[];
  head_templates?: KaikkiHeadTemplate[];
  synonyms?: KaikkiSynonymEntry[];
  categories?: string[];
}

interface WiktextractVerbForms {
  praeteritum?: string;
  partizipIi?: string;
  perfekt?: string;
  perfektOptions: string[];
  auxiliaries: string[];
}

interface WiktextractNounForms {
  genders: string[];
  plurals: string[];
  forms: Array<{ form: string; tags: string[] }>;
}

interface WiktextractAdjectiveForms {
  comparatives: string[];
  superlatives: string[];
  forms: Array<{ form: string; tags: string[] }>;
}

interface WiktextractPrepositionAttributes {
  cases: string[];
  notes: string[];
}

export interface WiktextractTranslation {
  value: string;
  language?: string;
}

export interface WiktextractExample {
  sentence?: string;
  translations?: Record<string, string | null | undefined> | null;
  exampleDe?: string;
  exampleEn?: string;
}

export interface WiktextractLookup {
  translations: WiktextractTranslation[];
  synonyms: string[];
  examples: WiktextractExample[];
  englishHints: string[];
  verbForms?: WiktextractVerbForms;
  nounForms?: WiktextractNounForms;
  adjectiveForms?: WiktextractAdjectiveForms;
  prepositionAttributes?: WiktextractPrepositionAttributes;
  posLabel?: string;
  posTags: string[];
  posNotes: string[];
  sourceDe: string;
  pivotUsed: boolean;
}

function toArray<T>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}

const CASE_TAGS = new Set([
  "nominative",
  "genitive",
  "dative",
  "accusative",
  "instrumental",
  "ablative",
  "locative",
  "vocative",
]);

const GENDER_MAP: Record<string, string> = {
  masculine: "der",
  feminine: "die",
  neuter: "das",
};

const POS_MAP: Record<string, string[]> = {
  v: ["verb"],
  verb: ["verb"],
  "verb form": ["verb"],
  n: ["noun", "proper noun"],
  noun: ["noun", "proper noun"],
  "noun form": ["noun", "proper noun"],
  "proper noun": ["proper noun", "noun"],
  adj: ["adjective", "adj"],
  "adj form": ["adjective", "adj"],
  adjective: ["adjective", "adj"],
  "adjective form": ["adjective", "adj"],
  adv: ["adverb", "adv"],
  "adv form": ["adverb", "adv"],
  adverb: ["adverb", "adv"],
  "adverb form": ["adverb", "adv"],
  prep: ["preposition", "prep"],
  "prep form": ["preposition", "prep"],
  preposition: ["preposition", "prep"],
  "preposition form": ["preposition", "prep"],
  präp: ["preposition", "prep"],
  präposition: ["preposition", "prep"],
  "präposition form": ["preposition", "prep"],
  praep: ["preposition", "prep"],
  prap: ["preposition", "prep"],
  pron: ["pronoun", "pron"],
  "pron form": ["pronoun", "pron"],
  pronoun: ["pronoun", "pron"],
  "pronoun form": ["pronoun", "pron"],
  det: ["determiner", "article", "det"],
  determiner: ["determiner", "article", "det"],
  "determiner form": ["determiner", "article", "det"],
  artikel: ["article", "determiner", "det"],
  konj: ["conjunction", "konj"],
  "konj form": ["conjunction", "konj"],
  conjunction: ["conjunction", "konj"],
  "conjunction form": ["conjunction", "konj"],
  konjunktion: ["conjunction", "konj"],
  num: ["numeral", "num"],
  "num form": ["numeral", "num"],
  numeral: ["numeral", "num"],
  "numeral form": ["numeral", "num"],
  part: ["particle", "part", "interjection", "intj", "adverb", "adv"],
  "part form": ["particle", "part", "interjection", "intj", "adverb", "adv"],
  particle: ["particle", "part", "interjection", "intj", "adverb", "adv"],
  "particle form": ["particle", "part", "interjection", "intj", "adverb", "adv"],
  partikel: ["particle", "part", "interjection", "intj", "adverb", "adv"],
  intj: ["interjection", "intj"],
  interj: ["interjection", "intj"],
  interjection: ["interjection", "intj"],
  "interjection form": ["interjection", "intj"],
};

const UMLAUT_MAP: Record<string, string> = {
  ä: "ae",
  ö: "oe",
  ü: "ue",
  ß: "ss",
};

function buildPosAliasKeys(value: string): string[] {
  const trimmed = value.trim();
  if (!trimmed) {
    return [];
  }

  const lower = trimmed.toLowerCase();
  const keys = new Set<string>();
  const pushKey = (candidate: string | undefined | null) => {
    const cleaned = candidate?.trim();
    if (!cleaned) {
      return;
    }
    keys.add(cleaned);
  };

  const withoutTrailingDots = lower.replace(/\.+$/g, "");
  const ascii = lower.replace(/[äöüß]/g, (char) => UMLAUT_MAP[char] ?? char);
  const asciiWithoutDots = ascii.replace(/\.+$/g, "");

  pushKey(lower);
  pushKey(withoutTrailingDots);
  pushKey(ascii);
  pushKey(asciiWithoutDots);

  return Array.from(keys.values());
}

function resolvePosAliases(value: string | undefined): string[] {
  if (!value) {
    return [];
  }

  const candidates = buildPosAliasKeys(value);
  if (!candidates.length) {
    return [];
  }

  const resolved = new Set<string>();

  for (const candidate of candidates) {
    resolved.add(candidate);
    const direct = POS_MAP[candidate];
    if (direct) {
      for (const alias of direct) {
        resolved.add(alias);
      }
    }
  }

  return Array.from(resolved.values());
}

const CASE_PATTERNS: Array<{ matcher: RegExp; values: string[] }> = [
  { matcher: /\bakkusativ\b|\baccusative\b/i, values: ["Akkusativ"] },
  { matcher: /\bdativ\b|\bdative\b/i, values: ["Dativ"] },
  { matcher: /\bgenitiv\b|\bgenitive\b/i, values: ["Genitiv"] },
  {
    matcher: /\bwechselpr[aä]position\b|\btwo[-\s]?way\b|\bzweifach(?:e|en)?\b/i,
    values: ["Akkusativ", "Dativ"],
  },
];

const CASE_CATEGORY_MATCHERS: Array<{ matcher: RegExp; values: string[] }> = [
  { matcher: /accusative/i, values: ["Akkusativ"] },
  { matcher: /dative/i, values: ["Dativ"] },
  { matcher: /genitive/i, values: ["Genitiv"] },
  { matcher: /two[-\s]?way/i, values: ["Akkusativ", "Dativ"] },
  { matcher: /wechselpr[aä]position/i, values: ["Akkusativ", "Dativ"] },
];

const NOTE_BLACKLIST = new Set(["table-tags", "inflection-template", "error-unrecognized-form"]);

const POS_TAG_BLACKLIST = new Set([
  "noun",
  "proper noun",
  "verb",
  "adjective",
  "adverb",
  "preposition",
  "pronoun",
  "determiner",
  "article",
  "numeral",
  "particle",
  "interjection",
  "case",
  "tense",
  "person",
  "plural",
  "singular",
  "masculine",
  "feminine",
  "neuter",
  "past",
  "present",
  "future",
  "imperative",
  "indicative",
  "subjunctive",
  "comparative",
  "superlative",
  "positive",
  "qualifier",
  "table-tags",
  "head",
]);

const POS_TAG_PATTERNS: Array<{
  matcher: RegExp;
  transform?: (value: string) => string;
}> = [
  { matcher: /^class-\d+$/i, transform: (value) => value.replace(/-/g, " ") },
  { matcher: /^(?:transitive|intransitive|reflexive|impersonal|pronominal)$/i },
  { matcher: /^(?:separable|inseparable|nonseparable|non-separable)$/i },
  { matcher: /^(?:auxiliary|modal)$/i },
  { matcher: /^(?:strong|weak|irregular|regular)$/i },
  { matcher: /^(?:colloquial|slang|formal|informal|obsolete|archaic|dated|poetic|figurative|idiomatic|rare|vulgar|derogatory|diminutive|pejorative)$/i },
  { matcher: /^(?:countable|uncountable|usually countable|invariable)$/i },
];

const POS_NOTE_FILTERS: RegExp[] = [
  /\blemmas?\b/i,
  /\bterms? derived from\b/i,
  /\bterms? borrowed from\b/i,
  /\bterms? prefixed with\b/i,
  /\bterms? suffixed with\b/i,
  /\bterms? spelled with\b/i,
  /\bentries with\b/i,
];

function normaliseLemma(lemma: string): string {
  return lemma.normalize("NFC").trim();
}

function buildKaikkiEntryUrl(base: string, lemma: string): string {
  const normalised = normaliseLemma(lemma);
  const first = normalised[0] ?? "_";
  const firstTwo = normalised.slice(0, 2) || first;
  const encoded = encodeURIComponent(normalised);
  return `${base}/${first}/${firstTwo}/${encoded}.jsonl`;
}

function buildKaikkiEntryUrlCandidates(base: string, lemma: string): string[] {
  const trimmed = normaliseLemma(lemma);
  if (!trimmed) {
    return [];
  }

  const variants: string[] = [];
  const seen = new Set<string>();
  const pushVariant = (value: string | undefined | null) => {
    if (!value) return;
    const candidate = normaliseLemma(value);
    if (!candidate || seen.has(candidate)) return;
    seen.add(candidate);
    variants.push(candidate);
  };

  pushVariant(trimmed);
  pushVariant(trimmed[0]?.toLocaleUpperCase("de-DE") + trimmed.slice(1));
  pushVariant(trimmed.toLocaleLowerCase("de-DE"));
  pushVariant(trimmed.toLowerCase());

  return variants.map((variant) => buildKaikkiEntryUrl(base, variant));
}

async function fetchKaikkiEntries(base: string, lemma: string): Promise<{
  url: string | null;
  entries: KaikkiEntry[];
}> {
  const candidates = buildKaikkiEntryUrlCandidates(base, lemma);
  if (!candidates.length) {
    return { url: null, entries: [] };
  }

  let lastUrl: string | null = null;

  for (const url of candidates) {
    lastUrl = url;
    const entries = await fetchJsonLines<KaikkiEntry>(url);
    if (entries.length) {
      return { url, entries };
    }
  }

  return { url: lastUrl, entries: [] };
}

async function fetchJsonLines<T>(url: string): Promise<T[]> {
  const response = await fetch(url, { headers: REQUEST_HEADERS });
  if (!response) {
    return [];
  }
  if (response.status === 404) {
    return [];
  }
  if (!response.ok) {
    throw new Error(`Request failed with status ${response.status}: ${await response.text()}`);
  }
  const text = await response.text();
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => JSON.parse(line) as T);
}

function hasTag(entry: KaikkiFormEntry, ...expected: string[]): boolean {
  const tags = entry.tags?.map((tag) => tag.toLowerCase()) ?? [];
  return expected.every((needle) => tags.includes(needle.toLowerCase()));
}

function normaliseTags(tags: string[] | undefined): string[] {
  if (!Array.isArray(tags)) {
    return [];
  }
  return tags
    .map((tag) => tag.trim().toLowerCase())
    .filter((tag, index, array) => tag && array.indexOf(tag) === index);
}

function isInflectionEntry(entry: KaikkiEntry): boolean {
  const senses = toArray<KaikkiSenseEntry>(entry.senses);
  const templates = toArray<KaikkiHeadTemplate>(entry.head_templates);

  const templateIndicatesForm = templates.some((template) => {
    const values = Object.values(template.args ?? {});
    return values.some((value) => typeof value === "string" && value.trim().toLowerCase().includes("form"));
  });

  if (!senses.length) {
    return templateIndicatesForm;
  }

  const sensesAreInflections = senses.every((sense) => {
    const tags = normaliseTags(sense.tags);
    const hasFormOf = toArray<KaikkiSenseFormOfEntry>(sense.form_of).length > 0;
    const glosses = toArray<string>(sense.glosses).map((gloss) => gloss.toLowerCase());
    const rawGlosses = toArray<string>(sense.raw_glosses).map((gloss) => gloss.toLowerCase());
    const glossMentionsInflection = [...glosses, ...rawGlosses].some((gloss) => gloss.includes("inflection of"));
    const hasInflectionTag =
      tags.includes("form-of") ||
      tags.includes("inflection") ||
      tags.includes("inflected") ||
      tags.includes("inflection-of");
    return hasFormOf || hasInflectionTag || glossMentionsInflection;
  });

  return sensesAreInflections || templateIndicatesForm;
}

function collectAuxiliaries(entry: KaikkiEntry): string[] {
  const auxiliaries = new Set<string>();
  const pushCandidates = (value: string | undefined) => {
    if (!value) return;
    value
      .split(/[,;/]|\bor\b|\border\b|\bund\b|\boder\b/gi)
      .map((part) => part.trim().toLowerCase())
      .forEach((part) => {
        if (part === "haben" || part === "sein") {
          auxiliaries.add(part);
        }
      });
  };

  for (const form of toArray<KaikkiFormEntry>(entry.forms)) {
    if (hasTag(form, "auxiliary")) {
      pushCandidates(form.form);
    }
  }

  for (const template of toArray<KaikkiHeadTemplate>(entry.head_templates)) {
    if (!template.expansion) continue;
    pushCandidates(template.expansion);
  }

  for (const sense of toArray<KaikkiSenseEntry>(entry.senses)) {
    for (const raw of toArray<string>(sense.raw_glosses)) {
      pushCandidates(raw);
    }
    for (const gloss of toArray<string>(sense.glosses)) {
      pushCandidates(gloss);
    }
  }

  return Array.from(auxiliaries);
}

function extractVerbForms(entry: KaikkiEntry): WiktextractVerbForms | undefined {
  const forms = toArray<KaikkiFormEntry>(entry.forms);
  if (!forms.length) {
    return undefined;
  }

  const auxiliaries = collectAuxiliaries(entry);

  const praeteritumCandidate = forms.find((form) => {
    if (!form.form) return false;
    const tags = form.tags?.map((tag) => tag.toLowerCase()) ?? [];
    if (tags.includes("subjunctive") || tags.includes("subjunctive-i") || tags.includes("subjunctive-ii")) {
      return false;
    }
    return tags.includes("past") || tags.includes("preterite");
  });

  const partizipCandidate = forms.find((form) => {
    if (!form.form) return false;
    const tags = form.tags?.map((tag) => tag.toLowerCase()) ?? [];
    return tags.includes("participle") && (tags.includes("past") || tags.includes("perfect"));
  });

  const perfektOptions = forms
    .filter((form) => form.form && hasTag(form, "perfect"))
    .map((form) => form.form!.trim())
    .filter(Boolean);

  const perfekt = perfektOptions.find((value) => /\bist\b|\bhat\b/.test(value)) ?? perfektOptions[0];

  if (!praeteritumCandidate && !partizipCandidate && !perfekt && !auxiliaries.length) {
    return undefined;
  }

  return {
    praeteritum: praeteritumCandidate?.form?.trim(),
    partizipIi: partizipCandidate?.form?.trim(),
    perfekt: perfekt?.trim(),
    perfektOptions,
    auxiliaries,
  };
}

function collectExamples(entry: KaikkiEntry): WiktextractExample[] {
  const results: WiktextractExample[] = [];
  const seen = new Set<string>();

  for (const sense of toArray<KaikkiSenseEntry>(entry.senses)) {
    for (const example of toArray<KaikkiExampleEntry>(sense.examples)) {
      const exampleDe = example.text?.trim();
      const exampleEn = example.translation?.trim() || example.english?.trim();
      if (!exampleDe && !exampleEn) {
        continue;
      }
      const key = `${(exampleDe ?? "").toLowerCase()}::${(exampleEn ?? "").toLowerCase()}`;
      if (seen.has(key)) {
        continue;
      }
      seen.add(key);
      results.push({
        sentence: exampleDe || undefined,
        translations: exampleEn ? { en: exampleEn } : undefined,
        exampleDe: exampleDe || undefined,
        exampleEn: exampleEn || undefined,
      });
    }
  }

  return results;
}

function collectSynonyms(entry: KaikkiEntry): string[] {
  const synonyms = new Set<string>();
  for (const synonym of toArray<KaikkiSynonymEntry>(entry.synonyms)) {
    const word = synonym.word?.trim();
    if (word) {
      synonyms.add(word);
    }
  }
  for (const sense of toArray<KaikkiSenseEntry>(entry.senses)) {
    for (const synonym of toArray<KaikkiSynonymEntry>(sense.synonyms)) {
      const word = synonym.word?.trim();
      if (word) {
        synonyms.add(word);
      }
    }
  }
  return Array.from(synonyms);
}

function extractPrepositionAttributes(entry: KaikkiEntry): WiktextractPrepositionAttributes | undefined {
  if (!entry) return undefined;
  const cases = new Set<string>();
  const notes = new Set<string>();

  const inspect = (value: string | undefined | null) => {
    if (!value) return;
    const trimmed = value.trim();
    if (!trimmed) return;
    const lower = trimmed.toLowerCase();
    for (const { matcher, values } of CASE_PATTERNS) {
      if (matcher.test(lower)) {
        values.forEach((item) => cases.add(item));
      }
    }
  };

  const inspectCategory = (value: string | undefined | null) => {
    if (!value) return;
    const trimmed = value.trim();
    if (!trimmed) return;
    const lower = trimmed.toLowerCase();
    for (const { matcher, values } of CASE_CATEGORY_MATCHERS) {
      if (matcher.test(lower)) {
        values.forEach((item) => cases.add(item));
      }
    }
  };

  const addNote = (value: string | undefined | null) => {
    if (!value) return;
    const trimmed = value.trim();
    if (!trimmed) return;
    if (NOTE_BLACKLIST.has(trimmed.toLowerCase())) {
      return;
    }
    notes.add(trimmed);
  };

  for (const category of toArray<string>(entry.categories)) {
    inspectCategory(category);
  }

  for (const sense of toArray<KaikkiSenseEntry>(entry.senses)) {
    for (const gloss of toArray<string>(sense.glosses)) {
      inspect(gloss);
    }
    for (const raw of toArray<string>(sense.raw_glosses)) {
      inspect(raw);
    }
    for (const tag of toArray<string>(sense.tags)) {
      addNote(tag);
    }
    for (const category of toArray<string>(sense.categories)) {
      inspectCategory(category);
    }
  }

  if (!cases.size && !notes.size) {
    return undefined;
  }

  return {
    cases: Array.from(cases.values()).sort(),
    notes: Array.from(notes.values()).sort(),
  } satisfies WiktextractPrepositionAttributes;
}

function normalisePosDescriptor(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

function resolvePosTag(value: string | undefined | null): { tag?: string; note?: string } | null {
  if (!value) return null;
  const trimmed = normalisePosDescriptor(value);
  if (!trimmed) return null;
  const lower = trimmed.toLowerCase();
  if (NOTE_BLACKLIST.has(lower) || POS_TAG_BLACKLIST.has(lower)) {
    return null;
  }

  for (const { matcher, transform } of POS_TAG_PATTERNS) {
    if (matcher.test(lower)) {
      const resolved = transform ? transform(trimmed) : trimmed;
      return { tag: normalisePosDescriptor(resolved) };
    }
  }

  if (/^(?:[a-z][a-z\s'-]{1,32})$/i.test(trimmed) && !POS_TAG_BLACKLIST.has(lower)) {
    return { tag: trimmed.toLowerCase() };
  }

  return { note: trimmed };
}

function normalisePosNote(value: string | undefined | null): string | null {
  if (!value) return null;
  const trimmed = normalisePosDescriptor(value);
  if (!trimmed) return null;
  const lower = trimmed.toLowerCase();
  if (NOTE_BLACKLIST.has(lower)) {
    return null;
  }
  if (POS_NOTE_FILTERS.some((pattern) => pattern.test(lower))) {
    return null;
  }
  const withoutPrefix = trimmed.replace(/^German\s+/i, "").trim();
  return withoutPrefix || null;
}

function collectPosMetadata(entry: KaikkiEntry): { tags: string[]; notes: string[] } {
  const tagMap = new Map<string, string>();
  const noteMap = new Map<string, string>();

  const addTag = (value: string | undefined | null) => {
    if (!value) return;
    const normalised = normalisePosDescriptor(value);
    if (!normalised) return;
    const key = normalised.toLowerCase();
    if (!tagMap.has(key)) {
      tagMap.set(key, normalised);
    }
  };

  const addNote = (value: string | undefined | null) => {
    const normalised = normalisePosNote(value);
    if (!normalised) return;
    const key = normalised.toLowerCase();
    if (!noteMap.has(key)) {
      noteMap.set(key, normalised);
    }
  };

  for (const category of toArray<string>(entry.categories)) {
    addNote(category);
  }

  for (const sense of toArray<KaikkiSenseEntry>(entry.senses)) {
    for (const tag of toArray<string>(sense.tags)) {
      const resolved = resolvePosTag(tag);
      if (!resolved) continue;
      if (resolved.tag) {
        addTag(resolved.tag);
      }
      if (resolved.note) {
        addNote(resolved.note);
      }
    }
    for (const category of toArray<string>(sense.categories)) {
      addNote(category);
    }
  }

  const tags = Array.from(tagMap.values()).sort((a, b) => a.localeCompare(b));
  const notes = Array.from(noteMap.values()).sort((a, b) => a.localeCompare(b));
  return { tags, notes };
}

function collectGlosses(entry: KaikkiEntry): string[] {
  const glosses: string[] = [];
  for (const sense of toArray<KaikkiSenseEntry>(entry.senses)) {
    for (const gloss of toArray<string>(sense.glosses)) {
      const cleaned = gloss.trim();
      if (cleaned) {
        glosses.push(cleaned);
      }
    }
    if (!sense.glosses?.length) {
      for (const raw of toArray<string>(sense.raw_glosses)) {
        const cleaned = raw.replace(/\[[^\]]*\]/g, "").trim();
        if (cleaned) {
          glosses.push(cleaned);
        }
      }
    }
  }
  return Array.from(new Set(glosses));
}

function collectTranslations(entry: KaikkiEntry): WiktextractTranslation[] {
  const translations = new Map<string, WiktextractTranslation>();
  for (const sense of toArray<KaikkiSenseEntry>(entry.senses)) {
    for (const translation of toArray<KaikkiTranslationEntry>(sense.translations)) {
      const word = translation.word?.trim();
      if (!word) continue;
      const language = translation.lang?.trim() || translation.lang_code?.trim();
      const key = `${word.toLowerCase()}::${(language ?? "").toLowerCase()}`;
      if (!translations.has(key)) {
        translations.set(key, { value: word, language: language || undefined });
      }
    }
  }
  return Array.from(translations.values());
}

function extractNounForms(entry: KaikkiEntry): WiktextractNounForms | undefined {
  const forms = toArray<KaikkiFormEntry>(entry.forms);
  const genders = new Set<string>();
  const plurals = new Set<string>();
  const records: Array<{ form: string; tags: string[] }> = [];

  const pushGender = (value: string | undefined) => {
    if (!value) return;
    const normalised = value.trim().toLowerCase();
    if (!normalised) return;
    const mapped = GENDER_MAP[normalised] ?? (GENDER_MAP[normalised.replace(/[^a-z]+/g, "")] ?? undefined);
    if (mapped) {
      genders.add(mapped);
    } else if (normalised === "der" || normalised === "die" || normalised === "das") {
      genders.add(normalised);
    }
  };

  for (const form of forms) {
    const formValue = form.form?.trim();
    if (!formValue) continue;
    const tags = normaliseTags(form.tags);
    if (tags.includes("plural")) {
      plurals.add(formValue);
    }
    if (tags.some((tag) => GENDER_MAP[tag])) {
      for (const tag of tags) {
        pushGender(tag);
      }
    }
    if (tags.length) {
      records.push({ form: formValue, tags });
    }
  }

  for (const template of toArray<KaikkiHeadTemplate>(entry.head_templates)) {
    const expansion = template.expansion?.trim();
    if (!expansion) continue;
    const article = expansion.split(/\s+/)[0]?.trim().toLowerCase();
    pushGender(article);
  }

  for (const sense of toArray<KaikkiSenseEntry>(entry.senses)) {
    for (const gloss of toArray<string>(sense.glosses)) {
      const lower = gloss.trim().toLowerCase();
      if (lower.includes("masculine")) pushGender("masculine");
      if (lower.includes("feminine")) pushGender("feminine");
      if (lower.includes("neuter")) pushGender("neuter");
    }
    for (const raw of toArray<string>(sense.raw_glosses)) {
      const lower = raw.trim().toLowerCase();
      if (lower.includes("masculine")) pushGender("masculine");
      if (lower.includes("feminine")) pushGender("feminine");
      if (lower.includes("neuter")) pushGender("neuter");
    }
  }

  if (!genders.size && !plurals.size && !records.length) {
    return undefined;
  }

  // Include additional case forms for plural/declensions when not already captured.
  for (const form of forms) {
    const formValue = form.form?.trim();
    if (!formValue) continue;
    const tags = normaliseTags(form.tags);
    if (!tags.length) continue;
    if (!records.some((record) => record.form === formValue && record.tags.join("|") === tags.join("|"))) {
      if (tags.some((tag) => CASE_TAGS.has(tag)) || tags.includes("plural")) {
        records.push({ form: formValue, tags });
      }
    }
  }

  const sortedRecords = records.sort((a, b) => a.form.localeCompare(b.form));

  return {
    genders: Array.from(genders).sort(),
    plurals: Array.from(plurals).sort(),
    forms: sortedRecords,
  };
}

function extractAdjectiveForms(entry: KaikkiEntry): WiktextractAdjectiveForms | undefined {
  const forms = toArray<KaikkiFormEntry>(entry.forms);
  const comparatives = new Set<string>();
  const superlatives = new Set<string>();
  const records: Array<{ form: string; tags: string[] }> = [];

  for (const form of forms) {
    const formValue = form.form?.trim();
    if (!formValue) continue;
    const tags = normaliseTags(form.tags);
    if (!tags.length) continue;
    if (tags.includes("comparative")) {
      comparatives.add(formValue);
    }
    if (tags.includes("superlative")) {
      superlatives.add(formValue);
    }
    records.push({ form: formValue, tags });
  }

  if (!comparatives.size && !superlatives.size && !records.length) {
    return undefined;
  }

  const sortedRecords = records.sort((a, b) => a.form.localeCompare(b.form));

  return {
    comparatives: Array.from(comparatives).sort(),
    superlatives: Array.from(superlatives).sort(),
    forms: sortedRecords,
  };
}

function resolveTargetPos(pos?: PartOfSpeech | string): string[] | undefined {
  if (pos === undefined || pos === null) {
    return undefined;
  }
  const resolved = resolvePosAliases(String(pos));
  return resolved.length ? resolved : undefined;
}

export async function lookupWiktextract(
  lemma: string,
  pos?: PartOfSpeech | string,
): Promise<WiktextractLookup | null> {
  const trimmed = lemma.trim();
  if (!trimmed) {
    return null;
  }

  const { url: germanUrl, entries: germanEntries } = await fetchKaikkiEntries(
    KAIKKI_GERMAN_BASE,
    trimmed,
  );
  if (!germanEntries.length) {
    return null;
  }
  const resolvedGermanUrl = germanUrl ?? buildKaikkiEntryUrl(KAIKKI_GERMAN_BASE, trimmed);
  const targets = resolveTargetPos(pos);
  const germanCandidates = germanEntries
    .filter((entry) => entry.lang === "German")
    .filter((entry) => !isInflectionEntry(entry));

  if (!germanCandidates.length) {
    return null;
  }

  let selectedEntry: KaikkiEntry | undefined;

  if (targets?.length) {
    let bestMatchIndex = Number.POSITIVE_INFINITY;

    for (const entry of germanCandidates) {
      const entryPoses = resolvePosAliases(entry.pos);
      if (!entryPoses.length) {
        continue;
      }
      for (let index = 0; index < targets.length; index += 1) {
        const target = targets[index];
        if (entryPoses.includes(target)) {
          if (!selectedEntry || index < bestMatchIndex) {
            selectedEntry = entry;
            bestMatchIndex = index;
          }
          break;
        }
      }
    }

    if (!selectedEntry) {
      return null;
    }
  } else {
    selectedEntry =
      germanCandidates.find((entry) => resolvePosAliases(entry.pos).includes("verb")) ??
      germanCandidates[0];
  }

  if (!selectedEntry) {
    return null;
  }

  const translations = collectTranslations(selectedEntry);
  const synonyms = collectSynonyms(selectedEntry);
  const englishHints = collectGlosses(selectedEntry);
  const examples = collectExamples(selectedEntry);
  const selectedEntryPoses = resolvePosAliases(selectedEntry.pos);
  const verbForms = selectedEntryPoses.includes("verb")
    ? extractVerbForms(selectedEntry)
    : undefined;
  const nounForms = selectedEntryPoses.some((value) => value === "noun" || value === "proper noun")
    ? extractNounForms(selectedEntry)
    : undefined;
  const adjectiveForms = selectedEntryPoses.some((value) => value === "adjective" || value === "adj")
    ? extractAdjectiveForms(selectedEntry)
    : undefined;
  const prepositionAttributes = selectedEntryPoses.some((value) => value === "preposition" || value === "prep")
    ? extractPrepositionAttributes(selectedEntry)
    : undefined;
  const posLabel = selectedEntry.pos?.trim();
  const { tags: posTags, notes: posNotes } = collectPosMetadata(selectedEntry);

  let pivotUsed = false;
  const collectedTranslations = new Map<string, WiktextractTranslation>();
  const addTranslation = (value: string | undefined, language?: string | null) => {
    const trimmed = value?.trim();
    if (!trimmed) return;
    const lang = language?.trim();
    const key = `${trimmed.toLowerCase()}::${(lang ?? "").toLowerCase()}`;
    if (!collectedTranslations.has(key)) {
      collectedTranslations.set(key, { value: trimmed, language: lang || undefined });
    }
  };

  for (const translation of translations) {
    addTranslation(translation.value, translation.language);
  }
  const hadDirectTranslations = collectedTranslations.size > 0;

  if (!collectedTranslations.size && englishHints.length) {
    for (const headword of englishHints) {
      if (!headword) continue;
      const { entries: englishEntries } = await fetchKaikkiEntries(
        KAIKKI_ENGLISH_BASE,
        headword,
      );

      let hasGermanTranslations = false;

      for (const entry of englishEntries) {
        if (entry.lang !== "English") continue;
        for (const sense of toArray<KaikkiSenseEntry>(entry.senses)) {
          for (const translation of toArray<KaikkiTranslationEntry>(sense.translations)) {
            const language = translation.lang ?? translation.lang_code;
            if (language && language.toLowerCase() === "german") {
              hasGermanTranslations = true;
              break;
            }
          }
          if (hasGermanTranslations) break;
        }
        if (hasGermanTranslations) break;
      }

      if (hasGermanTranslations) {
        addTranslation(headword, "en");
        pivotUsed = true;
        break;
      }
    }
  }

  if (!hadDirectTranslations && englishHints.length) {
    for (const hint of englishHints) {
      addTranslation(hint, "en");
    }
  }

  return {
    translations: Array.from(collectedTranslations.values()),
    synonyms,
    examples,
    englishHints,
    verbForms,
    nounForms,
    adjectiveForms,
    prepositionAttributes,
    posLabel,
    posTags,
    posNotes,
    sourceDe: resolvedGermanUrl,
    pivotUsed,
  };
}

export async function lookupOpenThesaurusSynonyms(lemma: string): Promise<SynonymLookup> {
  const params = new URLSearchParams({
    q: lemma,
    format: "application/json",
  });

  const response = await fetch(`${OPEN_THESAURUS_API}?${params.toString()}`, { headers: REQUEST_HEADERS });
  if (!response.ok) {
    throw new Error(`Request failed with status ${response.status}: ${await response.text()}`);
  }

  const data = (await response.json()) as {
    synsets?: Array<{
      terms?: Array<{ term: string }>;
    }>;
  };

  const collected = new Set<string>();

  for (const synset of toArray<{ terms?: Array<{ term: string }> }>(data.synsets)) {
    for (const term of toArray<{ term: string }>(synset.terms)) {
      const value = term.term?.trim();
      if (!value) continue;
      if (value.toLowerCase() === lemma.toLowerCase()) continue;
      collected.add(value);
    }
  }

  return {
    synonyms: Array.from(collected).slice(0, 10),
  };
}

export async function lookupTranslation(lemma: string): Promise<TranslationLookup | null> {
  const params = new URLSearchParams({
    q: lemma,
    langpair: "de|en",
  });

  const response = await fetch(`${MY_MEMORY_API}?${params.toString()}`, { headers: REQUEST_HEADERS });
  if (!response.ok) {
    throw new Error(`Request failed with status ${response.status}: ${await response.text()}`);
  }

  const data = (await response.json()) as MyMemoryResponse;
  const highQualityMatch = toArray<MyMemoryMatch>(data.matches)
    .filter((match) => typeof match.quality === "number" && (match.quality ?? 0) >= 80 && match.translation)
    .map((match) => ({
      translation: match.translation!.trim(),
      confidence: match.quality ?? match.match,
    }))
    .find((match) => Boolean(match.translation));

  if (highQualityMatch) {
    return {
      translation: highQualityMatch.translation,
      confidence: typeof highQualityMatch.confidence === "number" ? highQualityMatch.confidence : undefined,
      source: "mymemory.translated.net",
      language: "en",
    };
  }

  const fallback = data.responseData?.translatedText?.trim();
  if (fallback && fallback.toLowerCase() !== lemma.toLowerCase()) {
    return {
      translation: fallback,
      source: "mymemory.translated.net",
      confidence: typeof data.responseData?.match === "number" ? data.responseData.match * 100 : undefined,
      language: "en",
    };
  }

  return null;
}

export async function lookupExampleSentence(lemma: string): Promise<ExampleLookup | null> {
  const params = new URLSearchParams({
    query: lemma,
    from: "deu",
    to: "eng",
    sort: "relevance",
    limit: "1",
  });

  const response = await fetch(`${TATOEBA_API}?${params.toString()}`, { headers: REQUEST_HEADERS });
  if (!response.ok) {
    throw new Error(`Request failed with status ${response.status}: ${await response.text()}`);
  }

  const data = (await response.json()) as TatoebaResponse;
  const result = data.results?.[0];
  if (!result) {
    return null;
  }

  const german = typeof result.text === "string" ? result.text.trim() : undefined;
  if (!german) {
    return null;
  }

  let english: string | undefined;
  for (const translation of toArray<TatoebaTranslation>(result.translations)) {
    const candidate = translation.text?.trim();
    if (!candidate) continue;
    if (!translation.lang || translation.lang === "eng") {
      english = candidate;
      break;
    }
  }

  return {
    sentence: german,
    translations: english ? { en: english } : undefined,
    exampleDe: german,
    exampleEn: english,
    source: "tatoeba.org",
  };
}

export async function lookupAiAssistance(
  lemma: string,
  pos: string,
  apiKey: string | undefined,
  model: string,
): Promise<AiLookup | null> {
  if (!apiKey) {
    return null;
  }

  const body = {
    model,
    temperature: 0.2,
    messages: [
      {
        role: "system",
        content:
          "You are a linguistics assistant that responds with valid JSON only. Provide translations and simple bilingual example sentences for German vocabulary.",
      },
      {
        role: "user",
        content: [
          {
            type: "text",
            text: `Return a JSON object with keys translation, exampleDe, exampleEn for the German ${pos} "${lemma}". Use neutral tone and CEFR A2 difficulty. If unsure, omit the key.`,
          },
        ],
      },
    ],
    response_format: { type: "json_object" },
  };

  const response = await fetch(OPENAI_CHAT_COMPLETIONS, {
    method: "POST",
    headers: {
      ...REQUEST_HEADERS,
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    throw new Error(`OpenAI request failed with status ${response.status}: ${await response.text()}`);
  }

  const payload = (await response.json()) as {
    choices?: Array<{
      message?: {
        content?: string;
      };
    }>;
  };

  const content = payload.choices?.[0]?.message?.content;
  if (!content) {
    return null;
  }

  try {
    const parsed = JSON.parse(content) as {
      translation?: string;
      exampleDe?: string;
      exampleEn?: string;
    };
    const exampleDe = parsed.exampleDe?.trim() || undefined;
    const exampleEn = parsed.exampleEn?.trim() || undefined;
    return {
      translation: parsed.translation?.trim() || undefined,
      sentence: exampleDe,
      translations: exampleEn ? { en: exampleEn } : undefined,
      exampleDe,
      exampleEn,
      source: `openai:${model}`,
    };
  } catch (error) {
    throw new Error(`Failed to parse OpenAI response: ${error instanceof Error ? error.message : String(error)}`);
  }
}

export function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}
