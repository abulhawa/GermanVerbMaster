import { z } from 'zod';

import { wordSchema } from '../admin-word-schemas';

export const batchEnrichmentWordSchema = z.object({
  id: z.number().int().positive(),
  lemma: z.string(),
  pos: wordSchema.shape.pos,
  updated: z.boolean(),
  fields: z.array(z.string()),
});

export const batchEnrichmentResponseSchema = z.object({
  scanned: z.number().int().min(0),
  updated: z.number().int().min(0),
  words: z.array(batchEnrichmentWordSchema),
});

export type BatchEnrichmentResponse = z.infer<typeof batchEnrichmentResponseSchema>;
