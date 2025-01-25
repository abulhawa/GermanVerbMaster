export interface GermanVerb {
  infinitive: string;
  english: string;
  präteritum: string;
  partizipII: string;
  auxiliary: 'haben' | 'sein';
  level: 'A1' | 'A2';
  example: string;
}

export const verbs: GermanVerb[] = [
  {
    infinitive: "sein",
    english: "to be",
    präteritum: "war",
    partizipII: "gewesen",
    auxiliary: "sein",
    level: "A1",
    example: "Ich bin gestern zu Hause gewesen."
  },
  {
    infinitive: "haben",
    english: "to have",
    präteritum: "hatte",
    partizipII: "gehabt",
    auxiliary: "haben",
    level: "A1",
    example: "Ich habe einen Hund gehabt."
  },
  {
    infinitive: "gehen",
    english: "to go",
    präteritum: "ging",
    partizipII: "gegangen",
    auxiliary: "sein",
    level: "A1",
    example: "Er ist in die Stadt gegangen."
  },
  // Add more verbs as needed
];

export const getRandomVerb = (level: 'A1' | 'A2'): GermanVerb => {
  const filteredVerbs = verbs.filter(verb => verb.level === level);
  return filteredVerbs[Math.floor(Math.random() * filteredVerbs.length)];
};
