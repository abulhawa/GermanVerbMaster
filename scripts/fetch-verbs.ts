import { z } from 'zod';
import { db } from "@db";
import { verbs } from "@db/schema";
import fetch from 'node-fetch';
import { sql } from 'drizzle-orm';

const WIKTIONARY_API_BASE = 'https://de.wiktionary.org/w/api.php';
const VERB_CATEGORIES = [
  'Kategorie:Starke_Verben_(Deutsch)',
  'Kategorie:Schwache_Verben_(Deutsch)',
  'Kategorie:Unregelmäßige_Verben_(Deutsch)',
  'Kategorie:Modalverben_(Deutsch)'
];

interface WiktionaryResponse {
  query: {
    categorymembers: Array<{
      title: string;
      pageid: number;
    }>;
  };
}

// Translations map for common German verbs
const verbTranslations: Record<string, string> = {
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
  "putzen": "to clean",
  // Common B1 verbs
  "versprechen": "to promise",
  "verstehen": "to understand",
  "vergessen": "to forget",
  "verlassen": "to leave",
  "verbinden": "to connect",
  "erklären": "to explain",
  "erzählen": "to tell",
  "empfehlen": "to recommend",
  // Common action verbs
  "sehen": "to see",
  "hören": "to hear",
  "finden": "to find",
  "suchen": "to search",
  "denken": "to think",
  "glauben": "to believe",
  "wissen": "to know",
  "kennen": "to know/be familiar with",
};

// Common irregular verb forms
const irregularForms: Record<string, { präteritum: string, partizipII: string, auxiliary?: string }> = {
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
  "lesen": { präteritum: "las", partizipII: "gelesen" },
  // Movement verbs
  "laufen": { präteritum: "lief", partizipII: "gelaufen", auxiliary: "sein" },
  "fahren": { präteritum: "fuhr", partizipII: "gefahren", auxiliary: "sein" },
  "fliegen": { präteritum: "flog", partizipII: "geflogen", auxiliary: "sein" },
  "springen": { präteritum: "sprang", partizipII: "gesprungen", auxiliary: "sein" },
  "schwimmen": { präteritum: "schwamm", partizipII: "geschwommen", auxiliary: "sein" },
  // More common irregular verbs
  "schreiben": { präteritum: "schrieb", partizipII: "geschrieben" },
  "bleiben": { präteritum: "blieb", partizipII: "geblieben", auxiliary: "sein" },
  "stehen": { präteritum: "stand", partizipII: "gestanden" },
  "verstehen": { präteritum: "verstand", partizipII: "verstanden" },
  "beginnen": { präteritum: "begann", partizipII: "begonnen" },
  "denken": { präteritum: "dachte", partizipII: "gedacht" },
  "bringen": { präteritum: "brachte", partizipII: "gebracht" },
  "tun": { präteritum: "tat", partizipII: "getan" },
  "wissen": { präteritum: "wusste", partizipII: "gewusst" },
  "nehmen": { präteritum: "nahm", partizipII: "genommen" },
  "geben": { präteritum: "gab", partizipII: "gegeben" },
  "liegen": { präteritum: "lag", partizipII: "gelegen" },
  "sitzen": { präteritum: "saß", partizipII: "gesessen" },
};

// Common objects for example sentences
const commonObjects = {
  essen: ["einen Apfel", "eine Pizza", "ein Sandwich", "das Mittagessen"],
  trinken: ["Wasser", "Kaffee", "Tee", "ein Glas Wein"],
  lesen: ["ein Buch", "die Zeitung", "einen Brief", "einen Artikel"],
  schreiben: ["einen Brief", "eine E-Mail", "einen Text", "einen Bericht"],
  sehen: ["einen Film", "das Fernsehen", "ein Bild", "die Nachrichten"],
  hören: ["Musik", "Radio", "ein Lied", "die Nachrichten"],
  kaufen: ["ein Auto", "Lebensmittel", "neue Schuhe", "ein Geschenk"],
  default: ["", "es", "das"]
};

// Common time expressions for different levels
const timeExpressions = {
  A1: ["gestern", "heute", "jetzt"],
  A2: ["letzte Woche", "am Montag", "jeden Tag"],
  B1: ["vor einer Woche", "letzten Monat", "nächstes Jahr"],
  B2: ["vor kurzem", "neulich", "demnächst"],
};

function generateExampleSentence(verb: string, form: 'präteritum' | 'partizipII', tense: string, level: string): string {
  const subjects = ['Er', 'Sie', 'Ich', 'Wir', 'Der Mann', 'Die Frau'];
  const subject = subjects[Math.floor(Math.random() * subjects.length)];
  const timeExpression = timeExpressions[level as keyof typeof timeExpressions]?.[0] || "gestern";
  const objects = commonObjects[verb as keyof typeof commonObjects] || commonObjects.default;
  const object = objects[Math.floor(Math.random() * objects.length)];

  if (form === 'präteritum') {
    return `${subject} ${tense} ${object} ${timeExpression}.`.trim();
  } else {
    const auxiliary = irregularForms[verb]?.auxiliary || 'haben';
    return `${subject} ${auxiliary} ${object} ${timeExpression} ${tense}.`.trim();
  }
}

