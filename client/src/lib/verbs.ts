export interface GermanVerb {
  infinitive: string;
  english: string;
  präteritum: string;
  partizipII: string;
  auxiliary: 'haben' | 'sein';
  level: 'A1' | 'A2' | 'B1' | 'B2' | 'C1';
  präteritumExample: string;
  partizipIIExample: string;
}

export const verbs: GermanVerb[] = [
  {
    infinitive: "sein",
    english: "to be",
    präteritum: "war",
    partizipII: "gewesen",
    auxiliary: "sein",
    level: "A1",
    präteritumExample: "Gestern war ich im Kino.",
    partizipIIExample: "Ich bin lange in Berlin gewesen."
  },
  {
    infinitive: "haben",
    english: "to have",
    präteritum: "hatte",
    partizipII: "gehabt",
    auxiliary: "haben",
    level: "A1",
    präteritumExample: "Er hatte keine Zeit.",
    partizipIIExample: "Wir haben viel Spaß gehabt."
  },
  {
    infinitive: "werden",
    english: "to become",
    präteritum: "wurde",
    partizipII: "geworden",
    auxiliary: "sein",
    level: "B1",
    präteritumExample: "Sie wurde Ärztin.",
    partizipIIExample: "Er ist Lehrer geworden."
  },
  {
    infinitive: "verschwinden",
    english: "to disappear",
    präteritum: "verschwand",
    partizipII: "verschwunden",
    auxiliary: "sein",
    level: "B2",
    präteritumExample: "Der Schlüssel verschwand spurlos.",
    partizipIIExample: "Das Geld ist plötzlich verschwunden."
  },
  {
    infinitive: "gelingen",
    english: "to succeed",
    präteritum: "gelang",
    partizipII: "gelungen",
    auxiliary: "sein",
    level: "C1",
    präteritumExample: "Es gelang ihr, den Test zu bestehen.",
    partizipIIExample: "Das Experiment ist endlich gelungen."
  }
];

export const getRandomVerb = (level: 'A1' | 'A2' | 'B1' | 'B2' | 'C1'): GermanVerb => {
  const filteredVerbs = verbs.filter(verb => verb.level === level);
  return filteredVerbs[Math.floor(Math.random() * filteredVerbs.length)];
};