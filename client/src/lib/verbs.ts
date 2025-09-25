import { z } from 'zod';
import type { GermanVerb, CEFRLevel } from '@shared';
import localVerbsRaw from '@assets/verbs.json';

export type { GermanVerb };

const patternSchema = z
  .object({
    type: z.string(),
    group: z.string().optional(),
  })
  .nullish();

const verbSchema = z.object({
  infinitive: z.string(),
  english: z.string(),
  präteritum: z.string(),
  partizipII: z.string(),
  auxiliary: z.enum(['haben', 'sein']),
  level: z.enum(['A1', 'A2', 'B1', 'B2', 'C1', 'C2']),
  präteritumExample: z.string(),
  partizipIIExample: z.string(),
  source: z.object({
    name: z.string(),
    levelReference: z.string(),
  }),
  pattern: patternSchema,
});

type VerbSchema = z.infer<typeof verbSchema>;

const LEVELS: CEFRLevel[] = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'];

function normaliseVerb(verb: VerbSchema): GermanVerb {
  return {
    ...verb,
    pattern: verb.pattern ?? undefined,
  };
}

const localVerbs: GermanVerb[] = z
  .array(verbSchema)
  .parse(localVerbsRaw)
  .map(normaliseVerb);

async function fetchVerbsFromApi(url: string): Promise<GermanVerb[]> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch verbs: ${response.status}`);
  }

  const payload = await response.json();
  return z
    .array(verbSchema)
    .parse(payload)
    .map(normaliseVerb);
}

function filterLocalVerbs(level: CEFRLevel, patternGroup?: string): GermanVerb[] {
  return localVerbs.filter((verb) => {
    if (verb.level !== level) return false;
    if (!patternGroup) return true;
    return verb.pattern?.group === patternGroup;
  });
}

function fallbackRandomVerb(level: CEFRLevel, patternGroup?: string): GermanVerb | undefined {
  const verbs = filterLocalVerbs(level, patternGroup);
  if (!verbs.length) return undefined;
  return verbs[Math.floor(Math.random() * verbs.length)];
}

// Get a random verb based on level and optionally pattern group
export const getRandomVerb = async (
  level: CEFRLevel,
  patternGroup?: string,
  options: { skipRemote?: boolean } = {}
): Promise<GermanVerb> => {
  const params = new URLSearchParams({ level });
  if (patternGroup) {
    params.append('pattern', patternGroup);
  }

  let verbs: GermanVerb[] = [];
  let skipRemote = options.skipRemote ?? false;

  if (!skipRemote) {
    try {
      verbs = await fetchVerbsFromApi(`/api/verbs?${params.toString()}`);
    } catch (error) {
      console.warn('Falling back to local verbs for random verb:', error);
      skipRemote = true;
    }
  }

  if (!verbs.length) {
    const fallbackVerb = fallbackRandomVerb(level, patternGroup);
    if (fallbackVerb) {
      return fallbackVerb;
    }
  } else {
    return verbs[Math.floor(Math.random() * verbs.length)];
  }

  const currentLevelIndex = LEVELS.indexOf(level);
  if (currentLevelIndex > 0) {
    const previousLevel = LEVELS[currentLevelIndex - 1];
    return getRandomVerb(previousLevel, patternGroup, { skipRemote });
  }

  throw new Error('No verbs available');
};

// Get a verb by infinitive
export const getVerbByInfinitive = async (
  infinitive: string
): Promise<GermanVerb | undefined> => {
  try {
    const response = await fetch(`/api/verbs/${encodeURIComponent(infinitive)}`);
    if (!response.ok) {
      if (response.status === 404) {
        return localVerbs.find((verb) => verb.infinitive === infinitive);
      }
      throw new Error('Failed to fetch verb');
    }
    const payload = await response.json();
    return normaliseVerb(verbSchema.parse(payload));
  } catch (error) {
    console.warn('Using local verb data due to fetch error:', error);
    return localVerbs.find((verb) => verb.infinitive === infinitive);
  }
};

// Get all available pattern groups for a specific level
export const getPatternGroups = async (level: CEFRLevel): Promise<string[]> => {
  const verbs = await getVerbsByLevel(level);
  const groups = new Set<string>();
  verbs.forEach((verb) => {
    if (verb.pattern?.group) {
      groups.add(verb.pattern.group);
    }
  });
  return Array.from(groups);
};

// Get all verbs for a specific level
export const getVerbsByLevel = async (level: CEFRLevel): Promise<GermanVerb[]> => {
  try {
    return await fetchVerbsFromApi(`/api/verbs?level=${level}`);
  } catch (error) {
    console.warn('Falling back to local verb list for level', level, error);
    return filterLocalVerbs(level);
  }
};