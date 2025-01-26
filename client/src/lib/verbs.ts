import { z } from 'zod';

export interface GermanVerb {
  infinitive: string;
  english: string;
  präteritum: string;
  partizipII: string;
  auxiliary: 'haben' | 'sein';
  level: 'A1' | 'A2' | 'B1' | 'B2' | 'C1' | 'C2';
  präteritumExample: string;
  partizipIIExample: string;
  source: {
    name: 'Duden' | 'Goethe-Institut' | 'CEFR';
    levelReference: string;
  };
  pattern?: {
    type: 'ablaut' | 'mixed' | 'other';
    group?: string;
  };
}

// Helper function to get verbs by pattern group
export const getVerbsByPattern = (patternGroup: string): GermanVerb[] => {
  return verbs.filter(verb => verb.pattern?.group === patternGroup);
};

// Get a random verb based on level and optionally pattern group
export const getRandomVerb = (
  level: 'A1' | 'A2' | 'B1' | 'B2' | 'C1' | 'C2',
  patternGroup?: string
): GermanVerb => {
  let filteredVerbs = verbs.filter(verb => verb.level === level);
  if (patternGroup) {
    filteredVerbs = filteredVerbs.filter(verb => verb.pattern?.group === patternGroup);
  }
  // If no verbs found for the level, return the first verb from the previous level
  if (filteredVerbs.length === 0) {
    const levels = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'];
    const currentLevelIndex = levels.indexOf(level);
    if (currentLevelIndex > 0) {
      const previousLevel = levels[currentLevelIndex - 1];
      filteredVerbs = verbs.filter(verb => verb.level === previousLevel);
    }
  }
  return filteredVerbs[Math.floor(Math.random() * filteredVerbs.length)];
};

// Get all available pattern groups for a specific level
export const getPatternGroups = (level: 'A1' | 'A2' | 'B1' | 'B2' | 'C1' | 'C2'): string[] => {
  const groups = new Set<string>();
  verbs
    .filter(verb => verb.level === level)
    .forEach(verb => {
      if (verb.pattern?.group) {
        groups.add(verb.pattern.group);
      }
    });
  return Array.from(groups);
};

