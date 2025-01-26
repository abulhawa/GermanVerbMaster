export interface Settings {
  level: 'A1' | 'A2' | 'B1' | 'B2' | 'C1';
  showHints: boolean;
  showExamples: boolean;
}

export interface Progress {
  correct: number;
  total: number;
  lastPracticed: string;
  streak: number;
}

export type PracticeMode = 'präteritum' | 'partizipII' | 'auxiliary';