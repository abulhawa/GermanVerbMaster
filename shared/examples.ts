import type { WordExample, WordExampleTranslations } from "./types.js";

function normalizeString(value: string | null | undefined): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

const GERMAN_CHAR_PATTERN = /[äöüßÄÖÜ]/u;

const GERMAN_STOP_WORDS = new Set(
  [
    "aber",
    "alle",
    "alles",
    "also",
    "am",
    "an",
    "auch",
    "auf",
    "aus",
    "bei",
    "bitte",
    "dabei",
    "dann",
    "darauf",
    "darum",
    "das",
    "dass",
    "dein",
    "deine",
    "dem",
    "den",
    "denn",
    "der",
    "des",
    "dich",
    "die",
    "dies",
    "dieser",
    "dir",
    "doch",
    "dort",
    "du",
    "durch",
    "ein",
    "eine",
    "einem",
    "einen",
    "einer",
    "einfach",
    "einmal",
    "er",
    "es",
    "etwas",
    "für",
    "gegen",
    "gern",
    "gestern",
    "gut",
    "gute",
    "guten",
    "habe",
    "haben",
    "hat",
    "heute",
    "hier",
    "ich",
    "ihm",
    "ihn",
    "ihr",
    "ihre",
    "im",
    "in",
    "ja",
    "jede",
    "jedem",
    "jeden",
    "kein",
    "keine",
    "keinem",
    "keinen",
    "keiner",
    "können",
    "könnte",
    "machen",
    "man",
    "mein",
    "meine",
    "mehr",
    "mir",
    "mit",
    "muss",
    "müssen",
    "nach",
    "nicht",
    "noch",
    "nun",
    "nur",
    "oder",
    "ohne",
    "schon",
    "sein",
    "seine",
    "seit",
    "sie",
    "sind",
    "so",
    "soll",
    "sollte",
    "um",
    "und",
    "uns",
    "unser",
    "viel",
    "vom",
    "von",
    "vor",
    "war",
    "waren",
    "was",
    "weg",
    "weil",
    "wenn",
    "wer",
    "wie",
    "wieder",
    "wir",
    "wird",
    "wirst",
    "wo",
    "wollen",
    "würde",
    "zuerst",
    "zum",
    "zur",
    "zusammen",
  ].map((entry) => entry.toLowerCase()),
);

const ENGLISH_STOP_WORDS = new Set(
  [
    "a",
    "about",
    "again",
    "all",
    "also",
    "and",
    "any",
    "are",
    "an",
    "as",
    "at",
    "be",
    "because",
    "been",
    "before",
    "but",
    "by",
    "can",
    "could",
    "do",
    "does",
    "done",
    "each",
    "for",
    "from",
    "had",
    "has",
    "have",
    "he",
    "her",
    "here",
    "hers",
    "him",
    "his",
    "how",
    "i",
    "if",
    "in",
    "into",
    "is",
    "it",
    "its",
    "just",
    "may",
    "me",
    "might",
    "more",
    "most",
    "my",
    "no",
    "not",
    "now",
    "of",
    "off",
    "on",
    "one",
    "only",
    "or",
    "other",
    "our",
    "out",
    "over",
    "said",
    "she",
    "should",
    "so",
    "some",
    "than",
    "that",
    "the",
    "their",
    "them",
    "then",
    "there",
    "these",
    "they",
    "this",
    "those",
    "through",
    "to",
    "too",
    "under",
    "up",
    "very",
    "was",
    "we",
    "were",
    "what",
    "when",
    "where",
    "which",
    "who",
    "why",
    "will",
    "with",
    "would",
    "you",
    "your",
    "yours",
  ].map((entry) => entry.toLowerCase()),
);

function tokenizeForDetection(value: string): string[] {
  return value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-zA-ZäöüÄÖÜß\s']/g, " ")
    .split(/\s+/u)
    .filter((token) => token.length > 0);
}

function countStopWordMatches(tokens: string[], dictionary: ReadonlySet<string>): number {
  let matches = 0;
  for (const token of tokens) {
    if (dictionary.has(token)) {
      matches += 1;
    }
  }
  return matches;
}

export type DetectedExampleLanguage = "de" | "en" | "unknown";

