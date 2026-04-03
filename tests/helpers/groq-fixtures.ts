import Groq from "groq-sdk";

export interface GeneratedVerb {
  lemma: string;
  level: string;
  english: string;
  aux: "haben" | "sein";
  separable: boolean;
  praesensIch: string;
  praesensEr: string;
  praeteritum: string;
  partizipIi: string;
  perfekt: string;
  exampleDe: string;
  exampleEn: string;
}

let cachedVerbs: GeneratedVerb[] | null = null;

function normaliseGeneratedVerbs(input: unknown): GeneratedVerb[] {
  if (!Array.isArray(input)) {
    return [];
  }

  const verbs: GeneratedVerb[] = [];
  for (const candidate of input) {
    if (!candidate || typeof candidate !== "object") {
      continue;
    }

    const value = candidate as Record<string, unknown>;
    const auxValue = value.aux === "sein" ? "sein" : value.aux === "haben" ? "haben" : null;
    if (!auxValue) {
      continue;
    }

    const requiredStrings: Array<keyof GeneratedVerb> = [
      "lemma",
      "level",
      "english",
      "praesensIch",
      "praesensEr",
      "praeteritum",
      "partizipIi",
      "perfekt",
      "exampleDe",
      "exampleEn",
    ];

    const hasAllStrings = requiredStrings.every((key) => {
      const candidateValue = value[key];
      return typeof candidateValue === "string" && candidateValue.trim().length > 0;
    });

    if (!hasAllStrings || typeof value.separable !== "boolean") {
      continue;
    }

    verbs.push({
      lemma: String(value.lemma).trim(),
      level: String(value.level).trim(),
      english: String(value.english).trim(),
      aux: auxValue,
      separable: value.separable,
      praesensIch: String(value.praesensIch).trim(),
      praesensEr: String(value.praesensEr).trim(),
      praeteritum: String(value.praeteritum).trim(),
      partizipIi: String(value.partizipIi).trim(),
      perfekt: String(value.perfekt).trim(),
      exampleDe: String(value.exampleDe).trim(),
      exampleEn: String(value.exampleEn).trim(),
    } satisfies GeneratedVerb);
  }

  return verbs;
}

export async function getTestVerbs(count = 5): Promise<GeneratedVerb[]> {
  if (cachedVerbs && cachedVerbs.length >= count) {
    return cachedVerbs.slice(0, count);
  }

  if (!process.env.TEST_USE_GROQ || !process.env.GROQ_API_KEY) {
    return STATIC_TEST_VERBS.slice(0, count);
  }

  try {
    const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
    const response = await groq.chat.completions.create({
      model: "llama-3.3-70b-versatile",
      max_tokens: 800,
      temperature: 0,
      messages: [
        {
          role: "system",
          content:
            "You generate German verb test data. Respond ONLY with a JSON array, no markdown.",
        },
        {
          role: "user",
          content: `Generate ${count} German verbs for language learning tests.
        Each must be a real, common German verb with all conjugation forms.
        Mix: regular verbs, irregular verbs, separable verbs, sein-verbs.
        Mix CEFR levels A1-B2. Return JSON array with this shape per item:
        { lemma, level, english, aux, separable, praesensIch, praesensEr,
          praeteritum, partizipIi, perfekt, exampleDe, exampleEn }`,
        },
      ],
    });

    const text = response.choices[0]?.message?.content ?? "[]";
    const parsed = JSON.parse(text.replace(/```json|```/gi, "").trim());
    const normalized = normaliseGeneratedVerbs(parsed);
    if (!normalized.length) {
      return STATIC_TEST_VERBS.slice(0, count);
    }

    cachedVerbs = normalized;
    return normalized.slice(0, count);
  } catch {
    return STATIC_TEST_VERBS.slice(0, count);
  }
}

export const STATIC_TEST_VERBS: GeneratedVerb[] = [
  {
    lemma: "machen",
    level: "A1",
    english: "to make/do",
    aux: "haben",
    separable: false,
    praesensIch: "mache",
    praesensEr: "macht",
    praeteritum: "machte",
    partizipIi: "gemacht",
    perfekt: "hat gemacht",
    exampleDe: "Ich mache meine Hausaufgaben.",
    exampleEn: "I do my homework.",
  },
  {
    lemma: "gehen",
    level: "A1",
    english: "to go",
    aux: "sein",
    separable: false,
    praesensIch: "gehe",
    praesensEr: "geht",
    praeteritum: "ging",
    partizipIi: "gegangen",
    perfekt: "ist gegangen",
    exampleDe: "Er geht nach Hause.",
    exampleEn: "He goes home.",
  },
  {
    lemma: "anfangen",
    level: "A2",
    english: "to start/begin",
    aux: "haben",
    separable: true,
    praesensIch: "fange an",
    praesensEr: "fängt an",
    praeteritum: "fing an",
    partizipIi: "angefangen",
    perfekt: "hat angefangen",
    exampleDe: "Wann fängst du an?",
    exampleEn: "When do you start?",
  },
  {
    lemma: "werden",
    level: "A2",
    english: "to become",
    aux: "sein",
    separable: false,
    praesensIch: "werde",
    praesensEr: "wird",
    praeteritum: "wurde",
    partizipIi: "geworden",
    perfekt: "ist geworden",
    exampleDe: "Er wird Arzt.",
    exampleEn: "He is becoming a doctor.",
  },
  {
    lemma: "vorschlagen",
    level: "B1",
    english: "to suggest/propose",
    aux: "haben",
    separable: true,
    praesensIch: "schlage vor",
    praesensEr: "schlägt vor",
    praeteritum: "schlug vor",
    partizipIi: "vorgeschlagen",
    perfekt: "hat vorgeschlagen",
    exampleDe: "Ich schlage vor, dass wir anfangen.",
    exampleEn: "I suggest we start.",
  },
];

