import { db } from "@db";
import { words } from "@db/schema";
import fetch from 'node-fetch';
import { and, eq } from 'drizzle-orm';

// Using German Wiktionary API with proper namespace handling
const DE_WIKTIONARY_API = 'https://de.wiktionary.org/w/api.php';
const EN_WIKTIONARY_API = 'https://en.wiktionary.org/w/api.php';

const VERB_CATEGORIES = [
  'Kategorie:Deutsche_Verben',
  'Kategorie:Regelmäßige_Verben_(Deutsch)',
  'Kategorie:Unregelmäßige_Verben_(Deutsch)',
  'Kategorie:Starke_Verben_(Deutsch)',
  'Kategorie:Schwache_Verben_(Deutsch)',
  'Kategorie:Modalverben_(Deutsch)'
];

// Verb translations and patterns from verb-lists.ts
import { verbTranslations, irregularForms } from './verb-lists';

interface WiktionaryResponse {
  query?: {
    categorymembers?: Array<{
      title: string;
      pageid: number;
    }>;
  };
  continue?: {
    cmcontinue: string;
  };
  error?: {
    code: string;
    info: string;
  };
}

async function fetchVerbList(category: string): Promise<string[]> {
  const verbs: string[] = [];
  let continueToken: string | undefined;

  // Try both German and English Wiktionary APIs
  const apiUrls = [DE_WIKTIONARY_API, EN_WIKTIONARY_API];
  let success = false;

  for (const apiUrl of apiUrls) {
    if (success) break;

    try {
      do {
        const params = new URLSearchParams({
          action: 'query',
          list: 'categorymembers',
          cmtitle: category,
          cmnamespace: '0', // Only get main namespace pages
          cmlimit: '500',
          format: 'json',
          formatversion: '2',
          origin: '*'
        });

        if (continueToken) {
          params.append('cmcontinue', continueToken);
        }

        console.log(`Fetching from ${apiUrl} - ${category}`);
        console.log('Full URL:', `${apiUrl}?${params.toString()}`);

        const response = await fetch(`${apiUrl}?${params.toString()}`, {
          headers: {
            'Accept': 'application/json',
            'User-Agent': 'GermanVerbLearner/1.0 (educational project; contacting for data collection)'
          }
        });

        const data = await response.json() as WiktionaryResponse;
        console.log('API Response Headers:', response.headers);
        console.log('API Response Status:', response.status);
        console.log('API Response Data:', JSON.stringify(data, null, 2));

        if (data.error) {
          console.error(`API Error for ${category}:`, data.error);
          break;
        }

        if (!data.query?.categorymembers) {
          console.log('No category members found in response');
          break;
        }

        // Extract and filter verbs
        const newVerbs = data.query.categorymembers
          .map(member => member.title.toLowerCase())
          .filter(verb => {
            const isVerb = verb.endsWith('en') && !verb.includes(' ') && !verb.includes('sich');
            if (!isVerb) {
              console.log(`Filtered out: ${verb}`);
            }
            return isVerb;
          });

        if (newVerbs.length > 0) {
          success = true;
          verbs.push(...newVerbs);
          console.log(`Found ${newVerbs.length} new verbs in ${category}`);
        }

        continueToken = data.continue?.cmcontinue;
        await new Promise(resolve => setTimeout(resolve, 1500)); // Increased delay

      } while (continueToken);

    } catch (error) {
      console.error(`Error fetching from ${apiUrl} for ${category}:`, error);
    }
  }

  console.log(`Total verbs found in ${category}: ${verbs.length}`);
  return verbs;
}

async function main() {
  try {
    console.log('Starting verb import process...');

    // Clear existing Wiktionary verbs
    await db
      .delete(words)
      .where(and(eq(words.pos, 'V'), eq(words.sourcesCsv, 'Wiktionary')));
    console.log('Cleared existing Wiktionary verbs');

    // Process categories sequentially
    const allVerbs: string[] = [];
    for (const category of VERB_CATEGORIES) {
      const categoryVerbs = await fetchVerbList(category);
      console.log(`Found ${categoryVerbs.length} verbs in ${category}`);
      allVerbs.push(...categoryVerbs);
      await new Promise(resolve => setTimeout(resolve, 2000));
    }

    // Deduplicate verbs
    const uniqueVerbs = [...new Set(allVerbs)];
    console.log(`Total unique verbs found: ${uniqueVerbs.length}`);

    // Process each verb
    let imported = 0;
    for (const verb of uniqueVerbs) {
      try {
        // Skip if already exists
        const existing = await db.query.words.findFirst({
          where: and(eq(words.lemma, verb), eq(words.pos, 'V')),
        });

        if (existing) {
          console.log(`Skipping existing verb: ${verb}`);
          continue;
        }

        // Get verb forms
        const präteritum = irregularForms[verb]?.präteritum ||
          `${verb.slice(0, -2)}te`; // Regular conjugation

        const partizipII = irregularForms[verb]?.partizipII ||
          `ge${verb.slice(0, -2)}t`; // Regular conjugation

        const auxiliary = irregularForms[verb]?.auxiliary || 'haben';

        await db.insert(words).values({
          lemma: verb,
          pos: 'V',
          english: verbTranslations[verb] || `to ${verb}`,
          praeteritum: präteritum,
          partizipIi: partizipII,
          aux: auxiliary,
          level: 'A2', // Default level
          examples: [
            { exampleDe: `Er ${präteritum} gestern.` },
            { exampleDe: `Sie ${auxiliary} heute ${partizipII}.` },
          ],
          approved: true,
          complete: false,
          sourcesCsv: 'Wiktionary',
          sourceNotes: 'Auto-imported from Wiktionary',
          posAttributes: irregularForms[verb]
            ? { tags: ['irregular', 'strong verbs'] }
            : null,
        });

        imported++;
        if (imported % 10 === 0) {
          console.log(`Imported ${imported} verbs...`);
        }
      } catch (error) {
        console.error(`Error importing verb ${verb}:`, error);
      }
    }

    console.log(`Successfully imported ${imported} verbs`);
  } catch (error) {
    console.error('Error in main process:', error);
  }
}

// Run the import
main().catch(console.error);