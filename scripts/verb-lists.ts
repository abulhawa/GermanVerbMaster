// Common translations for German verbs
export const verbTranslations: Record<string, string> = {
  // Basic verbs (A1)
  "sein": "to be",
  "haben": "to have",
  "werden": "to become",
  "können": "can/to be able to",
  "müssen": "must/to have to",
  "gehen": "to go",
  "kommen": "to come",
  "wollen": "to want",
  "sollen": "should/ought to",
  "machen": "to make/do",
  "spielen": "to play",
  "lernen": "to learn",
  "leben": "to live",
  "arbeiten": "to work",
  "wohnen": "to live/reside",
  // Movement verbs (A1-A2)
  "laufen": "to run/walk",
  "fahren": "to drive/ride",
  "fliegen": "to fly",
  "reisen": "to travel",
  "springen": "to jump",
  "schwimmen": "to swim",
  "tanzen": "to dance",
  // Communication verbs (A1-A2)
  "sprechen": "to speak",
  "sagen": "to say",
  "fragen": "to ask",
  "antworten": "to answer",
  "rufen": "to call",
  "schreiben": "to write",
  // Daily activities (A1-A2)
  "essen": "to eat",
  "trinken": "to drink",
  "schlafen": "to sleep",
  "kochen": "to cook",
  "waschen": "to wash",
  "putzen": "to clean"
};

// Common irregular verb forms
export const irregularForms: Record<string, { präteritum: string; partizipII: string; auxiliary?: string }> = {
  // Basic irregular verbs
  "sein": { präteritum: "war", partizipII: "gewesen", auxiliary: "sein" },
  "haben": { präteritum: "hatte", partizipII: "gehabt" },
  "werden": { präteritum: "wurde", partizipII: "geworden", auxiliary: "sein" },
  // Modal verbs
  "können": { präteritum: "konnte", partizipII: "gekonnt" },
  "müssen": { präteritum: "musste", partizipII: "gemusst" },
  "wollen": { präteritum: "wollte", partizipII: "gewollt" },
  "sollen": { präteritum: "sollte", partizipII: "gesollt" },
  "dürfen": { präteritum: "durfte", partizipII: "gedurft" },
  "mögen": { präteritum: "mochte", partizipII: "gemocht" },
  // Strong verbs
  "gehen": { präteritum: "ging", partizipII: "gegangen", auxiliary: "sein" },
  "kommen": { präteritum: "kam", partizipII: "gekommen", auxiliary: "sein" },
  "sprechen": { präteritum: "sprach", partizipII: "gesprochen" },
  "essen": { präteritum: "aß", partizipII: "gegessen" },
  "trinken": { präteritum: "trank", partizipII: "getrunken" },
  "finden": { präteritum: "fand", partizipII: "gefunden" },
  "sehen": { präteritum: "sah", partizipII: "gesehen" },
  "lesen": { präteritum: "las", partizipII: "gelesen" }
};

// Common time expressions for different levels
export const timeExpressions = {
  A1: ["gestern", "heute", "jetzt"],
  A2: ["letzte Woche", "am Montag", "jeden Tag"],
  B1: ["vor einer Woche", "letzten Monat", "nächstes Jahr"],
  B2: ["vor kurzem", "neulich", "demnächst"]
};
