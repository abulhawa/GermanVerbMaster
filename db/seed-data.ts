import type { GermanVerb } from "@shared";
import { 
  a1Verbs,
  a2Verbs,
  b1Verbs,
  b2Verbs,
  c1Verbs,
  c2Verbs
} from "./verb-lists";

// Combine all verb lists
export const verbsData: GermanVerb[] = [
  ...a1Verbs,
  ...a2Verbs,
  ...b1Verbs,
  ...b2Verbs,
  ...c1Verbs,
  ...c2Verbs
];