import type { CEFRLevel } from "@shared";

import type { GermanVerb } from "@/lib/verbs";
import type { PracticeMode } from "@/lib/types";

export interface AnsweredQuestion {
  id: string;
  verb: GermanVerb;
  mode: PracticeMode;
  result: "correct" | "incorrect";
  attemptedAnswer: string;
  correctAnswer: string;
  prompt: string;
  timeSpent: number;
  answeredAt: string;
  level: CEFRLevel;
}

export const ANSWER_HISTORY_STORAGE_KEY = "answerHistory";
export const DEFAULT_MAX_STORED_ANSWERS = 60;

const isBrowser = typeof window !== "undefined";

export function loadAnswerHistory(): AnsweredQuestion[] {
  if (!isBrowser) {
    return [];
  }

  const raw = window.localStorage.getItem(ANSWER_HISTORY_STORAGE_KEY);
  if (!raw) {
    return [];
  }

  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return [];
    }

    return (parsed as AnsweredQuestion[]).slice(0, DEFAULT_MAX_STORED_ANSWERS);
  } catch (error) {
    console.warn("Failed to parse answer history from storage", error);
    return [];
  }
}

export function saveAnswerHistory(history: AnsweredQuestion[]): void {
  if (!isBrowser) {
    return;
  }

  try {
    window.localStorage.setItem(ANSWER_HISTORY_STORAGE_KEY, JSON.stringify(history));
  } catch (error) {
    console.warn("Failed to persist answer history", error);
  }
}

export function appendAnswer(
  entry: AnsweredQuestion,
  history: AnsweredQuestion[],
  limit = DEFAULT_MAX_STORED_ANSWERS,
): AnsweredQuestion[] {
  const nextHistory = [entry, ...history];
  return nextHistory.slice(0, Math.max(limit, 1));
}
