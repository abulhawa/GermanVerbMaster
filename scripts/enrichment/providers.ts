import fetch from "node-fetch";

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
}

export interface ExampleLookup {
  exampleDe?: string;
  exampleEn?: string;
  source: string;
}

export interface AiLookup {
  translation?: string;
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

interface KaikkiSenseEntry {
  examples?: KaikkiExampleEntry[];
  translations?: KaikkiTranslationEntry[];
  glosses?: string[];
  raw_glosses?: string[];
  synonyms?: KaikkiSynonymEntry[];
}

interface KaikkiHeadTemplate {
  expansion?: string;
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
}

interface WiktextractVerbForms {
  praeteritum?: string;
  partizipIi?: string;
  perfekt?: string;
  perfektOptions: string[];
  auxiliaries: string[];
}

export interface WiktextractLookup {
  translations: string[];
  synonyms: string[];
  example?: {
    exampleDe?: string;
    exampleEn?: string;
  };
  englishHints: string[];
  verbForms?: WiktextractVerbForms;
  sourceDe: string;
  pivotUsed: boolean;
}

function toArray<T>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}

function buildKaikkiEntryUrl(base: string, lemma: string): string {
  const normalised = lemma.trim().toLowerCase();
  const first = normalised[0] ?? "_";
  const firstTwo = normalised.slice(0, 2) || first;
  const encoded = encodeURIComponent(normalised);
  return `${base}/${first}/${firstTwo}/${encoded}.jsonl`;
}

async function fetchJsonLines<T>(url: string): Promise<T[]> {
  const response = await fetch(url, { headers: REQUEST_HEADERS });
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

function pickExampleFromEntry(entry: KaikkiEntry): {
  exampleDe?: string;
  exampleEn?: string;
} | undefined {
  for (const sense of toArray<KaikkiSenseEntry>(entry.senses)) {
    for (const example of toArray<KaikkiExampleEntry>(sense.examples)) {
      const exampleDe = example.text?.trim();
      const exampleEn = example.translation?.trim() || example.english?.trim();
      if (!exampleDe && !exampleEn) {
        continue;
      }
      return {
        exampleDe: exampleDe || undefined,
        exampleEn: exampleEn || undefined,
      };
    }
  }
  return undefined;
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

function collectTranslations(entry: KaikkiEntry): string[] {
  const translations = new Set<string>();
  for (const sense of toArray<KaikkiSenseEntry>(entry.senses)) {
    for (const translation of toArray<KaikkiTranslationEntry>(sense.translations)) {
      const word = translation.word?.trim();
      if (word) {
        translations.add(word);
      }
    }
  }
  return Array.from(translations);
}

export async function lookupWiktextract(lemma: string): Promise<WiktextractLookup | null> {
  const trimmed = lemma.trim();
  if (!trimmed) {
    return null;
  }

  const germanUrl = buildKaikkiEntryUrl(KAIKKI_GERMAN_BASE, trimmed);
  const germanEntries = await fetchJsonLines<KaikkiEntry>(germanUrl);
  const verbEntry = germanEntries.find((entry) => entry.lang === "German" && entry.pos === "verb");

  if (!verbEntry) {
    return null;
  }

  const translations = collectTranslations(verbEntry);
  const synonyms = collectSynonyms(verbEntry);
  const englishHints = collectGlosses(verbEntry);
  const example = pickExampleFromEntry(verbEntry);
  const verbForms = extractVerbForms(verbEntry);

  let pivotUsed = false;
  const collectedTranslations = new Set(translations);

  if (!collectedTranslations.size && englishHints.length) {
    for (const hint of englishHints) {
      collectedTranslations.add(hint);
    }
  }

  if (!collectedTranslations.size && englishHints.length) {
    const headword = englishHints[0];
    const englishUrl = buildKaikkiEntryUrl(KAIKKI_ENGLISH_BASE, headword);
    const englishEntries = await fetchJsonLines<KaikkiEntry>(englishUrl);
    if (englishEntries.length) {
      pivotUsed = true;
      for (const entry of englishEntries) {
        if (entry.lang !== "English") continue;
        for (const sense of toArray<KaikkiSenseEntry>(entry.senses)) {
          for (const translation of toArray<KaikkiTranslationEntry>(sense.translations)) {
            const word = translation.word?.trim();
            if (word) {
              collectedTranslations.add(word);
            }
          }
        }
      }
    }
  }

  return {
    translations: Array.from(collectedTranslations),
    synonyms,
    example,
    englishHints,
    verbForms,
    sourceDe: germanUrl,
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
    };
  }

  const fallback = data.responseData?.translatedText?.trim();
  if (fallback && fallback.toLowerCase() !== lemma.toLowerCase()) {
    return {
      translation: fallback,
      source: "mymemory.translated.net",
      confidence: typeof data.responseData?.match === "number" ? data.responseData.match * 100 : undefined,
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
    return {
      translation: parsed.translation?.trim() || undefined,
      exampleDe: parsed.exampleDe?.trim() || undefined,
      exampleEn: parsed.exampleEn?.trim() || undefined,
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
