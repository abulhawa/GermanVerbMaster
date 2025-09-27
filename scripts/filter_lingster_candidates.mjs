import fs from 'fs';
import path from 'path';

const outputDir = path.join('docs', 'verb-corpus');
const shortlistPath = path.join(outputDir, 'cefr-verb-shortlist.csv');
const lingsterPath = path.join(outputDir, 'lingster-verb-candidates.csv');
if (!fs.existsSync(lingsterPath)) {
  console.error('Missing lingster-verb-candidates.csv; run generate_cefr_shortlist.mjs first.');
  process.exit(1);
}
const known = new Set(
  fs.readFileSync(shortlistPath, 'utf8')
    .trim()
    .split(/\r?\n/)
    .slice(1)
    .map((line) => line.split(',')[1])
);
const lingster = fs
  .readFileSync(lingsterPath, 'utf8')
  .trim()
  .split(/\r?\n/)
  .slice(1);
const verified = [];
const outliers = [];
for (const verb of lingster) {
  if (known.has(verb)) {
    verified.push(verb);
  } else {
    outliers.push(verb);
  }
}
const header = 'infinitive\n';
fs.writeFileSync(path.join(outputDir, 'lingster-verb-verified.csv'), header + verified.join('\n') + '\n');
fs.writeFileSync(path.join(outputDir, 'lingster-verb-outliers.csv'), header + outliers.join('\n') + '\n');
console.error('Lingster stats', { total: lingster.length, verified: verified.length, outliers: outliers.length });