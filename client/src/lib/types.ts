import type { CEFRLevel, PracticeMode as SharedPracticeMode } from "@shared";

export interface Settings {
  level: CEFRLevel;
  showHints: boolean;
  showExamples: boolean;
}

export interface Progress {
  correct: number;
  total: number;
  lastPracticed: string;
  streak: number;
  practicedVerbs: Record<CEFRLevel, string[]>;
}

export type PracticeMode = SharedPracticeMode;