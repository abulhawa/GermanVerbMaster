export interface Settings {
  level: 'A1' | 'A2';
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
