import { z } from 'zod';

import type { WortschatzWord } from '@shared';
import { ANDROID_B2_BERUF_VERSION } from '@shared/content-sources';

const partOfSpeechSchema = z.enum([
  'V',
  'N',
  'Adj',
  'Adv',
  'Pron',
  'Det',
  'Präp',
  'Konj',
  'Num',
  'Part',
  'Interj',
]);

const wortschatzWordSchema = z.object({
  id: z.number().int(),
  lemma: z.string(),
  pos: partOfSpeechSchema,
  level: z.string().nullable(),
  english: z.string().nullable(),
  exampleDe: z.string().nullable(),
  exampleEn: z.string().nullable(),
  gender: z.string().nullable(),
  plural: z.string().nullable(),
});

const wortschatzWordsSchema = z.array(wortschatzWordSchema);

export const WORTSCHATZ_QUERY_KEY = ['wortschatz-words'] as const;

export interface WortschatzWordsResponse {
  words: WortschatzWord[];
  datasetVersion: string;
}

export async function fetchWortschatzWords(): Promise<WortschatzWordsResponse> {
  const response = await fetch('/api/wortschatz/words', {
    credentials: 'include',
    headers: {
      accept: 'application/json',
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to load Wortschatz words (${response.status})`);
  }

  const payload = await response.json();
  const words = wortschatzWordsSchema.parse(payload);
  const datasetVersion =
    response.headers.get('x-wortschatz-dataset-version') ?? ANDROID_B2_BERUF_VERSION;

  return {
    words,
    datasetVersion,
  };
}
