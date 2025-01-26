import { GermanVerb } from "../client/src/lib/verbs";

export const verbsData: GermanVerb[] = [
  {
    infinitive: "sein",
    english: "to be",
    präteritum: "war",
    partizipII: "gewesen",
    auxiliary: "sein",
    level: "A1",
    präteritumExample: "Gestern war ich im Kino.",
    partizipIIExample: "Ich bin schon oft in Berlin gewesen.",
    source: {
      name: "Goethe-Institut",
      levelReference: "A1 Essential Verbs"
    },
    pattern: {
      type: "other",
      group: "highly irregular"
    }
  },
  {
    infinitive: "haben",
    english: "to have",
    präteritum: "hatte",
    partizipII: "gehabt",
    auxiliary: "haben",
    level: "A1",
    präteritumExample: "Er hatte keine Zeit für das Treffen.",
    partizipIIExample: "Sie hat immer viel Geduld mit den Kindern gehabt.",
    source: {
      name: "Goethe-Institut",
      levelReference: "A1 Essential Verbs"
    },
    pattern: {
      type: "mixed",
      group: "haben pattern"
    }
  },
  {
    infinitive: "werden",
    english: "to become",
    präteritum: "wurde",
    partizipII: "geworden",
    auxiliary: "sein",
    level: "A1",
    präteritumExample: "Es wurde langsam dunkel draußen.",
    partizipIIExample: "Sie ist Ärztin geworden.",
    source: {
      name: "Goethe-Institut",
      levelReference: "A1 Essential Verbs"
    },
    pattern: {
      type: "ablaut",
      group: "e -> u -> o"
    }
  },
  {
    infinitive: "sprechen",
    english: "to speak",
    präteritum: "sprach",
    partizipII: "gesprochen",
    auxiliary: "haben",
    level: "A1",
    präteritumExample: "Er sprach sehr gut Deutsch.",
    partizipIIExample: "Wir haben viel Englisch gesprochen.",
    source: {
      name: "Duden",
      levelReference: "A1 Essential Verbs"
    },
    pattern: {
      type: "ablaut",
      group: "e -> a -> o"
    }
  },
  {
    infinitive: "fahren",
    english: "to drive/ride",
    präteritum: "fuhr",
    partizipII: "gefahren",
    auxiliary: "sein",
    level: "A2",
    präteritumExample: "Sie fuhr mit dem Bus zur Arbeit.",
    partizipIIExample: "Wir sind nach Berlin gefahren.",
    source: {
      name: "Goethe-Institut",
      levelReference: "A2 Common Verbs"
    },
    pattern: {
      type: "ablaut",
      group: "a -> u -> a"
    }
  },
  {
    infinitive: "verstehen",
    english: "to understand",
    präteritum: "verstand",
    partizipII: "verstanden",
    auxiliary: "haben",
    level: "B1",
    präteritumExample: "Ich verstand die Frage nicht.",
    partizipIIExample: "Hast du alles verstanden?",
    source: {
      name: "Duden",
      levelReference: "B1 Intermediate Verbs"
    },
    pattern: {
      type: "ablaut",
      group: "e -> a -> a"
    }
  },
  {
    infinitive: "beschreiben",
    english: "to describe",
    präteritum: "beschrieb",
    partizipII: "beschrieben",
    auxiliary: "haben",
    level: "B1",
    präteritumExample: "Er beschrieb das Problem genau.",
    partizipIIExample: "Sie hat die Situation gut beschrieben.",
    source: {
      name: "Duden",
      levelReference: "B1 Intermediate Verbs"
    },
    pattern: {
      type: "ablaut",
      group: "ei -> ie -> ie"
    }
  },
  {
    infinitive: "übertragen",
    english: "to transfer/transmit",
    präteritum: "übertrug",
    partizipII: "übertragen",
    auxiliary: "haben",
    level: "B2",
    präteritumExample: "Er übertrug die Verantwortung an seinen Kollegen.",
    partizipIIExample: "Die Krankheit hat sich schnell übertragen.",
    source: {
      name: "Duden",
      levelReference: "B2 Advanced Verbs"
    },
    pattern: {
      type: "ablaut",
      group: "a -> u -> a"
    }
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
    source: {
      name: "Duden",
      levelReference: "C1 Advanced Verbs"
    },
    pattern: {
      type: "ablaut",
      group: "e -> a -> o"
    }
  },
  {
    infinitive: "gedeihen",
    english: "to thrive/flourish",
    präteritum: "gedieh",
    partizipII: "gediehen",
    auxiliary: "sein",
    level: "C2",
    präteritumExample: "Das Unternehmen gedieh unter seiner Führung.",
    partizipIIExample: "Die Pflanzen sind in diesem Klima prächtig gediehen.",
    source: {
      name: "Duden",
      levelReference: "C2 Professional Verbs"
    },
    pattern: {
      type: "ablaut",
      group: "ei -> ie -> ie"
    }
  }
];