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
  return /[a-zäöüß]+$/i.test(word);
}

function parseCsvLine(line) {
  const result = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      result.push(current);
      current = "";
    } else {
      current += char;
    }
  }
  result.push(current);
  return result;
}

function parseCsvFile(filePath) {
  const raw = fs.readFileSync(filePath, "utf8");
  const lines = raw.split(/\r?\n/).filter((line) => line.trim().length > 0);
  if (lines.length === 0) {
    return [];
  }
  const headers = parseCsvLine(lines[0]).map((header) => header.trim());
  return lines.slice(1).map((line) => {
    const values = parseCsvLine(line);
    const entry = {};
    headers.forEach((header, index) => {
      entry[header] = values[index] ? values[index].trim() : "";
    });
    return entry;
  });
}

function addRow(level, infinitive, sourceId, sourceName, sourceUrl, license, notes = "") {
  if (!level || !infinitive) return;
  if (!looksLikeInfinitive(infinitive)) return;
  const key = `${level}|${infinitive}|${sourceId}`;
  if (seen.has(key)) return;
  seen.add(key);
  rows.push({ level, infinitive, source_id: sourceId, source_name: sourceName, source_url: sourceUrl, license, notes });
}

const dwdsSources = [
  { level: "A1", filename: "dwds-goethe-A1.csv", sourceId: "dwds_goethe_a1", sourceName: "DWDS Goethe-Zertifikat A1", apiUrl: "https://www.dwds.de/api/lemma/goethe/A1.csv" },
  { level: "A2", filename: "dwds-goethe-A2.csv", sourceId: "dwds_goethe_a2", sourceName: "DWDS Goethe-Zertifikat A2", apiUrl: "https://www.dwds.de/api/lemma/goethe/A2.csv" },
  { level: "B1", filename: "dwds-goethe-B1.csv", sourceId: "dwds_goethe_b1", sourceName: "DWDS Goethe-Zertifikat B1", apiUrl: "https://www.dwds.de/api/lemma/goethe/B1.csv" }
];

for (const { level, filename, sourceId, sourceName, apiUrl } of dwdsSources) {
  const filePath = path.join(externalDir, filename);
  if (!fs.existsSync(filePath)) continue;
  const entries = parseCsvFile(filePath);
  for (const entry of entries) {
    const lemma = normalizeWhitespace(entry.Lemma ?? "");
    if (!lemma) continue;
    const pos = normalizeWhitespace(entry.Wortart ?? "");
    if (!pos.includes("Verb")) continue;
    const infinitive = lemma.toLowerCase();
    addRow(level, infinitive, sourceId, sourceName, apiUrl, "DWDS terms (attribution required)", `POS: ${pos}`);
  }
}

rows.sort((a, b) => {
  if (a.level === b.level) {
    return a.infinitive.localeCompare(b.infinitive, "de");
  }
  return a.level.localeCompare(b.level);
});

const header = ["level", "infinitive", "source_id", "source_name", "source_url", "license", "notes"];
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

const summaryLevels = ["A1", "A2", "B1", "B2", "C1", "C2"];
const summary = Object.fromEntries(summaryLevels.map((level) => [level, 0]));
for (const row of rows) {
  if (summary[row.level] !== undefined) {
    summary[row.level] += 1;
  }
}
fs.writeFileSync(path.join(outputDir, "cefr-verb-shortlist-summary.json"), JSON.stringify(summary, null, 2));
