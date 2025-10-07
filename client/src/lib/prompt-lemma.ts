const DASH_DELIMITERS = [" – ", " — ", " - "];

function cleanLemmaCandidate(raw: string | null | undefined): string | undefined {
  if (!raw) {
    return undefined;
  }

  const trimmed = raw.trim();
  if (!trimmed) {
    return undefined;
  }

  const withoutTrailingParentheses = trimmed.replace(/\s*\([^)]*\)\s*$/u, "").trim();
  if (!withoutTrailingParentheses) {
    return undefined;
  }

  const withoutQuotes = withoutTrailingParentheses
    .replace(/^['"`«»“”„‚‘’]+/gu, "")
    .replace(/['"`«»“”„‚‘’]+$/gu, "")
    .trim();
  if (!withoutQuotes) {
    return undefined;
  }

  const withoutTrailingPunctuation = withoutQuotes.replace(/[.,;:!?]+$/u, "").trim();
  if (!withoutTrailingPunctuation) {
    return undefined;
  }

  const withoutLeadingArticles = withoutTrailingPunctuation
    .replace(/^(?:der|die|das|den|dem|des|ein|eine|einen|einem|eines)\s+/iu, "")
    .trim();

  return withoutLeadingArticles || undefined;
}

const PREPOSITION_PATTERN = /\b(?:von|für|über|aus|mit|ohne|gegen|bei|durch|unter|um|nach|vor|hinter|neben|an|auf|zu|im|am|vom|zum|zur)\b\s+([\p{L}\p{M}\d\-\s]+)$/u;

function extractFromDelimiters(value: string): string | undefined {
  for (const delimiter of DASH_DELIMITERS) {
    const index = value.indexOf(delimiter);
    if (index > 0) {
      const candidate = cleanLemmaCandidate(value.slice(0, index));
      if (candidate) {
        return candidate;
      }
    }
  }
  return undefined;
}

function extractFromPrepositions(value: string): string | undefined {
  const match = value.match(PREPOSITION_PATTERN);
  if (!match) {
    return undefined;
  }

  return cleanLemmaCandidate(match[1]);
}

function extractFromColon(value: string): string | undefined {
  const colonIndex = value.indexOf(":");
  if (colonIndex === -1) {
    return undefined;
  }

  const candidate = cleanLemmaCandidate(value.slice(colonIndex + 1));
  return candidate;
}

function extractFromTokens(value: string): string | undefined {
  const tokens = value.split(/\s+/u);
  for (let i = tokens.length - 1; i >= 0; i -= 1) {
    const candidate = cleanLemmaCandidate(tokens[i]);
    if (candidate) {
      return candidate;
    }
  }
  return undefined;
}

export function derivePromptLemma(raw: string | null | undefined): string | undefined {
  if (!raw) {
    return undefined;
  }

  const value = raw.trim();
  if (!value) {
    return undefined;
  }

  return (
    extractFromDelimiters(value) ??
    extractFromColon(value) ??
    extractFromPrepositions(value) ??
    extractFromTokens(value)
  );
}

export function derivePromptLemmaFromEntry(
  entry: { promptSummary?: string | null; prompt?: string | null },
): string | undefined {
  return derivePromptLemma(entry.promptSummary) ?? derivePromptLemma(entry.prompt);
}

