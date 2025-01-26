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
    type: 'ablaut' | 'mixed' | 'modal' | 'other';
    group?: string;
  };
}

// Get a random verb based on level and optionally pattern group
export const getRandomVerb = async (
  level: 'A1' | 'A2' | 'B1' | 'B2' | 'C1' | 'C2',
  patternGroup?: string
): Promise<GermanVerb> => {
  try {
    const params = new URLSearchParams();
    params.append('level', level);
    if (patternGroup) {
      params.append('pattern', patternGroup);
    }

    const response = await fetch(`/api/verbs?${params.toString()}`);
    if (!response.ok) {
      throw new Error('Failed to fetch verbs');
    }

    const verbs: GermanVerb[] = await response.json();
    if (verbs.length === 0) {
      // Fallback to previous level if no verbs found
      const levels: ('A1' | 'A2' | 'B1' | 'B2' | 'C1' | 'C2')[] = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'];
      const currentLevelIndex = levels.indexOf(level);
      if (currentLevelIndex > 0) {
        const previousLevel = levels[currentLevelIndex - 1];
        return getRandomVerb(previousLevel, patternGroup);
      }
      throw new Error('No verbs available');
    }

    return verbs[Math.floor(Math.random() * verbs.length)];
  } catch (error) {
    console.error('Error fetching random verb:', error);
    throw error;
  }
};

// Get a verb by infinitive
export const getVerbByInfinitive = async (infinitive: string): Promise<GermanVerb | undefined> => {
  try {
    const response = await fetch(`/api/verbs/${infinitive}`);
    if (!response.ok) {
      if (response.status === 404) {
        return undefined;
      }
      throw new Error('Failed to fetch verb');
    }
    return response.json();
  } catch (error) {
    console.error('Error fetching verb:', error);
    throw error;
  }
};

// Get all available pattern groups for a specific level
export const getPatternGroups = async (level: 'A1' | 'A2' | 'B1' | 'B2' | 'C1' | 'C2'): Promise<string[]> => {
  try {
    const verbs = await getVerbsByLevel(level);
    const groups = new Set<string>();
    verbs.forEach(verb => {
      if (verb.pattern?.group) {
        groups.add(verb.pattern.group);
      }
    });
    return Array.from(groups);
  } catch (error) {
    console.error('Error fetching pattern groups:', error);
    throw error;
  }
};

// Get all verbs for a specific level
export const getVerbsByLevel = async (level: 'A1' | 'A2' | 'B1' | 'B2' | 'C1' | 'C2'): Promise<GermanVerb[]> => {
  try {
    const response = await fetch(`/api/verbs?level=${level}`);
    if (!response.ok) {
      throw new Error('Failed to fetch verbs');
    }
    return response.json();
  } catch (error) {
    console.error('Error fetching verbs:', error);
    throw error;
  }
};