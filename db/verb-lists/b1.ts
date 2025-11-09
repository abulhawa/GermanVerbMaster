import type { GermanVerb } from "@shared";

export const b1Verbs: GermanVerb[] = [
  {
    infinitive: "erreichen",
    english: "to reach/achieve",
    präteritum: "erreichte",
    partizipII: "erreicht",
    auxiliary: "haben",
    level: "B1",
    präteritumExample: "Sie erreichte ihr Ziel.",
    partizipIIExample: "Er hat den Gipfel erreicht.",
    source: { name: "Duden", levelReference: "B1 Intermediate Verbs" }
  },
  {
    infinitive: "beschließen",
    english: "to decide",
    präteritum: "beschloss",
    partizipII: "beschlossen",
    auxiliary: "haben",
    level: "B1",
    präteritumExample: "Das Komitee beschloss die Änderungen.",
    partizipIIExample: "Sie haben eine neue Strategie beschlossen.",
    source: { name: "Duden", levelReference: "B1 Intermediate Verbs" },
    pattern: { type: "ablaut", group: "ie -> o -> o" }
  },
  {
    infinitive: "entstehen",
    english: "to develop/arise",
    präteritum: "entstand",
    partizipII: "entstanden",
    auxiliary: "sein",
    level: "B1",
    präteritumExample: "Daraus entstand eine neue Idee.",
    partizipIIExample: "Das Problem ist plötzlich entstanden.",
    source: { name: "Duden", levelReference: "B1 Intermediate Verbs" },
    pattern: { type: "ablaut", group: "e -> a -> a" }
  },
  {
    infinitive: "verbinden",
    english: "to connect/combine",
    präteritum: "verband",
    partizipII: "verbunden",
    auxiliary: "haben",
    level: "B1",
    präteritumExample: "Er verband die beiden Kabel.",
    partizipIIExample: "Sie hat Tradition mit Innovation verbunden.",
    source: { name: "Duden", levelReference: "B1 Intermediate Verbs" },
    pattern: { type: "ablaut", group: "i -> a -> u" }
  }
];
