import type { GermanVerb } from "@shared";

export const c1Verbs: GermanVerb[] = [
  {
    infinitive: "erörtern",
    english: "to discuss/debate",
    präteritum: "erörterte",
    partizipII: "erörtert",
    auxiliary: "haben",
    level: "C1",
    präteritumExample: "Das Gremium erörterte die Vorschläge.",
    partizipIIExample: "Die Experten haben die Problematik erörtert.",
    source: { name: "Duden", levelReference: "C1 Professional Verbs" }
  },
  {
    infinitive: "entsprechen",
    english: "to correspond",
    präteritum: "entsprach",
    partizipII: "entsprochen",
    auxiliary: "haben",
    level: "C1",
    präteritumExample: "Das Ergebnis entsprach den Erwartungen.",
    partizipIIExample: "Die Leistung hat den Anforderungen entsprochen.",
    source: { name: "Duden", levelReference: "C1 Professional Verbs" },
    pattern: { type: "ablaut", group: "e -> a -> o" }
  },
  {
    infinitive: "beinhalten",
    english: "to contain/include",
    präteritum: "beinhaltete",
    partizipII: "beinhaltet",
    auxiliary: "haben",
    level: "C1",
    präteritumExample: "Der Vertrag beinhaltete wichtige Klauseln.",
    partizipIIExample: "Das Angebot hat viele Vorteile beinhaltet.",
    source: { name: "Duden", levelReference: "C1 Professional Verbs" }
  }
];
