import { z } from 'zod';

export const wordSchema = z.object({
  id: z.number(),
  lemma: z.string(),
  pos: z.enum(['V', 'N', 'Adj', 'Adv', 'Pron', 'Det', 'Präp', 'Konj', 'Num', 'Part', 'Interj']),
  level: z.string().nullable(),
  english: z.string().nullable(),
  exampleDe: z.string().nullable(),
  exampleEn: z.string().nullable(),
  gender: z.string().nullable(),
  plural: z.string().nullable(),
  separable: z.boolean().nullable(),
  aux: z.enum(['haben', 'sein']).nullable(),
  praesensIch: z.string().nullable(),
  praesensEr: z.string().nullable(),
  praeteritum: z.string().nullable(),
  partizipIi: z.string().nullable(),
  perfekt: z.string().nullable(),
  comparative: z.string().nullable(),
  superlative: z.string().nullable(),
  canonical: z.boolean(),
  complete: z.boolean(),
  sourcesCsv: z.string().nullable(),
  sourceNotes: z.string().nullable(),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
});

export const wordsResponseSchema = z.object({
  data: z.array(wordSchema),
  pagination: z.object({
    page: z.number().int().min(1),
    perPage: z.number().int().min(1),
    total: z.number().int().min(0),
    totalPages: z.number().int().min(0),
  }),
});

export type AdminWord = z.infer<typeof wordSchema>;
export type WordsResponse = z.infer<typeof wordsResponseSchema>;
