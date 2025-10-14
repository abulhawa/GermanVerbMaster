import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parse } from 'csv-parse/sync';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const LEVEL_ORDER = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'];
const DEFAULT_CANONICAL_PATH = path.resolve(__dirname, '..', 'data', 'legacy', 'verbs_canonical.csv');
const DEFAULT_OUTPUT_DIR = path.resolve(__dirname, '..', 'data', 'generated');

function normaliseHeader(header) {
  switch (header) {
    case 'präteritum':
      return 'praeteritum';
    case 'präteritumExample':
      return 'praeteritumExample';
    case 'partizipIIExample':
      return 'partizipIIExample';
    case 'source_name':
      return 'sourceName';
    case 'source_levelReference':
      return 'sourceLevelReference';
    case 'pattern_type':
      return 'patternType';
    case 'pattern_group':
      return 'patternGroup';
    default:
      return header;
  }
}

function levelSorter(a, b) {
  const levelIndexA = LEVEL_ORDER.indexOf(a.level);
  const levelIndexB = LEVEL_ORDER.indexOf(b.level);
  if (levelIndexA !== levelIndexB) {
    return levelIndexA - levelIndexB;
  }
  return a.infinitive.localeCompare(b.infinitive, 'de');
}

function toVerb(record) {
  const requiredFields = [
    'infinitive',
    'english',
    'praeteritum',
    'partizipII',
    'auxiliary',
    'level',
    'praeteritumExample',
    'partizipIIExample',
    'sourceName',
    'sourceLevelReference',
  ];

  for (const field of requiredFields) {
    if (!record[field] || !String(record[field]).trim()) {
      throw new Error(`Missing required field "${field}" for verb ${record.infinitive ?? 'unknown'}`);
    }
  }

  const auxiliary = String(record.auxiliary).trim();
  if (auxiliary !== 'haben' && auxiliary !== 'sein') {
    throw new Error(`Invalid auxiliary "${auxiliary}" for verb ${record.infinitive}`);
  }

  const level = String(record.level).trim().toUpperCase();
  if (!LEVEL_ORDER.includes(level)) {
    throw new Error(`Invalid level "${record.level}" for verb ${record.infinitive}`);
  }

  const patternType = record.patternType ? String(record.patternType).trim() : '';
  const patternGroup = record.patternGroup ? String(record.patternGroup).trim() : '';
  const pattern = patternType
    ? {
        type: patternType,
        ...(patternGroup ? { group: patternGroup } : {}),
      }
    : null;

  return {
    infinitive: String(record.infinitive).trim(),
    english: String(record.english).trim(),
    ['präteritum']: String(record.praeteritum).trim(),
    partizipII: String(record.partizipII).trim(),
    auxiliary,
    level,
    ['präteritumExample']: String(record.praeteritumExample).trim(),
    ['partizipIIExample']: String(record.partizipIIExample).trim(),
    source: {
      name: String(record.sourceName).trim(),
      levelReference: String(record.sourceLevelReference).trim(),
    },
    pattern,
  };
}

async function cleanupStaleLevelFiles(outputDir, writtenFiles) {
  try {
    const files = await fs.readdir(outputDir);
    const keep = new Set(writtenFiles.map((file) => path.basename(file)));
    for (const file of files) {
      if (file.startsWith('verbs.') && file.endsWith('.json') && !keep.has(file)) {
        await fs.rm(path.join(outputDir, file));
      }
    }
  } catch (error) {
    if ((error && error.code) !== 'ENOENT') {
      throw error;
    }
  }
}

export async function loadCanonicalRecords(canonicalPath = DEFAULT_CANONICAL_PATH) {
  const csv = await fs.readFile(canonicalPath, 'utf8');
  const records = parse(csv, {
    columns: (header) => header.map(normaliseHeader),
    skip_empty_lines: true,
    trim: true,
  });
  return records;
}

export async function buildVerbArtifacts({
  canonicalPath = DEFAULT_CANONICAL_PATH,
  outputDir = DEFAULT_OUTPUT_DIR,
} = {}) {
  const records = await loadCanonicalRecords(canonicalPath);
  const verbs = records.map(toVerb).sort(levelSorter);

  await fs.mkdir(outputDir, { recursive: true });

  const levelFiles = [];
  const verbsByLevel = new Map();

  for (const level of LEVEL_ORDER) {
    verbsByLevel.set(level, []);
  }

  for (const verb of verbs) {
    verbsByLevel.get(verb.level).push(verb);
  }

  for (const level of LEVEL_ORDER) {
    const list = verbsByLevel.get(level);
    if (!list.length) continue;
    const filePath = path.join(outputDir, `verbs.${level}.json`);
    await fs.writeFile(filePath, JSON.stringify(list, null, 2));
    levelFiles.push(filePath);
  }

  const seedPath = path.join(outputDir, 'verbs.seed.json');
  await fs.writeFile(seedPath, JSON.stringify(verbs, null, 2));

  await cleanupStaleLevelFiles(outputDir, [...levelFiles, seedPath]);

  return {
    verbs,
    levelFiles,
    seedPath,
  };
}

async function main() {
  const { verbs, levelFiles, seedPath } = await buildVerbArtifacts();
  console.log(`Generated ${verbs.length} verbs`);
  console.log(`Seed payload: ${seedPath}`);
  for (const file of levelFiles) {
    console.log(`Level bundle: ${file}`);
  }
}

if (process.argv[1]) {
  const invokedUrl = pathToFileURL(process.argv[1]).href;
  if (import.meta.url === invokedUrl) {
    main().catch((error) => {
      console.error('Failed to build verb artifacts', error);
      process.exit(1);
    });
  }
}
