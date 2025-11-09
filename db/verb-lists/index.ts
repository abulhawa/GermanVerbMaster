import type { CEFRLevel, GermanVerb } from "@shared";

import { a1Verbs } from "./a1";
import { a2Verbs } from "./a2";
import { b1Verbs } from "./b1";
import { b2Verbs } from "./b2";
import { c1Verbs } from "./c1";
import { c2Verbs } from "./c2";

export { a1Verbs };
export { a2Verbs };
export { b1Verbs };
export { b2Verbs };
export { c1Verbs };
export { c2Verbs };

export const CEFR_LEVELS = ["A1", "A2", "B1", "B2", "C1", "C2"] as const satisfies ReadonlyArray<CEFRLevel>;

export type VerbListsByLevel = Record<CEFRLevel, ReadonlyArray<GermanVerb>>;

export const verbListsByLevel: VerbListsByLevel = {
  A1: a1Verbs,
  A2: a2Verbs,
  B1: b1Verbs,
  B2: b2Verbs,
  C1: c1Verbs,
  C2: c2Verbs
};

export const verbsData: GermanVerb[] = CEFR_LEVELS.flatMap(
  level => verbListsByLevel[level]
);
