import { z } from 'zod';

export const translationSchema = z.object({
  value: z.string(),
  source: z.string().nullable().optional(),
  language: z.string().nullable().optional(),
  confidence: z.number().nullable().optional(),
});

export const exampleSchema = z.object({
  exampleDe: z.string().nullable().optional(),
  exampleEn: z.string().nullable().optional(),
  source: z.string().nullable().optional(),
});

const prepositionAttributesSchema = z
  .object({
    cases: z.array(z.string()).optional(),
    notes: z.array(z.string()).optional(),
  })
  .partial();

const posAttributesSchema = z
  .object({
    pos: z.string().nullable().optional(),
    preposition: prepositionAttributesSchema.nullable().optional(),
    tags: z.array(z.string()).optional(),
    notes: z.array(z.string()).optional(),
  })
  .partial();

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
  aux: z.enum(['haben', 'sein', 'haben / sein']).nullable(),
  praesensIch: z.string().nullable(),
  praesensEr: z.string().nullable(),
  praeteritum: z.string().nullable(),
  partizipIi: z.string().nullable(),
  perfekt: z.string().nullable(),
  comparative: z.string().nullable(),
  superlative: z.string().nullable(),
  approved: z.boolean(),
  complete: z.boolean(),
  translations: z.array(translationSchema).nullable(),
  examples: z.array(exampleSchema).nullable(),
  posAttributes: posAttributesSchema.nullable(),
  enrichmentAppliedAt: z.coerce.date().nullable(),
  enrichmentMethod: z.enum(['bulk', 'manual_api', 'manual_entry', 'preexisting']).nullable(),
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
