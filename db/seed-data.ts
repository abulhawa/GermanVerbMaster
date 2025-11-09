import type { CEFRLevel, GermanVerb } from "@shared";

import {
  a1Verbs,
  a2Verbs,
  b1Verbs,
  b2Verbs,
  c1Verbs,
  c2Verbs,
  verbListsByLevel
} from "./verb-lists/index";
import { loadCefrVerbPlaceholdersByLevel } from "./cefr-verb-loader";

const SUPPLEMENT_LEVELS: readonly CEFRLevel[] = ["A1", "A2", "B1"];

const manualInfinitives = new Set(
  SUPPLEMENT_LEVELS.flatMap(level => verbListsByLevel[level]).map(verb =>
    verb.infinitive.toLowerCase()
  )
);

const cefrSupplement = loadCefrVerbPlaceholdersByLevel(SUPPLEMENT_LEVELS, manualInfinitives);

const combinedA1Verbs: GermanVerb[] = [...a1Verbs, ...(cefrSupplement.A1 ?? [])];
const combinedA2Verbs: GermanVerb[] = [...a2Verbs, ...(cefrSupplement.A2 ?? [])];
const combinedB1Verbs: GermanVerb[] = [...b1Verbs, ...(cefrSupplement.B1 ?? [])];

export const verbsData: GermanVerb[] = [
  ...combinedA1Verbs,
  ...combinedA2Verbs,
  ...combinedB1Verbs,
  ...b2Verbs,
  ...c1Verbs,
  ...c2Verbs
];
