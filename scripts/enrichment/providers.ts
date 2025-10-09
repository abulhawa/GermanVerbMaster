import fetch from "node-fetch";

const REQUEST_HEADERS = {
  Accept: "application/json",
  "User-Agent": "GermanVerbMaster/1.0 (data enrichment pipeline)",
};

const WIKTIONARY_API = "https://de.wiktionary.org/w/api.php";
const OPEN_THESAURUS_API = "https://www.openthesaurus.de/synonyme/search";
const MY_MEMORY_API = "https://api.mymemory.translated.net/get";
const TATOEBA_API = "https://tatoeba.org/en/api_v0/search";
const OPENAI_CHAT_COMPLETIONS = "https://api.openai.com/v1/chat/completions";

export interface WiktionaryVerbForms {
  praeteritum?: string;
  partizipIi?: string;
  perfekt?: string;
  aux?: "haben" | "sein";
}

export interface WiktionaryLookup {
  summary?: string;
  englishHints: string[];
  forms?: WiktionaryVerbForms;
}

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

interface WiktionaryResponse {
  query?: {
    pages?: Array<{
      title: string;
      extract?: string;
      langlinks?: Array<{ lang: string; title: string }>;
      missing?: boolean;
      revisions?: Array<{
        slots?: {
          main?: {
            content?: string;
          };
        };
      }>;
    }>;
  };
}

interface OpenThesaurusResponse {
  synsets?: Array<{
    terms?: Array<{
      term: string;
    }>;
  }>;
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

function toArray<T>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}

function normaliseKey(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
}

function splitTemplateArguments(template: string): string[] {
  const content = template.slice(2, -2); // remove leading {{ and trailing }}
  const parts: string[] = [];
  let depth = 0;
  let buffer = "";

  for (let i = 0; i < content.length; i += 1) {
    const char = content[i];
    const next = content[i + 1];

    if (char === "{" && next === "{") {
      depth += 1;
      buffer += "{{";
      i += 1;
      continue;
    }
    if (char === "}" && next === "}") {
      depth = Math.max(depth - 1, 0);
      buffer += "}}";
      i += 1;
      continue;
    }
    if (char === "|" && depth === 0) {
      parts.push(buffer);
      buffer = "";
      continue;
    }
    buffer += char;
  }

  if (buffer.length) {
    parts.push(buffer);
  }

  return parts.map((part) => part.trim()).filter(Boolean);
}

function extractTemplate(content: string, templateName: string): string | null {
  const needle = `{{${templateName}`;
  const start = content.indexOf(needle);
  if (start === -1) {
    return null;
  }

  let depth = 0;
  for (let i = start; i < content.length - 1; i += 1) {
    if (content[i] === "{" && content[i + 1] === "{") {
      depth += 1;
      i += 1;
      continue;
    }
    if (content[i] === "}" && content[i + 1] === "}") {
      depth -= 1;
      i += 1;
      if (depth === 0) {
        return content.slice(start, i + 1);
      }
    }
  }

  return null;
}