function determineVerbLevel(verb: string, frequency: number): 'A1' | 'A2' | 'B1' | 'B2' | 'C1' | 'C2' {
  // Common A1 verbs
  const a1Verbs = [
    "sein", "haben", "werden", "können", "müssen",
    "gehen", "kommen", "machen", "sprechen", "essen",
    "trinken", "schlafen", "wohnen", "arbeiten", "spielen",
    "lernen", "hören", "sehen", "leben"
  ];

  // Common A2 verbs
  const a2Verbs = [
    "laufen", "fahren", "fliegen", "schwimmen", "tanzen",
    "kochen", "waschen", "putzen", "suchen", "finden",
    "sagen", "fragen", "antworten", "schreiben", "lesen"
  ];

  // Common B1 verbs
  const b1Verbs = [
    "versprechen", "verstehen", "vergessen", "verlassen",
    "verbinden", "erklären", "erzählen", "empfehlen",
    "beginnen", "glauben", "denken", "wissen"
  ];

  if (a1Verbs.includes(verb)) return 'A1';
  if (a2Verbs.includes(verb)) return 'A2';
  if (b1Verbs.includes(verb)) return 'B1';

  // Check for compound verbs (generally higher level)
  const prefixes = ['ab', 'an', 'auf', 'aus', 'bei', 'ein', 'mit', 'vor', 'zu', 'ver', 'zer', 'er', 'ent'];
  const isCompound = prefixes.some(prefix => verb.startsWith(prefix));

  if (isCompound) {
    const baseVerb = verb.slice(2); // Remove prefix
    if (a1Verbs.includes(baseVerb)) return 'A2';
    if (a2Verbs.includes(baseVerb)) return 'B1';
    return frequency < 500 ? 'B1' : 'B2';
  }

  // Base level on frequency and complexity
  if (frequency < 100) return 'A1';
  if (frequency < 300) return 'A2';
  if (frequency < 600) return 'B1';
  if (frequency < 1000) return 'B2';
  if (frequency < 2000) return 'C1';
  return 'C2';
}

// Function to detect verb patterns
function detectVerbPattern(infinitive: string, präteritum: string, partizipII: string): { type: string, group?: string } {
  const stripPrefix = (verb: string) => {
    const prefixes = ['ab', 'an', 'auf', 'aus', 'bei', 'ein', 'mit', 'vor', 'zu', 'ver', 'zer', 'er', 'ent'];
    for (const prefix of prefixes) {
      if (verb.startsWith(prefix)) {
        return verb.slice(prefix.length);
      }
    }
    return verb;
  };

  const baseInfinitive = stripPrefix(infinitive);
  const basePräteritum = stripPrefix(präteritum);
  const basePartizipII = stripPrefix(partizipII.replace(/^ge/, '')); // Remove ge- prefix

  // Modal verbs
  if (["können", "müssen", "sollen", "wollen", "dürfen", "mögen"].includes(infinitive)) {
    return { type: "modal", group: "modal verbs" };
  }

  // Common ablaut patterns
  const ablautPatterns = [
    { pattern: /e.*->a.*->o.*/, type: "ablaut", group: "e -> a -> o" },
    { pattern: /ei.*->ie.*->ie.*/, type: "ablaut", group: "ei -> ie -> ie" },
    { pattern: /i.*->a.*->u.*/, type: "ablaut", group: "i -> a -> u" },
    { pattern: /e.*->a.*->e.*/, type: "ablaut", group: "e -> a -> e" },
    { pattern: /a.*->ie.*->a.*/, type: "ablaut", group: "a -> ie -> a" },
    { pattern: /e.*->o.*->o.*/, type: "ablaut", group: "e -> o -> o" },
  ];

  const verbForms = `${baseInfinitive}->${basePräteritum}->${basePartizipII}`;
  for (const { pattern, type, group } of ablautPatterns) {
    if (pattern.test(verbForms)) {
      return { type, group };
    }
  }

  // Mixed verbs (typically with -te ending in präteritum but irregular partizip II)
  if (präteritum.endsWith('te') && !partizipII.endsWith('t')) {
    return { type: "mixed", group: "mixed conjugation" };
  }

  return { type: "regular" };
}

