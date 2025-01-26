export interface Settings {
  level: 'A1' | 'A2' | 'B1' | 'B2' | 'C1' | 'C2';
  showHints: boolean;
  showExamples: boolean;
}

export interface Progress {
  correct: number;
  total: number;
  lastPracticed: string;
  streak: number;
  practicedVerbs: {
    [key in 'A1' | 'A2' | 'B1' | 'B2' | 'C1' | 'C2']: string[];
  };
}

export type PracticeMode = 'präteritum' | 'partizipII' | 'auxiliary' | 'english';