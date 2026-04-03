import Groq from "groq-sdk";
import { logStructured } from "../logger.js";

const B2_MODEL = "llama-3.3-70b-versatile";
const MIN_RESPONSE_LENGTH = 20;

const groq = process.env.GROQ_API_KEY
  ? new Groq({ apiKey: process.env.GROQ_API_KEY })
  : null;

export interface B2FeedbackInput {
  scenario: string;
  userResponse: string;
  keyPhrases: string[];
  grammarFocus: string;
}

export interface B2FeedbackResult {
  score: number;
  result: "correct" | "incorrect";
  strengths: string[];
  improvements: string[];
  correctedSentence?: string;
  keyPhrasesFound: string[];
}

function fallbackResult(): B2FeedbackResult {
  return {
    score: 0,
    result: "incorrect",
    strengths: [],
    improvements: ["Unable to analyze response"],
    keyPhrasesFound: [],
  } satisfies B2FeedbackResult;
}

function tooShortResult(): B2FeedbackResult {
  return {
    score: 0,
    result: "incorrect",
    strengths: [],
    improvements: ["Response is too short"],
    keyPhrasesFound: [],
  } satisfies B2FeedbackResult;
}

function normalisePhrases(values: unknown, maxItems: number): string[] {
  if (!Array.isArray(values)) {
    return [];
  }

  const unique = new Set<string>();
  for (const value of values) {
    if (typeof value !== "string") {
      continue;
    }
    const trimmed = value.trim();
    if (!trimmed) {
      continue;
    }
    unique.add(trimmed);
    if (unique.size >= maxItems) {
      break;
    }
  }
  return Array.from(unique);
}

function inferFoundPhrases(
  userResponse: string,
  keyPhrases: string[],
  suggested: string[],
): string[] {
  const responseLower = userResponse.toLocaleLowerCase();
  const source = suggested.length > 0 ? suggested : keyPhrases;
  const normalizedExpected = keyPhrases.map((phrase) => phrase.trim()).filter(Boolean);
  const found = new Set<string>();

  for (const phrase of source) {
    const trimmed = phrase.trim();
    if (!trimmed) {
      continue;
    }
    const match = normalizedExpected.find(
      (candidate) => candidate.toLocaleLowerCase() === trimmed.toLocaleLowerCase(),
    );
    const target = match ?? trimmed;
    if (!responseLower.includes(target.toLocaleLowerCase())) {
      continue;
    }
    found.add(target);
  }

  return Array.from(found);
}

function parseFeedbackContent(
  content: string | null | undefined,
  input: B2FeedbackInput,
): B2FeedbackResult {
  const rawText = typeof content === "string" ? content.trim() : "";
  if (!rawText) {
    throw new Error("Empty B2 feedback response");
  }

  const sanitized = rawText
    .replace(/```json/gi, "")
    .replace(/```/g, "")
    .trim();
  const match = sanitized.match(/\{[\s\S]*\}/);
  const candidate = (match?.[0] ?? sanitized).trim();
  const parsed = JSON.parse(candidate) as {
    score?: unknown;
    strengths?: unknown;
    improvements?: unknown;
    correctedSentence?: unknown;
    keyPhrasesFound?: unknown;
  };

  const numericScore =
    typeof parsed.score === "number" && Number.isFinite(parsed.score)
      ? Math.max(0, Math.min(100, Math.round(parsed.score)))
      : 0;

  const strengths = normalisePhrases(parsed.strengths, 2);
  const improvements = normalisePhrases(parsed.improvements, 2);
  const suggestedFound = normalisePhrases(parsed.keyPhrasesFound, input.keyPhrases.length);
  const keyPhrasesFound = inferFoundPhrases(
    input.userResponse,
    input.keyPhrases,
    suggestedFound,
  );
  const correctedSentence =
    typeof parsed.correctedSentence === "string" && parsed.correctedSentence.trim().length > 0
      ? parsed.correctedSentence.trim()
      : undefined;

  return {
    score: numericScore,
    result: numericScore >= 60 ? "correct" : "incorrect",
    strengths,
    improvements,
    correctedSentence,
    keyPhrasesFound,
  } satisfies B2FeedbackResult;
}

export async function getB2WritingFeedback(
  input: B2FeedbackInput,
): Promise<B2FeedbackResult> {
  const startTime = Date.now();
  const userResponse = input.userResponse.trim();
  if (userResponse.length < MIN_RESPONSE_LENGTH) {
    return tooShortResult();
  }

  try {
    if (!process.env.GROQ_API_KEY || !groq) {
      return fallbackResult();
    }

    const response = await groq.chat.completions.create({
      model: B2_MODEL,
      max_tokens: 400,
      temperature: 0.3,
      messages: [
        {
          role: "system",
          content:
            `You are a telc Deutsch B2 Beruf examiner. Evaluate the student's formal German response. Score 0-100 where 60+ passes. Check: correct use of ${input.grammarFocus}, formal register, grammar accuracy, and natural expression. Be concise and practical. Respond ONLY with valid JSON matching this shape exactly: {"score": number, "strengths": [string], "improvements": [string], "correctedSentence": string or null, "keyPhrasesFound": [string]}`,
        },
        {
          role: "user",
          content: [
            `Scenario: ${input.scenario}`,
            `Grammar focus: ${input.grammarFocus}`,
            `Expected key phrases: ${JSON.stringify(input.keyPhrases)}`,
            `Student response: ${userResponse}`,
          ].join("\n"),
        },
      ],
    });

    const result = parseFeedbackContent(response.choices[0]?.message?.content, {
      ...input,
      userResponse,
    });

    logStructured({
      event: "groq.b2_feedback",
      source: "b2-feedback",
      data: {
        durationMs: Date.now() - startTime,
      },
    });

    return result;
  } catch (error) {
    logStructured({
      event: "groq.b2_feedback.error",
      level: "error",
      source: "b2-feedback",
      message: "B2 feedback generation failed",
      error,
      data: {
        durationMs: Date.now() - startTime,
      },
    });
    return fallbackResult();
  }
}