export function detectExampleLanguage(value: string | null | undefined): DetectedExampleLanguage {
  const normalized = normalizeString(value ?? undefined);
  if (!normalized) {
    return "unknown";
  }

  const tokens = tokenizeForDetection(normalized);
  if (tokens.length === 0) {
    return "unknown";
  }

  const germanMatches = countStopWordMatches(tokens, GERMAN_STOP_WORDS);
  const englishMatches = countStopWordMatches(tokens, ENGLISH_STOP_WORDS);

  let germanScore = germanMatches;
  const englishScore = englishMatches;

  if (GERMAN_CHAR_PATTERN.test(normalized)) {
    germanScore += 2;
  }

  const germanRatio = germanMatches / tokens.length;
  const englishRatio = englishMatches / tokens.length;

  if (germanScore >= 2 && germanRatio >= 0.2 && germanScore >= englishScore + 1) {
    return "de";
  }

  if (englishScore >= 2 && englishRatio >= 0.2 && englishScore > germanScore) {
    return "en";
  }

  if (germanScore >= 1 && englishScore === 0 && (germanRatio >= 0.3 || tokens.length <= 3)) {
    return "de";
  }

  if (englishScore >= 1 && germanScore === 0 && (englishRatio >= 0.3 || tokens.length <= 3)) {
    return "en";
  }

  return "unknown";
}

export function isLikelyGermanExample(value: string | null | undefined): boolean {
  return detectExampleLanguage(value) === "de";
}

export function isLikelyEnglishExample(value: string | null | undefined): boolean {
  return detectExampleLanguage(value) === "en";
}

function normalizeTranslations(
  translations: WordExampleTranslations | Record<string, string | null | undefined> | null | undefined,
):
  | WordExampleTranslations
  | null {
  if (!translations || typeof translations !== "object") {
    return null;
  }
  const normalizedEntries = Object.entries(translations)
    .map(([language, text]) => {
      const normalizedLanguage = normalizeString(language)?.toLowerCase();
      const normalizedText = normalizeString(text ?? undefined);
      if (!normalizedLanguage || !normalizedText) {
        return undefined;
      }
      if (normalizedLanguage === "en" && isLikelyGermanExample(normalizedText)) {
        return undefined;
      }
      return [normalizedLanguage, normalizedText] as const;
    })
    .filter((entry): entry is readonly [string, string] => Boolean(entry));

  if (normalizedEntries.length === 0) {
    return null;
  }

  return Object.fromEntries(normalizedEntries);
}

export function normalizeWordExample(entry: WordExample | null | undefined): WordExample | null {
  if (!entry || typeof entry !== "object") {
    return null;
  }

  const sentence = normalizeString(entry.sentence ?? entry.exampleDe ?? undefined);
  const fallbackEnglish = normalizeString(entry.exampleEn ?? undefined);
  const translations = normalizeTranslations(
    entry.translations ??
      (fallbackEnglish && !isLikelyGermanExample(fallbackEnglish) ? { en: fallbackEnglish } : null),
  );

  if (!sentence && !translations) {
    return null;
  }

  return {
    sentence,
    translations,
  };
}

export function normalizeWordExamples(
  examples: Array<WordExample | null | undefined> | null | undefined,
): WordExample[] | null {
  if (!examples || !Array.isArray(examples)) {
    return null;
  }
  const normalized: WordExample[] = [];

  for (const rawEntry of examples) {
    if (!rawEntry || typeof rawEntry !== "object") {
      continue;
    }

    const cloned: WordExample = {
      ...rawEntry,
      translations: rawEntry.translations
        ? { ...rawEntry.translations }
        : rawEntry.translations ?? null,
    };

    const reclassifiedSentences = new Set<string>();

    const candidateEnglish = normalizeString(cloned.exampleEn ?? undefined);
    if (candidateEnglish && isLikelyGermanExample(candidateEnglish)) {
      cloned.exampleEn = null;
      reclassifiedSentences.add(candidateEnglish);
    }

    if (cloned.translations && typeof cloned.translations === "object") {
      for (const [language, value] of Object.entries(cloned.translations)) {
        const normalizedLanguage = normalizeString(language)?.toLowerCase();
        const normalizedValue = normalizeString(typeof value === "string" ? value : undefined);
        if (
          normalizedLanguage === "en" &&
          normalizedValue &&
          isLikelyGermanExample(normalizedValue)
        ) {
          delete (cloned.translations as Record<string, string | null | undefined>)[language];
          reclassifiedSentences.add(normalizedValue);
        }
      }

      if (cloned.translations && Object.keys(cloned.translations).length === 0) {
        cloned.translations = null;
      }
    }

    const normalizedEntry = normalizeWordExample(cloned);
    if (normalizedEntry) {
      normalized.push(normalizedEntry);
    }

    for (const sentence of reclassifiedSentences) {
      if (!sentence) {
        continue;
      }
      const duplicate = normalized.some((entry) => {
        const normalizedSentence = entry.sentence ?? null;
        return normalizedSentence
          ? normalizedSentence.trim().toLowerCase() === sentence.trim().toLowerCase()
          : false;
      });
      if (!duplicate) {
        normalized.push({
          sentence,
          translations: null,
        });
      }
    }
  }

  return normalized.length > 0 ? normalized : null;
}

function sortTranslations(translations: WordExampleTranslations | null | undefined): WordExampleTranslations | null {
  if (!translations) {
    return null;
  }
  const entries = Object.entries(translations)
    .filter((entry): entry is [string, string] => typeof entry[1] === "string" && entry[1].length > 0)
    .sort((a, b) => a[0].localeCompare(b[0]));
  return entries.length > 0 ? Object.fromEntries(entries) : null;
}

