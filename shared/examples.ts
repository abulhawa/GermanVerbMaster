import type { WordExample, WordExampleTranslations } from "./types.js";

function normalizeString(value: string | null | undefined): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
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
  const translations = normalizeTranslations(
    entry.translations ?? (entry.exampleEn ? { en: entry.exampleEn } : null),
  );

  if (!sentence && !translations) {
    return null;
  }

  return {
    sentence,
    translations,
    exampleDe: sentence ?? null,
    exampleEn: translations?.en ?? null,
  };
}

export function normalizeWordExamples(
  examples: Array<WordExample | null | undefined> | null | undefined,
): WordExample[] | null {
  if (!examples || !Array.isArray(examples)) {
    return null;
  }
  const normalized = examples
    .map((entry) => normalizeWordExample(entry))
    .filter((entry): entry is WordExample => entry !== null);
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
      exampleDe: entry.sentence ?? null,
      exampleEn: translations?.en ?? null,
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
