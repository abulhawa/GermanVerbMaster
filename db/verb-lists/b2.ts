import type { GermanVerb } from "@shared";

export const b2Verbs: GermanVerb[] = [
  {
    infinitive: "bewerten",
    english: "to evaluate/assess",
    präteritum: "bewertete",
    partizipII: "bewertet",
    auxiliary: "haben",
    level: "B2",
    präteritumExample: "Der Professor bewertete die Arbeiten.",
    partizipIIExample: "Die Jury hat die Leistungen bewertet.",
    source: { name: "Duden", levelReference: "B2 Advanced Verbs" }
  },
  {
    infinitive: "übertragen",
    english: "to transfer/transmit",
    präteritum: "übertrug",
    partizipII: "übertragen",
    auxiliary: "haben",
    level: "B2",
    präteritumExample: "Er übertrug die Verantwortung.",
    partizipIIExample: "Die Krankheit hat sich schnell übertragen.",
    source: { name: "Duden", levelReference: "B2 Advanced Verbs" },
    pattern: { type: "ablaut", group: "a -> u -> a" }
  },
  {
    infinitive: "durchführen",
    english: "to carry out/conduct",
    präteritum: "führte durch",
    partizipII: "durchgeführt",
    auxiliary: "haben",
    level: "B2",
    präteritumExample: "Das Team führte das Experiment durch.",
    partizipIIExample: "Sie haben eine Studie durchgeführt.",
    source: { name: "Duden", levelReference: "B2 Advanced Verbs" }
  }
];