async function processVerb(verb: string, frequency: number) {
  try {
    // Skip reflexive verbs and multi-word entries
    if (verb.includes(' ') || verb.includes('sich')) {
      return;
    }

    // Skip very rare or specialized compound verbs
    const isRareCompound = verb.length > 12;
    if (isRareCompound) {
      return;
    }

    const infinitive = verb;
    let präteritum = "";
    let partizipII = "";
    let auxiliary = "haben";

    // Check for known irregular forms first
    if (irregularForms[verb]) {
      ({ präteritum, partizipII } = irregularForms[verb]);
      if (irregularForms[verb].auxiliary) {
        auxiliary = irregularForms[verb].auxiliary;
      }
    } else if (verb.endsWith('en')) {
      // Handle regular and compound verbs
      const stem = verb.slice(0, -2);
      const prefixes = ['ab', 'an', 'auf', 'aus', 'bei', 'ein', 'mit', 'vor', 'zu', 'ver', 'zer', 'er', 'ent'];
      const prefix = prefixes.find(p => verb.startsWith(p));

      if (prefix) {
        // For compound verbs, check if the base verb is irregular
        const baseVerb = verb.slice(prefix.length);
        if (irregularForms[baseVerb]) {
          const base = irregularForms[baseVerb];
          präteritum = prefix + base.präteritum;
          partizipII = prefix + base.partizipII;
          if (base.auxiliary) auxiliary = base.auxiliary;
        } else {
          präteritum = stem + "te";
          partizipII = prefix.startsWith('be') || prefix.startsWith('ge') || prefix.startsWith('er') ||
            prefix.startsWith('ver') || prefix.startsWith('zer') || prefix.startsWith('ent')
            ? stem + 't'  // No 'ge-' prefix for these verbs
            : 'ge' + stem + 't';
        }
      } else {
        // Regular verb conjugation
        präteritum = stem + "te";
        partizipII = "ge" + stem + "t";
      }
    }

    const pattern = detectVerbPattern(infinitive, präteritum, partizipII);
    const level = determineVerbLevel(verb, frequency);

    // Get translation or create a meaningful one for compound verbs
    let english = verbTranslations[verb];
    if (!english && verb.length > 2) {
      const prefix = Object.keys(verbTranslations).find(p => verb.startsWith(p));
      if (prefix) {
        const baseVerb = verb.slice(prefix.length);
        const baseTranslation = verbTranslations[baseVerb];
        if (baseTranslation) {
          english = `to ${prefix}-${baseTranslation.slice(3)}`; // Remove "to " from base translation
        }
      }
      if (!english) {
        english = `to ${verb}`; // Fallback
      }
    }

    // Generate example sentences
    const präteritumExample = generateExampleSentence(verb, 'präteritum', präteritum, level);
    const partizipIIExample = generateExampleSentence(verb, 'partizipII', partizipII, level);

    await db.insert(verbs).values({
      infinitive: verb,
      english: english || `to ${verb}`,
      präteritum,
      partizipII,
      auxiliary,
      level,
      präteritumExample,
      partizipIIExample,
      source: {
        name: "Wiktionary",
        levelReference: "Automatically categorized"
      },
      pattern: pattern.type !== "regular" ? pattern : null,
    }).onConflictDoNothing();

    console.log(`Successfully processed verb: ${verb}`);
  } catch (error) {
    console.error(`Error processing verb ${verb}:`, error);
  }
}

async function fetchVerbList(category: string): Promise<string[]> {
  const params = new URLSearchParams({
    action: 'query',
    list: 'categorymembers',
    cmtitle: category,
    cmlimit: '500',
    format: 'json',
    origin: '*',
    // Add proper formatting and continue parameters
    formatversion: '2',
    continue: ''
  });

  try {
    const response = await fetch(`${WIKTIONARY_API_BASE}?${params.toString()}`);
    if (!response.ok) {
      console.error(`Failed to fetch verbs from ${category}: ${response.status} ${response.statusText}`);
      return [];
    }

    const data = await response.json() as WiktionaryResponse;
    const verbs = data.query.categorymembers
      .map(member => member.title.toLowerCase())
      .filter(verb => {
        // Filter out multi-word entries and reflexive verbs
        if (verb.includes(' ') || verb.includes('sich')) return false;
        // Filter out verbs that are too long (likely very specialized)
        if (verb.length > 12) return false;
        // Must end with 'en' or 'n'
        if (!verb.endsWith('en') && !verb.endsWith('n')) return false;
        return true;
      });

    console.log(`Successfully fetched ${verbs.length} verbs from ${category}`);
    return verbs;
  } catch (error) {
    console.error(`Error fetching verb list for ${category}:`, error);
    return [];
  }
}

async function main() {
  try {
    console.log('Starting verb fetching process...');

    // Clear existing auto-generated verbs but keep manually curated ones
    await db.delete(verbs).where(sql`source->>'name' = 'Wiktionary'`);
    console.log('Cleared existing auto-generated verbs');

    for (const category of VERB_CATEGORIES) {
      const verbs = await fetchVerbList(category);
      console.log(`Found ${verbs.length} verbs in ${category}`);

      for (const [index, verb] of verbs.entries()) {
        // Use verb length and common prefixes to estimate frequency
        const frequency = Math.max(100, 2000 - (verb.length * 100));
        await processVerb(verb, frequency);
        console.log(`Processed ${index + 1}/${verbs.length} verbs from ${category}`);
      }
    }

    console.log('Completed verb fetching process');
  } catch (error) {
    console.error('Error in main process:', error);
  }
}

// Run the script
main().catch(console.error);