export function canonicalizeExamples(
  examples: Array<WordExample | null | undefined> | null | undefined,
): WordExample[] {
  const normalized = normalizeWordExamples(examples) ?? [];
  return normalized.map((entry) => {
    const translations = sortTranslations(entry.translations);
    return {
      sentence: entry.sentence ?? null,
      translations,
    };
  });
}

export function examplesEqual(
  a: Array<WordExample | null | undefined> | null | undefined,
  b: Array<WordExample | null | undefined> | null | undefined,
): boolean {
  const canonicalA = canonicalizeExamples(a);
  const canonicalB = canonicalizeExamples(b);
  if (canonicalA.length !== canonicalB.length) {
    return false;
  }
  for (let index = 0; index < canonicalA.length; index += 1) {
    const lhs = canonicalA[index];
    const rhs = canonicalB[index];
    if (lhs.sentence !== rhs.sentence) {
      return false;
    }
    const lhsTranslations = sortTranslations(lhs.translations);
    const rhsTranslations = sortTranslations(rhs.translations);
    const lhsKeys = Object.keys(lhsTranslations ?? {});
    const rhsKeys = Object.keys(rhsTranslations ?? {});
    if (lhsKeys.length !== rhsKeys.length) {
      return false;
    }
    for (const key of lhsKeys) {
      if ((lhsTranslations ?? {})[key] !== (rhsTranslations ?? {})[key]) {
        return false;
      }
    }
  }
  return true;
}

export function getExampleSentence(
  examples: Array<WordExample | null | undefined> | null | undefined,
): string | null {
  if (!examples) {
    return null;
  }
  for (const entry of examples) {
    const normalized = normalizeWordExample(entry);
    if (normalized?.sentence) {
      return normalized.sentence;
    }
  }
  return null;
}

export function getExampleTranslation(
  examples: Array<WordExample | null | undefined> | null | undefined,
  language: string,
): string | null {
  if (!examples) {
    return null;
  }
  const normalizedLanguage = normalizeString(language)?.toLowerCase();
  if (!normalizedLanguage) {
    return null;
  }
  for (const entry of examples) {
    const normalized = normalizeWordExample(entry);
    if (!normalized?.translations) {
      continue;
    }
    const match = normalized.translations[normalizedLanguage];
    if (match) {
      return match;
    }
  }
  return null;
}

export function getExampleTranslations(
  example: WordExample | null | undefined,
): WordExampleTranslations | null {
  const normalized = normalizeWordExample(example);
  return normalized?.translations ?? null;
}

export function getExampleTranslationFromEntry(
  example: WordExample | null | undefined,
  language: string,
): string | null {
  if (!language) {
    return null;
  }
  const translations = getExampleTranslations(example);
  if (!translations) {
    return null;
  }
  const normalizedLanguage = language.trim().toLowerCase();
  return normalizedLanguage ? translations[normalizedLanguage] ?? null : null;
}

export function upsertExampleTranslation(
  examples: WordExample[] | null | undefined,
  sentence: string | null | undefined,
  language: string,
  value: string | null | undefined,
): WordExample[] | null {
  const normalizedSentence = normalizeString(sentence);
  const normalizedLanguage = normalizeString(language)?.toLowerCase();
  const normalizedValue = normalizeString(value);

  if (!normalizedSentence && !normalizedValue) {
    return normalizeWordExamples(examples);
  }

  const normalizedExamples = normalizeWordExamples(examples) ?? [];
  const existing = normalizedExamples.find((entry) => entry.sentence === normalizedSentence);

  if (!normalizedValue) {
    if (!normalizedLanguage || !existing || !existing.translations) {
      return normalizedExamples.length > 0 ? normalizedExamples : null;
    }
    const { [normalizedLanguage]: _removed, ...rest } = existing.translations;
    existing.translations = normalizeTranslations(rest);
    if (!existing.translations && !existing.sentence) {
      return normalizeWordExamples(normalizedExamples.filter((entry) => entry !== existing));
    }
    return normalizeWordExamples(normalizedExamples);
  }

  if (!normalizedLanguage) {
    return normalizeWordExamples(normalizedExamples);
  }

  if (!existing) {
    const newEntry: WordExample = {
      sentence: normalizedSentence,
      translations: normalizedLanguage && normalizedValue ? { [normalizedLanguage]: normalizedValue } : null,
    };
    return normalizeWordExamples([...normalizedExamples, newEntry]);
  }

  existing.translations = {
    ...(existing.translations ?? {}),
    ...(normalizedLanguage && normalizedValue ? { [normalizedLanguage]: normalizedValue } : {}),
  };
  return normalizeWordExamples(normalizedExamples);
}
