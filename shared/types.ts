export type CEFRLevel = 'A1' | 'A2' | 'B1' | 'B2' | 'C1' | 'C2';

export type PracticeMode = 'präteritum' | 'partizipII' | 'auxiliary' | 'english';

export type PracticeResult = 'correct' | 'incorrect';

export interface GermanVerb {
  infinitive: string;
  english: string;
  präteritum: string;
  partizipII: string;
  auxiliary: 'haben' | 'sein';
  level: CEFRLevel;
  präteritumExample: string;
  partizipIIExample: string;
  source: {
    name: 'Duden' | 'Goethe-Institut' | 'CEFR' | string;
    levelReference: string;
  };
  pattern?: {
    type: 'ablaut' | 'mixed' | 'modal' | 'other' | string;
    group?: string;
  } | null;
}

export interface PracticeAttemptPayload {
  verb: string;
  mode: PracticeMode;
  result: PracticeResult;
  attemptedAnswer: string;
  timeSpent: number;
  level: CEFRLevel;
  deviceId: string;
  queuedAt?: string;
}
