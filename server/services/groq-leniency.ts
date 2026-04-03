import Groq from "groq-sdk";
import { logStructured } from "../logger.js";

const LENIENCY_MODEL = "llama-3.3-70b-versatile";
const LENIENCY_CACHE_TTL_MS = 60 * 60 * 1000;
const LENIENCY_CACHE_MAX_SIZE = 500;

const SYSTEM_PROMPT =
  "You are a strict but fair German language examiner. You evaluate whether a student's answer should be accepted as correct despite not exactly matching the expected form. Accept answers that have: minor typos (1 character off), missing/wrong umlauts (ae/oe/ue instead of ä/ö/ü), capitalization errors for nouns, or valid regional alternates. Reject answers with wrong verb stem, wrong tense, or fundamentally incorrect grammar. Respond ONLY with valid JSON: {\"isAcceptable\": bool, \"confidence\": \"high\"|\"medium\"|\"low\", \"reason\": \"string\", \"suggestion\": \"string or null\"}";

const groq = process.env.GROQ_API_KEY
  ? new Groq({ apiKey: process.env.GROQ_API_KEY })
  : null;

type Confidence = "high" | "medium" | "low";

interface LeniencyCacheEntry {
  value: LeniencyCheckResult;
  expiresAt: number;
}

const leniencyCache = new Map<string, LeniencyCacheEntry>();

export interface LeniencyCheckInput {
  lemma: string;
  taskType: string;
  expectedForm: string;
  submittedForm: string;
  cefrLevel?: string;
}

export interface LeniencyCheckResult {
  isAcceptable: boolean;
  confidence: Confidence;
  reason: string;
  suggestion?: string;
}

const TOO_DIFFERENT_RESULT: LeniencyCheckResult = {
  isAcceptable: false,
  confidence: "high",
  reason: "Too different",
};

const FAILED_RESULT: LeniencyCheckResult = {
  isAcceptable: false,
  confidence: "low",
  reason: "Check failed",
};

const CONFIDENCE_LEVELS: ReadonlySet<Confidence> = new Set<Confidence>([
  "high",
  "medium",
  "low",
]);

function normaliseText(value: string): string {
  return value.trim().toLocaleLowerCase();
}

function normaliseUmlauts(value: string): string {
  return value
    .replaceAll("ä", "ae")
    .replaceAll("ö", "oe")
    .replaceAll("ü", "ue")
    .replaceAll("ß", "ss");
}

export function levenshteinDistance(source: string, target: string): number {
  const a = normaliseText(source);
  const b = normaliseText(target);

  if (a === b) {
    return 0;
  }

  if (!a.length) {
    return b.length;
  }

  if (!b.length) {
    return a.length;
  }

  const previous = new Array<number>(b.length + 1);
  const current = new Array<number>(b.length + 1);

  for (let column = 0; column <= b.length; column += 1) {
    previous[column] = column;
  }

  for (let row = 1; row <= a.length; row += 1) {
    current[0] = row;
    const sourceChar = a[row - 1];

    for (let column = 1; column <= b.length; column += 1) {
      const targetChar = b[column - 1];
      const cost = sourceChar === targetChar ? 0 : 1;
      const insertCost = current[column - 1]! + 1;
      const deleteCost = previous[column]! + 1;
      const replaceCost = previous[column - 1]! + cost;

      current[column] = Math.min(insertCost, deleteCost, replaceCost);
    }

    for (let column = 0; column <= b.length; column += 1) {
      previous[column] = current[column]!;
    }
  }

  return previous[b.length]!;
}

export function isCloseEnough(expected: string, submitted: string): boolean {
  const expectedNormalised = normaliseText(expected);
  const submittedNormalised = normaliseText(submitted);

  if (!expectedNormalised || !submittedNormalised) {
    return false;
  }

  if (expectedNormalised === submittedNormalised) {
    return true;
  }

  if (
    normaliseUmlauts(expectedNormalised) ===
    normaliseUmlauts(submittedNormalised)
  ) {
    return true;
  }

  return levenshteinDistance(expectedNormalised, submittedNormalised) <= 2;
}

function shouldRunLeniencyCheck(expected: string, submitted: string): boolean {
  const expectedNormalised = normaliseText(expected);
  const submittedNormalised = normaliseText(submitted);

  if (!expectedNormalised || !submittedNormalised) {
    return false;
  }

  if (expectedNormalised === submittedNormalised) {
    return true;
  }

  if (
    normaliseUmlauts(expectedNormalised) ===
    normaliseUmlauts(submittedNormalised)
  ) {
    return true;
  }

  return levenshteinDistance(expectedNormalised, submittedNormalised) <= 3;
}

