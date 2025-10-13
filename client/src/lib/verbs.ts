import { z } from 'zod';
import type { GermanVerb, CEFRLevel } from '@shared';

export type { GermanVerb };

const verbSchema = z.object({
  infinitive: z.string(),
  english: z.string(),
  präteritum: z.string(),
  partizipII: z.string(),
  auxiliary: z.enum(['haben', 'sein', 'haben / sein']),
  level: z.enum(['A1', 'A2', 'B1', 'B2', 'C1', 'C2']),
  präteritumExample: z.string(),
  partizipIIExample: z.string(),
  source: z.object({
    name: z.string(),
    levelReference: z.string(),
  }),
  pattern: z
    .object({
      type: z.string(),
      group: z.string().optional(),
    })
    .nullish(),
  praesensIch: z.string().nullish(),
  praesensEr: z.string().nullish(),
  perfekt: z.string().nullish(),
  separable: z.boolean().nullish(),
});

type VerbSchema = z.infer<typeof verbSchema>;

const seedVerbSchema = z.array(verbSchema);

const LEVELS: CEFRLevel[] = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'];

let seedCache: Promise<GermanVerb[]> | null = null;

function normaliseVerb(verb: VerbSchema): GermanVerb {
  return {
    ...verb,
    pattern: verb.pattern ?? null,
    praesensIch: verb.praesensIch ?? null,
    praesensEr: verb.praesensEr ?? null,
    perfekt: verb.perfekt ?? null,
    separable: verb.separable ?? null,
  };
}

async function fetchQuizVerbs(params: URLSearchParams): Promise<GermanVerb[]> {
  const url = params.toString();
  const response = await fetch(`/api/quiz/verbs${url ? `?${url}` : ''}`);
  if (!response.ok) {
    throw new Error(`Failed to fetch verbs: ${response.status}`);
  }
  const payload = await response.json();
  return z
    .array(verbSchema)
    .parse(payload)
    .map(normaliseVerb);
}

async function loadSeedVerbs(): Promise<GermanVerb[]> {
  if (!seedCache) {
    seedCache = (async () => {
      const response = await fetch('/verbs/verbs.seed.json');
      if (!response.ok) {
        throw new Error('Missing seed verb bundle');
      }
      const payload = await response.json();
      return seedVerbSchema.parse(payload).map(normaliseVerb);
    })();
  }
  return seedCache;
}

async function getSeedVerbsByLevel(level: CEFRLevel): Promise<GermanVerb[]> {
  const verbs = await loadSeedVerbs();
  return verbs.filter((verb) => verb.level === level);
}

async function getSeedVerb(level: CEFRLevel): Promise<GermanVerb | undefined> {
  const verbs = await getSeedVerbsByLevel(level);
  if (!verbs.length) return undefined;
  return verbs[Math.floor(Math.random() * verbs.length)];
}

async function fetchVerbsByLevel(level: CEFRLevel, limit?: number): Promise<GermanVerb[]> {
  const params = new URLSearchParams({ level });
  if (limit) {
    params.set('limit', String(limit));
  }
  return fetchQuizVerbs(params);
}

async function fetchRandomVerb(level: CEFRLevel): Promise<GermanVerb | undefined> {
  const params = new URLSearchParams({ level, random: '1', limit: '1' });
  const verbs = await fetchQuizVerbs(params);
  return verbs[0];
}

export const getRandomVerb = async (
  level: CEFRLevel,
  patternGroup?: string,
  options: { skipRemote?: boolean } = {},
): Promise<GermanVerb> => {
  const skipRemote = options.skipRemote ?? false;

  if (!skipRemote && !patternGroup) {
    try {
      const verb = await fetchRandomVerb(level);
      if (verb) {
        return verb;
      }
    } catch (error) {
      console.warn('Falling back to seed verbs for random verb:', error);
    }
  }

  const localVerb = await getSeedVerb(level);
  if (localVerb) {
    return localVerb;
  }

  const levelIndex = LEVELS.indexOf(level);
  if (levelIndex > 0) {
    return getRandomVerb(LEVELS[levelIndex - 1], patternGroup, { skipRemote: true });
  }

  throw new Error('No verbs available');
};

export const getVerbsByLevel = async (level: CEFRLevel): Promise<GermanVerb[]> => {
  try {
    return await fetchVerbsByLevel(level);
  } catch (error) {
    console.warn('Using seed verbs due to fetch error:', error);
    return getSeedVerbsByLevel(level);
  }
};

export const getVerbByInfinitive = async (
  infinitive: string,
): Promise<GermanVerb | undefined> => {
  const lower = infinitive.toLowerCase();
  try {
    const params = new URLSearchParams({ level: '', limit: '200' });
    const remote = await fetchQuizVerbs(params);
    const found = remote.find((verb) => verb.infinitive.toLowerCase() === lower);
    if (found) {
      return found;
    }
  } catch (error) {
    console.warn('Falling back to seed verbs for lookup:', error);
  }

  const seed = await loadSeedVerbs();
  return seed.find((verb) => verb.infinitive.toLowerCase() === lower);
};

export const getPatternGroups = async (_level: CEFRLevel): Promise<string[]> => {
  return [];
};
