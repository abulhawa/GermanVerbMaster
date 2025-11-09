import { z } from 'zod';

import type { Word } from '@shared';

export const wordFormSchema = z.object({
  level: z.string(),
  english: z.string(),
  exampleDe: z.string(),
  exampleEn: z.string(),
  gender: z.string(),
  plural: z.string(),
  separable: z.string(),
  aux: z.string(),
  praesensIch: z.string(),
  praesensEr: z.string(),
  praeteritum: z.string(),
  partizipIi: z.string(),
  perfekt: z.string(),
  comparative: z.string(),
  superlative: z.string(),
});

export type WordFormState = z.infer<typeof wordFormSchema>;

export function createFormState(word: Word): WordFormState {
  return {
    level: word.level ?? '',
    english: word.english ?? '',
    exampleDe: word.exampleDe ?? '',
    exampleEn: word.exampleEn ?? '',
    gender: word.gender ?? '',
    plural: word.plural ?? '',
    separable: word.separable === null ? 'unset' : word.separable ? 'true' : 'false',
    aux: word.aux ?? 'unset',
    praesensIch: word.praesensIch ?? '',
    praesensEr: word.praesensEr ?? '',
    praeteritum: word.praeteritum ?? '',
    partizipIi: word.partizipIi ?? '',
    perfekt: word.perfekt ?? '',
    comparative: word.comparative ?? '',
    superlative: word.superlative ?? '',
  };
}

export function preparePayload(form: WordFormState, pos: Word['pos']) {
  const payload: Record<string, unknown> = {};

  const assignText = (key: keyof WordFormState, column: keyof Word) => {
    const raw = form[key].trim();
    payload[column] = raw.length ? raw : null;
  };

  assignText('level', 'level');
  assignText('english', 'english');
  assignText('exampleDe', 'exampleDe');
  assignText('exampleEn', 'exampleEn');

  if (pos === 'V') {
    if (form.aux === 'unset') {
      payload.aux = null;
    } else if (
      form.aux === 'haben'
      || form.aux === 'sein'
      || form.aux === 'haben / sein'
    ) {
      payload.aux = form.aux;
    }

    if (form.separable === 'unset') {
      payload.separable = null;
    } else if (form.separable === 'true') {
      payload.separable = true;
    } else if (form.separable === 'false') {
      payload.separable = false;
    }

    assignText('praesensIch', 'praesensIch');
    assignText('praesensEr', 'praesensEr');
    assignText('praeteritum', 'praeteritum');
    assignText('partizipIi', 'partizipIi');
    assignText('perfekt', 'perfekt');
  }

  if (pos === 'N') {
    assignText('gender', 'gender');
    assignText('plural', 'plural');
  }

  if (pos === 'Adj') {
    assignText('comparative', 'comparative');
    assignText('superlative', 'superlative');
  }

  return payload;
}
