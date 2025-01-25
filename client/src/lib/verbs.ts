import { z } from 'zod';

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
  // A1 Level - Essential verbs
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
    infinitive: "gehen",
    english: "to go",
    präteritum: "ging",
    partizipII: "gegangen",
    auxiliary: "sein",
    level: "A1",
    präteritumExample: "Sie ging zur Schule.",
    partizipIIExample: "Wir sind in den Park gegangen."
  },
  {
    infinitive: "kommen",
    english: "to come",
    präteritum: "kam",
    partizipII: "gekommen",
    auxiliary: "sein",
    level: "A1",
    präteritumExample: "Er kam spät nach Hause.",
    partizipIIExample: "Sie ist pünktlich gekommen."
  },
  {
    infinitive: "machen",
    english: "to make/do",
    präteritum: "machte",
    partizipII: "gemacht",
    auxiliary: "haben",
    level: "A1",
    präteritumExample: "Sie machte ihre Hausaufgaben.",
    partizipIIExample: "Ich habe einen Kuchen gemacht."
  },

  // A2 Level - Common everyday verbs
  {
    infinitive: "arbeiten",
    english: "to work",
    präteritum: "arbeitete",
    partizipII: "gearbeitet",
    auxiliary: "haben",
    level: "A2",
    präteritumExample: "Er arbeitete den ganzen Tag.",
    partizipIIExample: "Sie hat im Büro gearbeitet."
  },
  {
    infinitive: "spielen",
    english: "to play",
    präteritum: "spielte",
    partizipII: "gespielt",
    auxiliary: "haben",
    level: "A2",
    präteritumExample: "Das Kind spielte im Garten.",
    partizipIIExample: "Wir haben Fußball gespielt."
  },
  {
    infinitive: "lernen",
    english: "to learn",
    präteritum: "lernte",
    partizipII: "gelernt",
    auxiliary: "haben",
    level: "A2",
    präteritumExample: "Sie lernte Deutsch.",
    partizipIIExample: "Er hat viel gelernt."
  },

  // B1 Level - More complex verbs
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
    infinitive: "verstehen",
    english: "to understand",
    präteritum: "verstand",
    partizipII: "verstanden",
    auxiliary: "haben",
    level: "B1",
    präteritumExample: "Ich verstand die Frage nicht.",
    partizipIIExample: "Hast du alles verstanden?"
  },
  {
    infinitive: "vergessen",
    english: "to forget",
    präteritum: "vergaß",
    partizipII: "vergessen",
    auxiliary: "haben",
    level: "B1",
    präteritumExample: "Er vergaß seinen Schlüssel.",
    partizipIIExample: "Ich habe das Datum vergessen."
  },

  // B2 Level - Advanced verbs
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
    infinitive: "beschreiben",
    english: "to describe",
    präteritum: "beschrieb",
    partizipII: "beschrieben",
    auxiliary: "haben",
    level: "B2",
    präteritumExample: "Sie beschrieb das Ereignis genau.",
    partizipIIExample: "Er hat die Situation gut beschrieben."
  },
  {
    infinitive: "empfehlen",
    english: "to recommend",
    präteritum: "empfahl",
    partizipII: "empfohlen",
    auxiliary: "haben",
    level: "B2",
    präteritumExample: "Der Arzt empfahl eine Pause.",
    partizipIIExample: "Sie hat mir dieses Buch empfohlen."
  },

  // C1 Level - Sophisticated verbs
  {
    infinitive: "gelingen",
    english: "to succeed",
    präteritum: "gelang",
    partizipII: "gelungen",
    auxiliary: "sein",
    level: "C1",
    präteritumExample: "Es gelang ihr, den Test zu bestehen.",
    partizipIIExample: "Das Experiment ist endlich gelungen."
  },
  {
    infinitive: "beitragen",
    english: "to contribute",
    präteritum: "trug bei",
    partizipII: "beigetragen",
    auxiliary: "haben",
    level: "C1",
    präteritumExample: "Er trug wesentlich zum Erfolg bei.",
    partizipIIExample: "Sie hat viel zur Diskussion beigetragen."
  },
  {
    infinitive: "entsprechen",
    english: "to correspond/match",
    präteritum: "entsprach",
    partizipII: "entsprochen",
    auxiliary: "haben",
    level: "C1",
    präteritumExample: "Das Ergebnis entsprach den Erwartungen.",
    partizipIIExample: "Die Leistung hat den Anforderungen entsprochen."
  }
];

export const getRandomVerb = (level: 'A1' | 'A2' | 'B1' | 'B2' | 'C1'): GermanVerb => {
  const filteredVerbs = verbs.filter(verb => verb.level === level);
  return filteredVerbs[Math.floor(Math.random() * filteredVerbs.length)];
};