function stripWikiMarkup(value: string): string {
  let result = value
    .replace(/'''/g, "")
    .replace(/''/g, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/\{\{(?:[lL]|link-de)\|[^|}]+\|([^}|]+)(?:\|[^}]*)*}}/gi, "$1")
    .replace(/\{\{lang\|[^|}]+\|([^}]+)}}/g, "$1")
    .replace(/\{\{[^}]+}}/g, " ")
    .replace(/\[\[([^|\]]*\|)?([^\]]+)]]/g, "$2");

  result = result.replace(/\s+/g, " ").trim();
  return result;
}

function normaliseAuxiliary(value: string | undefined): "haben" | "sein" | undefined {
  if (!value) return undefined;
  const normalised = value.trim().toLowerCase();
  if (normalised.includes("sein")) {
    return "sein";
  }
  if (normalised.includes("haben")) {
    return "haben";
  }
  return undefined;
}

function selectPrimary(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const parts = value
    .split(/[;,/]| oder | bzw\.| bzw /gi)
    .map((part) => stripWikiMarkup(part))
    .map((part) => part.trim())
    .filter(Boolean);
  return (parts[0] ?? stripWikiMarkup(value)).trim() || undefined;
}

function matchFromMarkup(content: string, pattern: RegExp): string | undefined {
  const match = pattern.exec(content);
  if (!match) return undefined;
  return stripWikiMarkup(match[1] ?? "");
}

export function extractVerbForms(content: string): WiktionaryVerbForms | undefined {
  const templateNames = ["Deutsch Verb Übersicht", "Deutsch Verb Flexion"];
  const forms: WiktionaryVerbForms = {};
  const collectedKeys = new Map<string, string>();
  const positional: string[] = [];

  for (const name of templateNames) {
    const template = extractTemplate(content, name);
    if (!template) {
      continue;
    }

    const parts = splitTemplateArguments(template);
    for (const part of parts.slice(1)) {
      const equalsIndex = part.indexOf("=");
      if (equalsIndex === -1) {
        positional.push(stripWikiMarkup(part));
        continue;
      }
      const key = normaliseKey(part.slice(0, equalsIndex));
      const value = stripWikiMarkup(part.slice(equalsIndex + 1));
      if (!key || !value) {
        continue;
      }
      collectedKeys.set(key, value.trim());
    }
  }

  const first = <T>(...selectors: Array<string | RegExp>): T | undefined => {
    for (const selector of selectors) {
      if (typeof selector === "string") {
        const value = collectedKeys.get(selector);
        if (value) {
          return value as unknown as T;
        }
      } else {
        for (const [key, value] of collectedKeys.entries()) {
          if (selector.test(key) && value) {
            return value as unknown as T;
          }
        }
      }
    }
    return undefined;
  };

  forms.praeteritum = selectPrimary(
    first<string>(
      "prateritumich",
      "praeteritumich",
      "prateritum",
      "praeteritum",
      /^(praeteritum|prateritum)/,
    ) ?? positional[2],
  );
  forms.partizipIi = selectPrimary(
    first<string>("partizipii", "partizip2", "partizipii1", /^(partizip|partizipii|partizip2)/) ?? positional[3],
  );
  const auxValue = first<string>(
    "hilfsverb",
    "auxiliar",
    "auxiliary",
    "perfektauxiliar",
    /^hilfsverb/,
    /^aux/,
  );
  forms.aux = normaliseAuxiliary(auxValue);

  const perfektCandidate = first<string>("perfektich", "perfektwir", "perfekt", "perfekt1", /^perfekt/)
    ?? positional[4];
  forms.perfekt = selectPrimary(perfektCandidate);

  if (!forms.praeteritum) {
    forms.praeteritum = selectPrimary(matchFromMarkup(content, /'''Pr[aä]teritum:?'''([^\n]+)/i));
  }
  if (!forms.partizipIi) {
    forms.partizipIi = selectPrimary(matchFromMarkup(content, /'''Partizip(?:\s+II)?[:]?'''([^\n]+)/i));
  }
  if (!forms.aux) {
    forms.aux = normaliseAuxiliary(matchFromMarkup(content, /'''Hilfsverb:?'''([^\n]+)/i));
  }

  if (!forms.perfekt) {
    const perfektFromText = matchFromMarkup(content, /'''Perfekt:?'''([^\n]+)/i);
    forms.perfekt = selectPrimary(perfektFromText);
  }

  if (!forms.perfekt && forms.partizipIi && forms.aux) {
    const auxiliary = forms.aux === "sein" ? "ist" : "hat";
    forms.perfekt = `${auxiliary} ${forms.partizipIi}`;
  }

  if (forms.partizipIi) {
    forms.partizipIi = selectPrimary(forms.partizipIi);
  }
  if (forms.praeteritum) {
    forms.praeteritum = selectPrimary(forms.praeteritum);
  }
  if (forms.perfekt) {
    forms.perfekt = selectPrimary(forms.perfekt);
  }

  if (!forms.praeteritum && !forms.partizipIi && !forms.perfekt && !forms.aux) {
    return undefined;
  }

  if (forms.aux && !["haben", "sein"].includes(forms.aux)) {
    delete forms.aux;
  }

  return forms;
}

async function fetchJson<T>(url: string, headers: Record<string, string> = REQUEST_HEADERS): Promise<T> {
  const response = await fetch(url, { headers });
  if (!response.ok) {
    throw new Error(`Request failed with status ${response.status}: ${await response.text()}`);
  }
  return (await response.json()) as T;
}

export async function lookupWiktionarySummary(lemma: string): Promise<WiktionaryLookup | null> {
  const params = new URLSearchParams({
    action: "query",
    format: "json",
    formatversion: "2",
    titles: lemma,
    prop: "extracts|langlinks|revisions",
    explaintext: "1",
    origin: "*",
    lllang: "en",
    rvslots: "main",
    rvprop: "content",
  });

  const data = await fetchJson<WiktionaryResponse>(`${WIKTIONARY_API}?${params.toString()}`);
  const page = data.query?.pages?.[0];
  if (!page || page.missing) {
    return null;
  }

  const summary = page.extract
    ?.split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, 4)
    .join("\n");

  const englishHints = toArray<{ lang: string; title: string }>(page.langlinks)
    .filter((link) => link.lang === "en" && link.title)
    .map((link) => link.title.trim());

  const rawContent = page.revisions?.[0]?.slots?.main?.content ?? "";
  const forms = rawContent ? extractVerbForms(rawContent) : undefined;

  return {
    summary: summary || undefined,
    englishHints,
    forms,
  };
}

export async function lookupOpenThesaurusSynonyms(lemma: string): Promise<SynonymLookup> {
  const params = new URLSearchParams({
    q: lemma,
    format: "application/json",
  });

  const data = await fetchJson<OpenThesaurusResponse>(`${OPEN_THESAURUS_API}?${params.toString()}`);
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

  const data = await fetchJson<MyMemoryResponse>(`${MY_MEMORY_API}?${params.toString()}`);
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

  const data = await fetchJson<TatoebaResponse>(`${TATOEBA_API}?${params.toString()}`);
  const result = data.results?.[0];
  if (!result) {
    return null;
  }

  const german = typeof result.text === "string" ? result.text.trim() : undefined;
  if (!german) {
    return null;
  }

  const englishEntry = toArray<TatoebaTranslation>(result.translations).find(
    (translation) => translation.lang === "eng" && typeof translation.text === "string" && translation.text.trim(),
  );
  if (englishEntry?.text) {
    return {
      exampleDe: german,
      exampleEn: englishEntry.text.trim(),
      source: "tatoeba.org",
    };
  }

  return null;
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
