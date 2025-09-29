import { writeFile } from 'fs/promises';
import { db } from "@db";
import { verbs } from "@db/schema";
import { spawn } from 'child_process';
import { sql } from 'drizzle-orm';

// Python script to read pickle file and output JSON
const PYTHON_SCRIPT = `
import pandas as pd
import json
import sys

try:
    # Read the pickle file
    df = pd.read_pickle('attached_assets/Final_German_Verbs.pkl')

    # Rename columns to match our schema
    df = df.rename(columns={
        'Infinitiv': 'infinitive',
        'Praeteritum': 'praeteritum',
        'Partizip II': 'partizipII',
        'English Meaning': 'english',
        'Auxiliary Verb': 'auxiliary',
        'Regel/Unregel': 'isIrregular'
    })

    # Clean up the data
    df['isIrregular'] = df['isIrregular'].map({'unregel': True, 'regel': False})

    # Fill NaN values with appropriate defaults
    df = df.fillna({
        'infinitive': '',
        'praeteritum': '',
        'partizipII': '',
        'english': '',
        'auxiliary': 'haben',
        'isIrregular': False,
        'level': 'A2'
    })

    # Filter out rows with empty required fields
    df = df[
        (df['infinitive'].str.len() > 0) &
        (df['praeteritum'].str.len() > 0) &
        (df['partizipII'].str.len() > 0)
    ]

    # Convert to dictionary format
    verbs_data = df.to_dict('records')

    # Convert to JSON with NaN handling
    class NaNEncoder(json.JSONEncoder):
        def default(self, obj):
            import numpy as np
            if isinstance(obj, (np.floating, float)) and np.isnan(obj):
                return None
            return super().default(obj)

    print(json.dumps(verbs_data, cls=NaNEncoder))
except Exception as e:
    print(f"Error processing pickle file: {str(e)}", file=sys.stderr)
    sys.exit(1)
`;

async function readPickleFile(): Promise<any[]> {
  return new Promise((resolve, reject) => {
    // Create a temporary Python script
    const tempScript = '/tmp/read_pickle.py';
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