export type CEFRLevel = 'A1' | 'A2' | 'B1' | 'B2' | 'C1' | 'C2';

export type PracticeMode = 'präteritum' | 'partizipII' | 'auxiliary' | 'english';

export type PracticeResult = 'correct' | 'incorrect';

export type PartOfSpeech =
  | 'V'
  | 'N'
  | 'Adj'
  | 'Adv'
  | 'Pron'
  | 'Det'
  | 'Präp'
  | 'Konj'
  | 'Num'
  | 'Part'
  | 'Interj';

export interface Word {
  id: number;
  lemma: string;
  pos: PartOfSpeech;
  level: string | null;
  english: string | null;
  exampleDe: string | null;
  exampleEn: string | null;
  gender: string | null;
  plural: string | null;
  separable: boolean | null;
  aux: 'haben' | 'sein' | null;
  praesensIch: string | null;
  praesensEr: string | null;
  praeteritum: string | null;
  partizipIi: string | null;
  perfekt: string | null;
  comparative: string | null;
  superlative: string | null;
  canonical: boolean;
  complete: boolean;
  sourcesCsv: string | null;
  sourceNotes: string | null;
  createdAt: Date;
  updatedAt: Date;
}

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
  praesensIch?: string | null;
  praesensEr?: string | null;
  perfekt?: string | null;
  separable?: boolean | null;
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