function getCachedResult(cacheKey: string): LeniencyCheckResult | null {
  const cached = leniencyCache.get(cacheKey);
  if (!cached) {
    return null;
  }

  if (cached.expiresAt <= Date.now()) {
    leniencyCache.delete(cacheKey);
    return null;
  }

  leniencyCache.delete(cacheKey);
  leniencyCache.set(cacheKey, cached);
  return cached.value;
}

function setCachedResult(cacheKey: string, value: LeniencyCheckResult): void {
  if (leniencyCache.has(cacheKey)) {
    leniencyCache.delete(cacheKey);
  } else if (leniencyCache.size >= LENIENCY_CACHE_MAX_SIZE) {
    const oldestKey = leniencyCache.keys().next().value as string | undefined;
    if (oldestKey) {
      leniencyCache.delete(oldestKey);
    }
  }

  leniencyCache.set(cacheKey, {
    value,
    expiresAt: Date.now() + LENIENCY_CACHE_TTL_MS,
  });
}

function parseLeniencyResult(content: string | null | undefined): LeniencyCheckResult {
  const rawText = typeof content === "string" ? content.trim() : "";
  if (!rawText) {
    throw new Error("Empty leniency response");
  }

  const sanitized = rawText
    .replace(/```json/gi, "")
    .replace(/```/g, "")
    .trim();
  const match = sanitized.match(/\{[\s\S]*\}/);
  const candidate = (match?.[0] ?? sanitized).trim();
  const parsed = JSON.parse(candidate) as {
    isAcceptable?: unknown;
    confidence?: unknown;
    reason?: unknown;
    suggestion?: unknown;
  };

  if (typeof parsed.isAcceptable !== "boolean") {
    throw new Error("Invalid leniency isAcceptable");
  }

  if (
    typeof parsed.confidence !== "string" ||
    !CONFIDENCE_LEVELS.has(parsed.confidence as Confidence)
  ) {
    throw new Error("Invalid leniency confidence");
  }

  if (typeof parsed.reason !== "string" || parsed.reason.trim().length === 0) {
    throw new Error("Invalid leniency reason");
  }

  const suggestion =
    typeof parsed.suggestion === "string" && parsed.suggestion.trim().length > 0
      ? parsed.suggestion.trim()
      : undefined;

  return {
    isAcceptable: parsed.isAcceptable,
    confidence: parsed.confidence as Confidence,
    reason: parsed.reason.trim(),
    suggestion,
  } satisfies LeniencyCheckResult;
}

export async function checkAnswerLeniency(
  input: LeniencyCheckInput,
): Promise<LeniencyCheckResult> {
  const startTime = Date.now();
  let cacheHit = false;
  const expectedForm = input.expectedForm.trim();
  const submittedForm = input.submittedForm.trim();

  try {
    if (!expectedForm || !submittedForm) {
      return TOO_DIFFERENT_RESULT;
    }

    if (!shouldRunLeniencyCheck(expectedForm, submittedForm)) {
      return TOO_DIFFERENT_RESULT;
    }

    const cacheKey = `${expectedForm}::${submittedForm}`;
    const cached = getCachedResult(cacheKey);
    if (cached) {
      cacheHit = true;
      return cached;
    }

    if (!process.env.GROQ_API_KEY || !groq) {
      return TOO_DIFFERENT_RESULT;
    }

    const userPrompt = [
      `Task: conjugate '${input.lemma}' (${input.taskType}, CEFR ${input.cefrLevel ?? "unknown"})`,
      `Expected: '${expectedForm}'`,
      `Student answered: '${submittedForm}'`,
      "Should this be accepted?",
    ].join("\n");

    const response = await groq.chat.completions.create({
      model: LENIENCY_MODEL,
      max_tokens: 120,
      temperature: 0,
      messages: [
        {
          role: "system",
          content: SYSTEM_PROMPT,
        },
        {
          role: "user",
          content: userPrompt,
        },
      ],
    });

    const parsed = parseLeniencyResult(response.choices[0]?.message?.content);
    setCachedResult(cacheKey, parsed);
    return parsed;
  } catch (error) {
    logStructured({
      event: "groq.leniency.error",
      level: "error",
      source: "submission",
      message: "Leniency check failed",
      error,
    });
    return FAILED_RESULT;
  } finally {
    logStructured({
      event: "groq.leniency",
      source: "submission",
      data: {
        durationMs: Date.now() - startTime,
        cacheHit,
      },
    });
  }
}
