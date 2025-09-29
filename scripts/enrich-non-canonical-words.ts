import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import fetch from "node-fetch";
import { db } from "@db";
import { words, type Word } from "@db/schema";
import { eq } from "drizzle-orm";

const OUTPUT_FILE = path.resolve(
  process.cwd(),
  "data",
  "generated",
  "non-canonical-enrichment.json",
);
const DEFAULT_LIMIT = 25;
const REQUEST_HEADERS = {
  "Accept": "application/json",
  "User-Agent": "GermanVerbMaster/1.0 (data enrichment script)",
};

const WIKTIONARY_API = "https://de.wiktionary.org/w/api.php";
const OPEN_THESAURUS_API = "https://www.openthesaurus.de/synonyme/search";
const MY_MEMORY_API = "https://api.mymemory.translated.net/get";

interface WiktionaryPage {
  title: string;
  extract?: string;
  langlinks?: Array<{ lang: string; title: string }>;
  missing?: boolean;
}

interface WiktionaryResponse {
  query?: {
    pages?: WiktionaryPage[];
  };
}

interface OpenThesaurusResponse {
  synsets?: Array<{
    terms?: Array<{
      term: string;
    }>;
  }>;
}

interface MyMemoryResponse {
  responseData?: {
    translatedText?: string;
  };
  matches?: Array<{
    translation?: string;
    quality?: number;
  }>;
}

interface WordEnrichment {
  id: number;
  lemma: string;
  pos: string;
  translation?: string;
  englishHints?: string[];
  synonyms: string[];
  wiktionarySummary?: string;
  sources: string[];
  errors?: string[];
}

async function fetchJson(url: string): Promise<unknown> {
  const response = await fetch(url, { headers: REQUEST_HEADERS });
  if (!response.ok) {
    throw new Error(`Request failed with status ${response.status}: ${await response.text()}`);
  }
  return response.json();
}

async function fetchWiktionarySummary(lemma: string): Promise<{ summary?: string; englishHints: string[] } | null> {
  const params = new URLSearchParams({
    action: "query",
    format: "json",
    formatversion: "2",
    titles: lemma,
    prop: "extracts|langlinks",
    explaintext: "1",
    origin: "*",
    lllang: "en",
  });

  const data = (await fetchJson(`${WIKTIONARY_API}?${params.toString()}`)) as WiktionaryResponse;
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

  const englishHints = page.langlinks
    ?.filter((link) => link.lang === "en" && link.title)
    .map((link) => link.title)
    ?? [];

  return { summary, englishHints };
}

async function fetchOpenThesaurusSynonyms(lemma: string): Promise<string[]> {
  const params = new URLSearchParams({
    q: lemma,
    format: "application/json",
  });

  const data = (await fetchJson(`${OPEN_THESAURUS_API}?${params.toString()}`)) as OpenThesaurusResponse;
  const collected = new Set<string>();

  for (const synset of data.synsets ?? []) {
    for (const term of synset.terms ?? []) {
      const normalised = term.term?.trim();
      if (!normalised) continue;
      if (normalised.toLowerCase() === lemma.toLowerCase()) continue;
      collected.add(normalised);
    }
  }

  return Array.from(collected).slice(0, 10);
}

async function fetchTranslation(lemma: string): Promise<string | undefined> {
  const params = new URLSearchParams({
    q: lemma,
    langpair: "de|en",
  });

  const data = (await fetchJson(`${MY_MEMORY_API}?${params.toString()}`)) as MyMemoryResponse;

  const highQualityMatch = data.matches
    ?.filter((match) => (match.quality ?? 0) >= 80 && match.translation)
    .map((match) => match.translation!.trim())
    .find(Boolean);

  if (highQualityMatch) {
    return highQualityMatch;
  }

  const fallback = data.responseData?.translatedText?.trim();
  return fallback && fallback.toLowerCase() !== lemma.toLowerCase() ? fallback : undefined;
}

async function enrichWord(word: Word): Promise<WordEnrichment> {
  const errors: string[] = [];
  const sources = new Set<string>();

  const [wiktionaryResult, synonymsResult, translationResult] = await Promise.allSettled([
    fetchWiktionarySummary(word.lemma),
    fetchOpenThesaurusSynonyms(word.lemma),
    fetchTranslation(word.lemma),
  ]);

  let wiktionarySummary: string | undefined;
  let englishHints: string[] | undefined;
  if (wiktionaryResult.status === "fulfilled") {
    const value = wiktionaryResult.value;
    if (value) {
      wiktionarySummary = value.summary;
      englishHints = value.englishHints.length ? value.englishHints : undefined;
      sources.add("de.wiktionary.org");
    }
  } else {
    errors.push(`Wiktionary error: ${wiktionaryResult.reason instanceof Error ? wiktionaryResult.reason.message : String(wiktionaryResult.reason)}`);
  }

  let synonyms: string[] = [];
  if (synonymsResult.status === "fulfilled") {
    synonyms = synonymsResult.value;
    if (synonyms.length) {
      sources.add("openthesaurus.de");
    }
  } else {
    errors.push(`OpenThesaurus error: ${synonymsResult.reason instanceof Error ? synonymsResult.reason.message : String(synonymsResult.reason)}`);
  }

  let translation: string | undefined;
  if (translationResult.status === "fulfilled") {
    translation = translationResult.value;
    if (translation) {
      sources.add("mymemory.translated.net");
    }
  } else {
    errors.push(`MyMemory error: ${translationResult.reason instanceof Error ? translationResult.reason.message : String(translationResult.reason)}`);
  }

  return {
    id: word.id,
    lemma: word.lemma,
    pos: word.pos,
    translation,
    englishHints,
    synonyms,
    wiktionarySummary,
    sources: Array.from(sources).sort(),
    errors: errors.length ? errors : undefined,
  };
}

function parseLimit(): number {
  const raw = process.env.LIMIT;
  if (!raw) return DEFAULT_LIMIT;
  const value = Number.parseInt(raw, 10);
  return Number.isFinite(value) && value > 0 ? value : DEFAULT_LIMIT;
}

async function main() {
  const limit = parseLimit();
  console.log(`Fetching up to ${limit} non-canonical words for enrichment...`);

  const targets = await db
    .select()
    .from(words)
    .where(eq(words.canonical, false))
    .limit(limit);

  if (!targets.length) {
    console.log("No non-canonical words found in the database.");
    return;
  }

  const enriched: WordEnrichment[] = [];
  for (const word of targets) {
    console.log(`Enriching ${word.lemma} (${word.pos})...`);
    const result = await enrichWord(word);
    enriched.push(result);
    await delay(400);
  }

  await mkdir(path.dirname(OUTPUT_FILE), { recursive: true });
  const payload = {
    generatedAt: new Date().toISOString(),
    limit,
    count: enriched.length,
    words: enriched,
  };

  await writeFile(OUTPUT_FILE, JSON.stringify(payload, null, 2), "utf8");
  console.log(`Wrote enrichment data for ${enriched.length} words to ${OUTPUT_FILE}`);

  const withErrors = enriched.filter((entry) => entry.errors?.length);
  if (withErrors.length) {
    console.warn("Some entries encountered errors:");
    for (const entry of withErrors) {
      console.warn(`- ${entry.lemma}: ${entry.errors?.join("; ")}`);
    }
  }
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

main().catch((error) => {
  console.error("Failed to complete enrichment:", error);
  process.exitCode = 1;
});
