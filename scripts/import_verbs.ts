import { access, writeFile } from 'fs/promises';
import { db } from "@db";
import { verbs } from "@db/schema";
import { spawn } from 'child_process';
import { sql } from 'drizzle-orm';
import { tmpdir } from 'os';
import path from 'path';

const PICKLE_PATH = 'attached_assets/Final_German_Verbs.pkl';

function createPythonScript(picklePath: string): string {
  const encodedPath = JSON.stringify(picklePath);
  return `import pandas as pd\nimport json\nimport sys\n\ntry:\n    # Read the pickle file\n    df = pd.read_pickle(${encodedPath})\n\n    # Rename columns to match our schema\n    df = df.rename(columns={\n        'Infinitiv': 'infinitive',\n        'Praeteritum': 'praeteritum',\n        'Partizip II': 'partizipII',\n        'English Meaning': 'english',\n        'Auxiliary Verb': 'auxiliary',\n        'Regel/Unregel': 'isIrregular'\n    })\n\n    # Clean up the data\n    df['isIrregular'] = df['isIrregular'].map({'unregel': True, 'regel': False})\n\n    # Fill NaN values with appropriate defaults\n    df = df.fillna({\n        'infinitive': '',\n        'praeteritum': '',\n        'partizipII': '',\n        'english': '',\n        'auxiliary': 'haben',\n        'isIrregular': False,\n        'level': 'A2'\n    })\n\n    # Filter out rows with empty required fields\n    df = df[\n        (df['infinitive'].str.len() > 0) &\n        (df['praeteritum'].str.len() > 0) &\n        (df['partizipII'].str.len() > 0)\n    ]\n\n    # Convert to dictionary format\n    verbs_data = df.to_dict('records')\n\n    # Convert to JSON with NaN handling\n    class NaNEncoder(json.JSONEncoder):\n        def default(self, obj):\n            import numpy as np\n            if isinstance(obj, (np.floating, float)) and np.isnan(obj):\n                return None\n            return super().default(obj)\n\n    print(json.dumps(verbs_data, cls=NaNEncoder))\nexcept Exception as e:\n    print(f"Error processing pickle file: {str(e)}", file=sys.stderr)\n    sys.exit(1)\n`;
}

async function ensurePickleAsset(picklePath: string): Promise<void> {
  try {
    await access(picklePath);
  } catch {
    throw new Error(
      `Missing verb dataset at "${picklePath}". Copy the pickle asset into attached_assets/ (see attached_assets/README.md).`,
    );
  }
}

async function readPickleFile(picklePath = PICKLE_PATH): Promise<any[]> {
  await ensurePickleAsset(picklePath);
  const tempScript = path.join(tmpdir(), 'read_pickle.py');
  await writeFile(tempScript, createPythonScript(picklePath), 'utf8');

  return new Promise((resolve, reject) => {
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
        reject(new Error(`Failed to read pickle file: ${error}`));
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

function determineLevel(verb: any): 'A1' | 'A2' | 'B1' | 'B2' | 'C1' | 'C2' {
  // If level is already set and valid, use it
  const validLevels = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'];
  if (verb.level && validLevels.includes(verb.level)) {
    return verb.level as any;
  }

  // Determine level based on irregular status and common verbs
  const commonA1Verbs = ['sein', 'haben', 'werden', 'gehen', 'kommen', 'machen', 'spielen', 'lernen'];
  const commonA2Verbs = ['laufen', 'fahren', 'fliegen', 'schwimmen', 'tanzen', 'kochen'];

  if (commonA1Verbs.includes(verb.infinitive)) return 'A1';
  if (commonA2Verbs.includes(verb.infinitive)) return 'A2';

  // Higher levels for irregular verbs
  if (verb.isIrregular) return 'B1';

  return 'A2'; // Default to A2 for regular verbs
}

function detectPattern(verb: any): { type: string, group?: string } | null {
  if (!verb.infinitive || !verb.praeteritum || !verb.partizipII) {
    return null;
  }

  // Return pattern based on irregular status
  if (verb.isIrregular) {
    let group = "other irregular";
    // Detect common ablaut patterns
    const forms = `${verb.infinitive}->${verb.praeteritum}->${verb.partizipII}`;
    if (forms.match(/e.*->a.*->o.*/)) group = "e -> a -> o";
    else if (forms.match(/ei.*->ie.*->ie.*/)) group = "ei -> ie -> ie";
    else if (forms.match(/i.*->a.*->u.*/)) group = "i -> a -> u";

    return { type: "ablaut", group };
  }

  return null;
}

async function importVerbs() {
  try {
    console.log('Starting verb import process...');

    const verbsData = await readPickleFile();
    console.log(`Read ${verbsData.length} verbs from pickle file`);
    console.log('Sample verb data:', JSON.stringify(verbsData[0], null, 2));

    // Clear existing verbs that were auto-imported
    await db.delete(verbs).where(sql`json_extract(${verbs.source}, '$.name') = 'German_Verbs_Dataset'`);
    console.log('Cleared existing imported verbs');

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

        const level = determineLevel(verb);
        const pattern = detectPattern(verb);

        await db.insert(verbs).values({
          infinitive: verb.infinitive,
          english: verb.english || `to ${verb.infinitive}`,
          praeteritum: verb.praeteritum,
          partizipIi: verb.partizipII,
          auxiliary: verb.auxiliary || 'haben',
          level,
          praeteritumExample: `Er ${verb.praeteritum} gestern.`,
          partizipIiExample: `Sie ${verb.auxiliary || 'haben'} heute ${verb.partizipII}.`,
          source: {
            name: "German_Verbs_Dataset",
            levelReference: "Automatically categorized based on verb properties"
          },
          pattern: pattern
        }).onConflictDoNothing();

        imported++;
        if (imported % 100 === 0) {
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