// Source: Goethe-Institut A1 Vocabulary List & Duden
export const verbs: GermanVerb[] = [
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
    infinitive: "gehen",
    english: "to go",
    präteritum: "ging",
    partizipII: "gegangen",
    auxiliary: "sein",
    level: "A1",
    präteritumExample: "Sie ging zur Schule.",
    partizipIIExample: "Wir sind in den Park gegangen.",
    source: { name: "Duden", levelReference: "A1 Essential Verbs" }
  },
  {
    infinitive: "kommen",
    english: "to come",
    präteritum: "kam",
    partizipII: "gekommen",
    auxiliary: "sein",
    level: "A1",
    präteritumExample: "Er kam spät nach Hause.",
    partizipIIExample: "Sie ist pünktlich gekommen.",
    source: { name: "Duden", levelReference: "A1 Essential Verbs" }
  },
  {
    infinitive: "machen",
    english: "to make/do",
    präteritum: "machte",
    partizipII: "gemacht",
    auxiliary: "haben",
    level: "A1",
    präteritumExample: "Sie machte ihre Hausaufgaben.",
    partizipIIExample: "Ich habe einen Kuchen gemacht.",
    source: { name: "Duden", levelReference: "A1 Essential Verbs" }
  },
  {
    infinitive: "heißen",
    english: "to be called",
    präteritum: "hieß",
    partizipII: "geheißen",
    auxiliary: "haben",
    level: "A1",
    präteritumExample: "Er hieß Peter.",
    partizipIIExample: "Sie hat schon immer so geheißen.",
    source: { name: "Duden", levelReference: "A1 Essential Verbs" }
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
    source: { name: "Duden", levelReference: "A1 Essential Verbs" }
  },
  {
    infinitive: "sehen",
    english: "to see",
    präteritum: "sah",
    partizipII: "gesehen",
    auxiliary: "haben",
    level: "A1",
    präteritumExample: "Ich sah einen Film.",
    partizipIIExample: "Hast du das neue Auto gesehen?",
    source: { name: "Duden", levelReference: "A1 Essential Verbs" }
  },
  {
    infinitive: "essen",
    english: "to eat",
    präteritum: "aß",
    partizipII: "gegessen",
    auxiliary: "haben",
    level: "A1",
    präteritumExample: "Er aß eine Pizza.",
    partizipIIExample: "Wir haben schon gegessen.",
    source: { name: "Duden", levelReference: "A1 Essential Verbs" }
  },
  {
    infinitive: "anfangen",
    english: "to begin",
    präteritum: "fing an",
    partizipII: "angefangen",
    auxiliary: "haben",
    level: "A2",
    präteritumExample: "Der Film fing um 20 Uhr an.",
    partizipIIExample: "Das Semester hat bereits angefangen.",
    source: { name: "Duden", levelReference: "A2 Common Verbs" }
  },
  {
    infinitive: "ankommen",
    english: "to arrive",
    präteritum: "kam an",
    partizipII: "angekommen",
    auxiliary: "sein",
    level: "A2",
    präteritumExample: "Der Zug kam pünktlich an.",
    partizipIIExample: "Wir sind gerade angekommen.",
    source: { name: "Duden", levelReference: "A2 Common Verbs" }
  },
  {
    infinitive: "anrufen",
    english: "to call",
    präteritum: "rief an",
    partizipII: "angerufen",
    auxiliary: "haben",
    level: "A2",
    präteritumExample: "Sie rief ihre Mutter an.",
    partizipIIExample: "Er hat dreimal angerufen.",
    source: { name: "Duden", levelReference: "A2 Common Verbs" }
  },
  {
    infinitive: "abfahren",
    english: "to depart",
    präteritum: "fuhr ab",
    partizipII: "abgefahren",
    auxiliary: "sein",
    level: "B1",
    präteritumExample: "Der Bus fuhr pünktlich ab.",
    partizipIIExample: "Der Zug ist bereits abgefahren.",
    source: { name: "Duden", levelReference: "B1 Intermediate Verbs" }
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
    source: { name: "Duden", levelReference: "B1 Intermediate Verbs" }
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
    source: { name: "Duden", levelReference: "B1 Intermediate Verbs" }
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
    source: { name: "Duden", levelReference: "B2 Advanced Verbs" }
  },
  {
    infinitive: "unternehmen",
    english: "to undertake",
    präteritum: "unternahm",
    partizipII: "unternommen",
    auxiliary: "haben",
    level: "B2",
    präteritumExample: "Sie unternahm eine lange Reise.",
    partizipIIExample: "Was hast du am Wochenende unternommen?",
    source: { name: "Duden", levelReference: "B2 Advanced Verbs" }
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
    source: { name: "Duden", levelReference: "C1 Advanced Verbs" }
  },
  {
    infinitive: "unterschreiben",
    english: "to sign",
    präteritum: "unterschrieb",
    partizipII: "unterschrieben",
    auxiliary: "haben",
    level: "C1",
    präteritumExample: "Er unterschrieb den Vertrag sofort.",
    partizipIIExample: "Sie hat alle Dokumente unterschrieben.",
    source: { name: "Duden", levelReference: "C1 Advanced Verbs" }
  },
  // Adding C2 level verbs
  {
    infinitive: "erwerben",
    english: "to acquire/obtain",
    präteritum: "erwarb",
    partizipII: "erworben",
    auxiliary: "haben",
    level: "C2",
    präteritumExample: "Er erwarb umfangreiche Kenntnisse in der deutschen Literatur.",
    partizipIIExample: "Die Firma hat mehrere Startups erworben.",
    source: { name: "Duden", levelReference: "C2 Professional Verbs" },
    pattern: {
      type: "ablaut",
      group: "e -> a -> o"
    }
  },
  {
    infinitive: "obliegen",
    english: "to be incumbent upon",
    präteritum: "oblag",
    partizipII: "oblegen",
    auxiliary: "haben",
    level: "C2",
    präteritumExample: "Es oblag dem Vorstand, diese Entscheidung zu treffen.",
    partizipIIExample: "Die Verantwortung hat ihm oblegen.",
    source: { name: "Duden", levelReference: "C2 Professional Verbs" },
    pattern: {
      type: "ablaut",
      group: "ie -> a -> e"
    }
  },
  {
    infinitive: "bedingen",
    english: "to necessitate/require",
    präteritum: "bedang",
    partizipII: "bedungen",
    auxiliary: "haben",
    level: "C2",
    präteritumExample: "Diese Situation bedang eine sofortige Entscheidung.",
    partizipIIExample: "Die Qualität hat den hohen Preis bedungen.",
    source: { name: "Duden", levelReference: "C2 Professional Verbs" },
    pattern: {
      type: "ablaut",
      group: "i -> a -> u"
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
    source: { name: "Duden", levelReference: "C2 Professional Verbs" },
    pattern: {
      type: "ablaut",
      group: "ei -> ie -> ie"
    }
  },
  {
    infinitive: "verbleichen",
    english: "to fade away/pass away (formal)",
    präteritum: "verblich",
    partizipII: "verblichen",
    auxiliary: "sein",
    level: "C2",
    präteritumExample: "Die Farbe verblich im Sonnenlicht.",
    partizipIIExample: "Die alten Schriften sind mit der Zeit verblichen.",
    source: { name: "Duden", levelReference: "C2 Professional Verbs" },
    pattern: {
      type: "ablaut",
      group: "ei -> i -> i"
    }
  },
  // Adding more A1 verbs
  {
    infinitive: "trinken",
    english: "to drink",
    präteritum: "trank",
    partizipII: "getrunken",
    auxiliary: "haben",
    level: "A1",
    präteritumExample: "Er trank einen Kaffee.",
    partizipIIExample: "Ich habe schon Wasser getrunken.",
    source: { name: "Goethe-Institut", levelReference: "A1 Essential Verbs" },
    pattern: {
      type: "ablaut",
      group: "i -> a -> u"
    }
  },
  {
    infinitive: "fahren",
    english: "to drive/ride",
    präteritum: "fuhr",
    partizipII: "gefahren",
    auxiliary: "sein",
    level: "A1",
    präteritumExample: "Sie fuhr mit dem Bus zur Arbeit.",
    partizipIIExample: "Wir sind nach Berlin gefahren.",
    source: { name: "Goethe-Institut", levelReference: "A1 Essential Verbs" },
    pattern: {
      type: "ablaut",
      group: "a -> u -> a"
    }
  },
  {
    infinitive: "schlafen",
    english: "to sleep",
    präteritum: "schlief",
    partizipII: "geschlafen",
    auxiliary: "haben",
    level: "A1",
    präteritumExample: "Das Kind schlief den ganzen Nachmittag.",
    partizipIIExample: "Hast du gut geschlafen?",
    source: { name: "Goethe-Institut", levelReference: "A1 Essential Verbs" },
    pattern: {
      type: "ablaut",
      group: "a -> ie -> a"
    }
  },
    {
    infinitive: "schreiben",
    english: "to write",
    präteritum: "schrieb",
    partizipII: "geschrieben",
    auxiliary: "haben",
    level: "A1",
    präteritumExample: "Er schrieb einen Brief.",
    partizipIIExample: "Sie hat einen Roman geschrieben.",
    source: { name: "Goethe-Institut", levelReference: "A1 Essential Verbs" },
    pattern: {
      type: "ablaut",
      group: "ei -> ie -> ie"
    }
  },
  {
    infinitive: "tragen",
    english: "to wear/carry",
    präteritum: "trug",
    partizipII: "getragen",
    auxiliary: "haben",
    level: "A1",
    präteritumExample: "Sie trug ein rotes Kleid.",
    partizipIIExample: "Er hat einen schweren Koffer getragen.",
    source: { name: "Goethe-Institut", levelReference: "A1 Essential Verbs" },
    pattern: {
      type: "ablaut",
      group: "a -> u -> a"
    }
  },
  {
    infinitive: "waschen",
    english: "to wash",
    präteritum: "wusch",
    partizipII: "gewaschen",
    auxiliary: "haben",
    level: "A1",
    präteritumExample: "Sie wusch ihre Hände.",
    partizipIIExample: "Ich habe meine Kleidung gewaschen.",
    source: { name: "Goethe-Institut", levelReference: "A1 Essential Verbs" },
    pattern: {
      type: "ablaut",
      group: "a -> u -> a"
    }
  },
  {
    infinitive: "singen",
    english: "to sing",
    präteritum: "sang",
    partizipII: "gesungen",
    auxiliary: "haben",
    level: "A1",
    präteritumExample: "Der Chor sang wunderschön.",
    partizipIIExample: "Wir haben Weihnachtslieder gesungen.",
    source: { name: "Goethe-Institut", levelReference: "A1 Essential Verbs" },
    pattern: {
      type: "ablaut",
      group: "i -> a -> u"
    }
  },
  {
    infinitive: "bleiben",
    english: "to stay",
    präteritum: "blieb",
    partizipII: "geblieben",
    auxiliary: "sein",
    level: "A1",
    präteritumExample: "Er blieb zu Hause.",
    partizipIIExample: "Sie ist lange in Berlin geblieben.",
    source: { name: "Goethe-Institut", levelReference: "A1 Essential Verbs" },
    pattern: {
      type: "ablaut",
      group: "ei -> ie -> ie"
    }
  },
  {
    infinitive: "steigen",
    english: "to climb/rise",
    präteritum: "stieg",
    partizipII: "gestiegen",
    auxiliary: "sein",
    level: "A2",
    präteritumExample: "Die Temperatur stieg schnell.",
    partizipIIExample: "Der Preis ist stark gestiegen.",
    source: { name: "Duden", levelReference: "A2 Common Verbs" },
    pattern: {
      type: "ablaut",
      group: "ei -> ie -> ie"
    }
  },
  {
    infinitive: "vergessen",
    english: "to forget",
    präteritum: "vergaß",
    partizipII: "vergessen",
    auxiliary: "haben",
    level: "A2",
    präteritumExample: "Er vergaß seinen Schlüssel.",
    partizipIIExample: "Ich habe das Passwort vergessen.",
    source: { name: "Duden", levelReference: "A2 Common Verbs" },
    pattern: {
      type: "ablaut",
      group: "e -> a -> e"
    }
  },
  {
    infinitive: "erhalten",
    english: "to receive",
    präteritum: "erhielt",
    partizipII: "erhalten",
    auxiliary: "haben",
    level: "B1",
    präteritumExample: "Sie erhielt eine wichtige Nachricht.",
    partizipIIExample: "Wir haben die Dokumente erhalten.",
    source: { name: "Duden", levelReference: "B1 Intermediate Verbs" },
    pattern: {
      type: "ablaut",
      group: "a -> ie -> a"
    }
  },
  {
    infinitive: "geschehen",
    english: "to happen",
    präteritum: "geschah",
    partizipII: "geschehen",
    auxiliary: "sein",
    level: "B1",
    präteritumExample: "Der Unfall geschah am Morgen.",
    partizipIIExample: "Was ist hier geschehen?",
    source: { name: "Duden", levelReference: "B1 Intermediate Verbs" },
    pattern: {
      type: "ablaut",
      group: "e -> a -> e"
    }
  },
  {
    infinitive: "verziehen",
    english: "to forgive",
    präteritum: "verzieh",
    partizipII: "verziehen",
    auxiliary: "haben",
    level: "B2",
    präteritumExample: "Sie verzieh ihm den Fehler.",
    partizipIIExample: "Er hat mir nie verziehen.",
    source: { name: "Duden", levelReference: "B2 Advanced Verbs" },
    pattern: {
      type: "ablaut",
      group: "ie -> ie -> ie"
    }
  },
  {
    infinitive: "ergreifen",
    english: "to seize/grasp",
    präteritum: "ergriff",
    partizipII: "ergriffen",
    auxiliary: "haben",
    level: "B2",
    präteritumExample: "Er ergriff die Gelegenheit.",
    partizipIIExample: "Sie hat sofort Maßnahmen ergriffen.",
    source: { name: "Duden", levelReference: "B2 Advanced Verbs" },
    pattern: {
      type: "ablaut",
      group: "ei -> i -> i"
    }
  },
  {
    infinitive: "lesen",
    english: "to read",
    präteritum: "las",
    partizipII: "gelesen",
    auxiliary: "haben",
    level: "A1",
    präteritumExample: "Sie las ein interessantes Buch.",
    partizipIIExample: "Ich habe den Brief gelesen.",
    source: { name: "Goethe-Institut", levelReference: "A1 Essential Verbs" },
    pattern: {
      type: "ablaut",
      group: "e -> a -> e"
    }
  },
  {
    infinitive: "nehmen",
    english: "to take",
    präteritum: "nahm",
    partizipII: "genommen",
    auxiliary: "haben",
    level: "A1",
    präteritumExample: "Er nahm den Bus zur Arbeit.",
    partizipIIExample: "Hast du deine Medizin genommen?",
    source: { name: "Goethe-Institut", levelReference: "A1 Essential Verbs" },
    pattern: {
      type: "ablaut",
      group: "e -> a -> o"
    }
  },
  {
    infinitive: "helfen",
    english: "to help",
    präteritum: "half",
    partizipII: "geholfen",
    auxiliary: "haben",
    level: "A1",
    präteritumExample: "Sie half ihrer Mutter in der Küche.",
    partizipIIExample: "Er hat mir bei den Hausaufgaben geholfen.",
    source: { name: "Goethe-Institut", levelReference: "A1 Essential Verbs" },
    pattern: {
      type: "ablaut",
      group: "e -> a -> o"
    }
  },
  {
    infinitive: "geben",
    english: "to give",
    präteritum: "gab",
    partizipII: "gegeben",
    auxiliary: "haben",
    level: "A1",
    präteritumExample: "Er gab mir das Buch zurück.",
    partizipIIExample: "Sie hat mir ihre Adresse gegeben.",
    source: { name: "Goethe-Institut", levelReference: "A1 Essential Verbs" },
    pattern: {
      type: "ablaut",
      group: "e -> a -> e"
    }
  },
  {
    infinitive: "finden",
    english: "to find",
    präteritum: "fand",
    partizipII: "gefunden",
    auxiliary: "haben",
    level: "A1",
    präteritumExample: "Er fand seinen Schlüssel nicht.",
    partizipIIExample: "Ich habe meine Brille gefunden.",
    source: { name: "Goethe-Institut", levelReference: "A1 Essential Verbs" },
    pattern: {
      type: "ablaut",
      group: "i -> a -> u"
    }
  },
  // Adding more A2 level verbs
  {
    infinitive: "aussteigen",
    english: "to get out/off",
    präteritum: "stieg aus",
    partizipII: "ausgestiegen",
    auxiliary: "sein",
    level: "A2",
    präteritumExample: "Sie stieg aus dem Bus aus.",
    partizipIIExample: "Wir sind am Hauptbahnhof ausgestiegen.",
    source: { name: "Duden", levelReference: "A2 Common Verbs" },
    pattern: {
      type: "ablaut",
      group: "ei -> ie -> ie"
    }
  },
  {
    infinitive: "einsteigen",
    english: "to get in/on",
    präteritum: "stieg ein",
    partizipII: "eingestiegen",
    auxiliary: "sein",
    level: "A2",
    präteritumExample: "Er stieg in den Zug ein.",
    partizipIIExample: "Sie ist in das falsche Auto eingestiegen.",
    source: { name: "Duden", levelReference: "A2 Common Verbs" },
    pattern: {
      type: "ablaut",
      group: "ei -> ie -> ie"
    }
  },
  // Adding more B1 level verbs
  {
    infinitive: "aufwachen",
    english: "to wake up",
    präteritum: "wachte auf",
    partizipII: "aufgewacht",
    auxiliary: "sein",
    level: "B1",
    präteritumExample: "Er wachte früh auf.",
    partizipIIExample: "Sie ist spät aufgewacht.",
    source: { name: "Duden", levelReference: "B1 Intermediate Verbs" }
  },
  {
    infinitive: "beginnen",
    english: "to begin",
    präteritum: "begann",
    partizipII: "begonnen",
    auxiliary: "haben",
    level: "B1",
    präteritumExample: "Der Kurs begann um 9 Uhr.",
    partizipIIExample: "Das Semester hat bereits begonnen.",
    source: { name: "Duden", levelReference: "B1 Intermediate Verbs" },
    pattern: {
      type: "ablaut",
      group: "i -> a -> o"
    }
  },
  // Adding more B2 level verbs
  {
    infinitive: "bewerben",
    english: "to apply",
    präteritum: "bewarb",
    partizipII: "beworben",
    auxiliary: "haben",
    level: "B2",
    präteritumExample: "Sie bewarb sich um die Stelle.",
    partizipIIExample: "Er hat sich bei vielen Firmen beworben.",
    source: { name: "Duden", levelReference: "B2 Advanced Verbs" },
    pattern: {
      type: "ablaut",
      group: "e -> a -> o"
    }
  },
  {
    infinitive: "widersprechen",
    english: "to contradict",
    präteritum: "widersprach",
    partizipII: "widersprochen",
    auxiliary: "haben",
    level: "B2",
    präteritumExample: "Er widersprach dem Chef höflich.",
    partizipIIExample: "Sie hat seiner Meinung widersprochen.",
    source: { name: "Duden", levelReference: "B2 Advanced Verbs" },
    pattern: {
      type: "ablaut",
      group: "e -> a -> o"
    }
  },
    {
    infinitive: "verschwinden",
    english: "to disappear",
    präteritum: "verschwand",
    partizipII: "verschwunden",
    auxiliary: "sein",
    level: "B2",
    präteritumExample: "Der Verdächtige verschwand in der Menge.",
    partizipIIExample: "Die Sonne ist hinter den Wolken verschwunden.",
    source: { name: "Duden", levelReference: "B2 Advanced Verbs" },
    pattern: {
      type: "ablaut",
      group: "i -> a -> u"
    }
  },
  // Adding more C1 verbs
  {
    infinitive: "unterlassen",
    english: "to refrain from",
    präteritum: "unterließ",
    partizipII: "unterlassen",
    auxiliary: "haben",
    level: "C1",
    präteritumExample: "Er unterließ jeglichen Kommentar.",
    partizipIIExample: "Sie hat es unterlassen, die Dokumente zu prüfen.",
    source: { name: "Duden", levelReference: "C1 Advanced Verbs" },
    pattern: {
      type: "ablaut",
      group: "a -> ie -> a"
    }
  },
  {
    infinitive: "auferlegen",
    english: "to impose",
    präteritum: "erlegte auf",
    partizipII: "auferlegt",
    auxiliary: "haben",
    level: "C1",
    präteritumExample: "Das Gericht erlegte ihm eine Strafe auf.",
    partizipIIExample: "Der Vertrag hat uns viele Pflichten auferlegt.",
    source: { name: "Duden", levelReference: "C1 Advanced Verbs" }
  },
  // Adding more C2 verbs
  {
    infinitive: "beschreiten",
    english: "to embark upon",
    präteritum: "beschritt",
    partizipII: "beschritten",
    auxiliary: "haben",
    level: "C2",
    präteritumExample: "Sie beschritt einen neuen Weg in der Forschung.",
    partizipIIExample: "Er hat einen ungewöhnlichen Karriereweg beschritten.",
    source: { name: "Duden", levelReference: "C2 Professional Verbs" },
    pattern: {
      type: "ablaut",
      group: "ei -> i -> i"
    }
  },
  {
    infinitive: "obsiegen",
    english: "to prevail",
    präteritum: "obsiegte",
    partizipII: "obsiegt",
    auxiliary: "haben",
    level: "C2",
    präteritumExample: "Die Mannschaft obsiegte im Finale.",
    partizipIIExample: "Die Vernunft hat über die Emotion obsiegt.",
    source: { name: "Duden", levelReference: "C2 Professional Verbs" }
  }
];