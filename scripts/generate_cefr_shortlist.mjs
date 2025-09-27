import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const repoRoot = path.resolve(__dirname, "..");
const externalDir = path.join(repoRoot, "docs", "external");
const outputDir = path.join(repoRoot, "docs", "verb-corpus");
fs.mkdirSync(outputDir, { recursive: true });

const rows = [];
const seen = new Set();

function normalizeWhitespace(value) {
  return value.replace(/[\u00A0\s]+/g, " ").trim();
}

function looksLikeInfinitive(word) {
  if (!word) return false;
  const compact = word.replace(/\s+/g, "");
  return compact.endsWith("n");
}

function addRow(level, infinitive, sourceId, sourceName, sourceUrl, license, notes = "") {
  if (!level || !infinitive) return;
  if (!looksLikeInfinitive(infinitive)) return;
  const key = `${level}|${infinitive}|${sourceId}`;
  if (seen.has(key)) return;
  seen.add(key);
  rows.push({ level, infinitive, source_id: sourceId, source_name: sourceName, source_url: sourceUrl, license, notes });
}

const goetheA1Path = path.join(externalDir, "Goethe_A1_Wordlist.csv");
if (fs.existsSync(goetheA1Path)) {
  const raw = fs.readFileSync(goetheA1Path, "utf8");
  const lines = raw.split(/\r?\n/);
  for (const line of lines) {
    if (!line.trim()) continue;
    const parts = line.split("\t");
    if (parts.length < 4) continue;
    const germanRaw = parts[1]?.trim();
    const englishRaw = parts[3]?.trim();
    if (!germanRaw || !englishRaw) continue;
    const english = normalizeWhitespace(englishRaw).toLowerCase();
    if (!english.startsWith("to ")) continue;
    const infinitive = normalizeWhitespace(germanRaw.replace(/,.*$/, "")).toLowerCase();
    addRow("A1", infinitive, "goethe_a1_2018", "Goethe-Zertifikat A1 Wortliste (2018)", "https://raw.githubusercontent.com/harrymatthews50/ich_lerne_deutsch/main/data/Goethe_A1_Wordlist.csv", "MIT", "Derived from Goethe official vocabulary export");
  }
}

const cukowskiSources = [
  { level: "A1", filename: "wordsA1.txt" },
  { level: "A2", filename: "wordsA2.txt" },
  { level: "B1", filename: "wordsB1.txt" },
  { level: "B2", filename: "wordsB2.txt" }
];

for (const { level, filename } of cukowskiSources) {
  const filePath = path.join(externalDir, filename);
  if (!fs.existsSync(filePath)) continue;
  const raw = fs.readFileSync(filePath, "utf8");
  const lines = raw.split(/\r?\n/);
  for (const line of lines) {
    if (!line.includes("|")) continue;
    const parts = line.split("|");
    if (parts.length < 4) continue;
    const pos = parts[1]?.trim();
    if (pos !== "Infinitiv") continue;
    const infinitive = parts[0]?.trim().toLowerCase();
    addRow(level, infinitive, `cukowski_${filename}`, "GermanWordListByLevel", "https://github.com/Cukowski/GermanWordListByLevel", "Unknown", "Needs license confirmation");
  }
}

rows.sort((a, b) => a.level.localeCompare(b.level) || a.infinitive.localeCompare(b.infinitive));

const header = ["level","infinitive","source_id","source_name","source_url","license","notes"];
const csvLines = [header.join(",")];
for (const row of rows) {
  const values = header.map((key) => {
    const value = row[key] ?? "";
    if (/[",\n]/.test(value)) {
      return `"${value.replace(/"/g, '""')}"`;
    }
    return value;
  });
  csvLines.push(values.join(","));
}

fs.writeFileSync(path.join(outputDir, "cefr-verb-shortlist.csv"), csvLines.join("\n"));

const summaryLevels = ["A1","A2","B1","B2","C1","C2"];
const summary = Object.fromEntries(summaryLevels.map((level) => [level, 0]));
for (const row of rows) {
  if (summary[row.level] !== undefined) {
    summary[row.level] += 1;
  }
}
fs.writeFileSync(path.join(outputDir, "cefr-verb-shortlist-summary.json"), JSON.stringify(summary, null, 2));
