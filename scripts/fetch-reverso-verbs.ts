import { writeFile } from 'fs/promises';
import { db } from "@db";
import { words } from "@db/schema";
import { spawn } from 'child_process';
import { and, eq } from 'drizzle-orm';

// Python script to fetch verbs using Reverso API
const PYTHON_SCRIPT = `
from reverso_api.context import ReversoContextAPI
from reverso_api.conjugation import ReversoConjugation
import json
import sys
import time

def get_verb_details(verb):
    try:
        # Initialize Reverso conjugation
        conjugator = ReversoConjugation()
        
        # Get conjugations
        conjugations = conjugator.get_conjugation(verb, "de")
        
        # Get English translation using context API
        context_api = ReversoContextAPI("de", "en")
        translations = context_api.get_translations(verb)
        english = translations[0] if translations else f"to {verb}"
        
        # Extract required forms
        prateritum = conjugations.get("Indikativ Präteritum", {}).get("ich", "")
        partizip = conjugations.get("Indikativ Perfekt", {}).get("ich", "")
        
        if partizip:
            # Extract Partizip II from perfect tense
            partizip = partizip.split()[-1]
            # Determine auxiliary from perfect tense
            auxiliary = "sein" if "bin" in partizip else "haben"
        else:
            auxiliary = "haben"  # default
        
        # Basic example sentences
        prateritum_example = f"Ich {prateritum} gestern."
        partizip_example = f"Ich {auxiliary} heute {partizip}."
        
        # Determine if verb is irregular
        is_irregular = not (prateritum.endswith('te') and partizip.endswith('t'))
        
        # Return formatted data
        return {
            "infinitive": verb,
            "english": english,
            "praeteritum": prateritum,
            "partizipII": partizip,
            "auxiliary": auxiliary,
            "level": "A2",  # Default level, can be adjusted later
            "praeteritumExample": prateritum_example,
            "partizipIIExample": partizip_example,
            "source": {
                "name": "Reverso",
                "levelReference": "Auto-generated using Reverso API"
            },
            "pattern": {
                "type": "ablaut" if is_irregular else "regular",
                "group": None
            }
        }
    except Exception as e:
        print(f"Error processing verb {verb}: {str(e)}", file=sys.stderr)
        return None

# List of basic German verbs to start with
BASIC_VERBS = [
    "sein", "haben", "werden", "können", "müssen", "sagen", "gehen", "kommen",
    "machen", "geben", "wissen", "sehen", "wollen", "arbeiten", "spielen",
    "lernen", "leben", "glauben", "halten", "lassen", "sprechen"
]

try:
    results = []
    for verb in BASIC_VERBS:
        details = get_verb_details(verb)
        if details:
            results.append(details)
        time.sleep(1)  # Be nice to the API
    
    print(json.dumps(results))
except Exception as e:
    print(f"Error: {str(e)}", file=sys.stderr)
    sys.exit(1)
`;

async function readReversoData(): Promise<any[]> {
  return new Promise((resolve, reject) => {
    // Create a temporary Python script
    const tempScript = '/tmp/fetch_reverso.py';
    writeFile(tempScript, PYTHON_SCRIPT, 'utf8')
      .catch(err => {
        console.error('Error writing temp script:', err);
        reject(err);
      });

    const process = spawn('python3', [tempScript]);
    let output = '';
    let error = '';

    process.stdout.on('data', (data) => {
      output += data.toString();
    });

    process.stderr.on('data', (data) => {
      error += data.toString();
    });

    process.on('close', (code) => {
      if (code !== 0) {
        console.error('Python process error:', error);
        reject(new Error(`Failed to fetch verb data: ${error}`));
      } else {
        try {
          const verbsData = JSON.parse(output);
          resolve(verbsData);
        } catch (e) {
          reject(e);
        }
      }
    });
  });
}

async function importVerbs() {
  try {
    console.log('Starting verb import from Reverso...');

    const verbsData = await readReversoData();
    console.log(`Fetched ${verbsData.length} verbs from Reverso`);

    // Clear existing verbs that were auto-imported from Reverso
    await db
      .delete(words)
      .where(and(eq(words.pos, 'V'), eq(words.sourcesCsv, 'Reverso')));
    console.log('Cleared existing Reverso-imported verbs');

    let imported = 0;
    let skipped = 0;

    for (const verb of verbsData) {
      try {
        // Skip if required fields are missing
        if (!verb.infinitive || !verb.praeteritum || !verb.partizipII) {
          console.log(`Skipping verb due to missing required fields:`, verb);
          skipped++;
          continue;
        }

        const tags = [verb.pattern?.type, verb.pattern?.group].filter(
          (value): value is string => Boolean(value),
        );

        await db
          .insert(words)
          .values({
            lemma: verb.infinitive,
            pos: 'V',
            english: verb.english,
            praeteritum: verb.praeteritum,
            partizipIi: verb.partizipII,
            aux: verb.auxiliary,
            level: verb.level,
            examples: [
              { exampleDe: verb.praeteritumExample },
              { exampleDe: verb.partizipIIExample },
            ],
            approved: true,
            complete: false,
            sourcesCsv: 'Reverso',
            sourceNotes: 'Auto-generated using Reverso API',
            posAttributes: tags.length ? { tags } : null,
          })
          .onConflictDoNothing({ target: [words.lemma, words.pos] });

        imported++;
        if (imported % 5 === 0) {
          console.log(`Imported ${imported} verbs...`);
        }
      } catch (error) {
        console.error(`Error importing verb ${verb?.infinitive}:`, error);
      }
    }

    console.log(`Successfully imported ${imported} verbs (skipped ${skipped})`);
  } catch (error) {
    console.error('Error in import process:', error);
    throw error;
  }
}

// Run the import
importVerbs().catch(console.error);
