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
  {
    infinitive: "heißen",
    english: "to be called",
    präteritum: "hieß",
    partizipII: "geheißen",
    auxiliary: "haben",
    level: "A1",
    präteritumExample: "Er hieß Peter.",
    partizipIIExample: "Sie hat schon immer so geheißen."
  },
  {
    infinitive: "sprechen",
    english: "to speak",
    präteritum: "sprach",
    partizipII: "gesprochen",
    auxiliary: "haben",
    level: "A1",
    präteritumExample: "Er sprach sehr gut Deutsch.",
    partizipIIExample: "Wir haben viel Englisch gesprochen."
  },
  {
    infinitive: "sehen",
    english: "to see",
    präteritum: "sah",
    partizipII: "gesehen",
    auxiliary: "haben",
    level: "A1",
    präteritumExample: "Ich sah einen Film.",
    partizipIIExample: "Hast du das neue Auto gesehen?"
  },
  {
    infinitive: "essen",
    english: "to eat",
    präteritum: "aß",
    partizipII: "gegessen",
    auxiliary: "haben",
    level: "A1",
    präteritumExample: "Er aß eine Pizza.",
    partizipIIExample: "Wir haben schon gegessen."
  },
  // A2 Level - Common verbs
  {
    infinitive: "anfangen",
    english: "to begin",
    präteritum: "fing an",
    partizipII: "angefangen",
    auxiliary: "haben",
    level: "A2",
    präteritumExample: "Der Film fing um 20 Uhr an.",
    partizipIIExample: "Das Semester hat bereits angefangen."
  },
  {
    infinitive: "ankommen",
    english: "to arrive",
    präteritum: "kam an",
    partizipII: "angekommen",
    auxiliary: "sein",
    level: "A2",
    präteritumExample: "Der Zug kam pünktlich an.",
    partizipIIExample: "Wir sind gerade angekommen."
  },
  {
    infinitive: "anrufen",
    english: "to call",
    präteritum: "rief an",
    partizipII: "angerufen",
    auxiliary: "haben",
    level: "A2",
    präteritumExample: "Sie rief ihre Mutter an.",
    partizipIIExample: "Er hat dreimal angerufen."
  },
  // B1 Level - Intermediate verbs
  {
    infinitive: "abfahren",
    english: "to depart",
    präteritum: "fuhr ab",
    partizipII: "abgefahren",
    auxiliary: "sein",
    level: "B1",
    präteritumExample: "Der Bus fuhr pünktlich ab.",
    partizipIIExample: "Der Zug ist bereits abgefahren."
  },
  {
    infinitive: "beschreiben",
    english: "to describe",
    präteritum: "beschrieb",
    partizipII: "beschrieben",
    auxiliary: "haben",
    level: "B1",
    präteritumExample: "Er beschrieb das Problem genau.",
    partizipIIExample: "Sie hat die Situation gut beschrieben."
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
  // B2 Level - Advanced verbs
  {
    infinitive: "übertragen",
    english: "to transfer/transmit",
    präteritum: "übertrug",
    partizipII: "übertragen",
    auxiliary: "haben",
    level: "B2",
    präteritumExample: "Er übertrug die Verantwortung an seinen Kollegen.",
    partizipIIExample: "Die Krankheit hat sich schnell übertragen."
  },
  {
    infinitive: "unternehmen",
    english: "to undertake",
    präteritum: "unternahm",
    partizipII: "unternommen",
    auxiliary: "haben",
    level: "B2",
    präteritumExample: "Sie unternahm eine lange Reise.",
    partizipIIExample: "Was hast du am Wochenende unternommen?"
  },
  // C1 Level - Advanced verbs
  {
    infinitive: "entsprechen",
    english: "to correspond",
    präteritum: "entsprach",
    partizipII: "entsprochen",
    auxiliary: "haben",
    level: "C1",
    präteritumExample: "Das Ergebnis entsprach den Erwartungen.",
    partizipIIExample: "Die Leistung hat den Anforderungen entsprochen."
  },
  {
    infinitive: "unterschreiben",
    english: "to sign",
    präteritum: "unterschrieb",
    partizipII: "unterschrieben",
    auxiliary: "haben",
    level: "C1",
    präteritumExample: "Er unterschrieb den Vertrag sofort.",
    partizipIIExample: "Sie hat alle Dokumente unterschrieben."
  }
  // More verbs can be added following the same pattern
];

export const getRandomVerb = (level: 'A1' | 'A2' | 'B1' | 'B2' | 'C1'): GermanVerb => {
  const filteredVerbs = verbs.filter(verb => verb.level === level);
  return filteredVerbs[Math.floor(Math.random() * filteredVerbs.length)];
};